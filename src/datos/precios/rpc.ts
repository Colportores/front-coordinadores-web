import {
  claveDe,
  type CambioDePrecio,
  type CategoriaDeProducto,
  type DatosDePrecios,
  type FuenteDatosPrecios,
  type ItemDePrecio,
  type ResultadoDeGuardado,
} from "@/datos/precios/contrato";
import { campaniaProvisoria } from "@/datos/supabase/campania-provisoria";
import { causaDe, ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import {
  booleano,
  cadena,
  cadenaONula,
  filas,
  numero,
  type Objeto,
  RespuestaInesperada,
  UUID,
} from "@/datos/supabase/respuesta";
import { MENSAJE_SESION_VENCIDA } from "@/lib/mensajes";

/**
 * Fuente de la vista 27 (HU-CAT-005) contra las RPC de Supabase (ADR-013): `campanias_del_coordinador()`,
 * `ciudades_de_campania()` y `precios_de_la_ciudad()` (backend-supabase#84; 0037, 0057, 0071 y 0171), una llamada por ciudad de
 * la campaña, y escribe con `guardar_precios_de_la_ciudad()` (0170, backend-supabase#248). Habla con un `ClienteRpc`, o sea con
 * el JWT del coordinador.
 *
 * - El catálogo y el precio general no dependen de la ciudad: salen de la primera; las excepciones, de `precio_modificado` de
 *   cada una. Importes en centavos en la base, pesos enteros acá.
 * - La `categoria` del producto (0149) decide el grupo de la tabla (BONIFICABLES, MISIONEROS y ESPIRITUALES = Libros) y la
 *   insignia «Misionero» (`categoria = 'MISIONEROS'`); `codigo_editor` es el código. Una colección trae las dos en null.
 * - **`guardarPrecios` manda solo lo que cambió** en una llamada, todo o nada (un error no guardó NADA). Los rechazos de la regla
 *   (`PP001`…`PP005`, `CZ001`, `CZ012`, `42501`) vuelven como resultado con el texto de la base, que ya dice qué hacer; la
 *   sesión vencida vuelve como `sesionVencida` (el texto de una excepción no sale del servidor en producción, #41 P3); una caída
 *   de red o un 5xx se relanzan: nunca se afirma que se guardó.
 * - Una falla de conexión, de servicio o de sesión no es un rechazo y sale como excepción: **ninguna falla se toma por una
 *   lista vacía.** La campaña que terminó o se dio de baja entre dos llamadas (`CZ001`, `CZ011`) es «sin campaña».
 */

/** Lo que dice la vista cuando la base rechazó el guardado sin un texto propio. Los cambios siguen marcados. */
const GUARDADO_RECHAZADO = "No se pudieron guardar los precios. Tus cambios siguen marcados: probá de nuevo más tarde.";
const CAMBIOS_INVALIDOS = "Algún precio no es válido. Revisá los cambios marcados.";
const SIN_PERMISO = "Solo el coordinador de la campaña puede cambiar sus precios. Entrá con la cuenta del coordinador de esta campaña.";
const CIUDAD_INVALIDA = "La ciudad no está en la campaña. Recargá la página y volvé a elegir.";

/** Lo que la RPC `guardar_precios_de_la_ciudad` rechaza con un texto escrito para mostrar (0170). El `42501` (permiso) lleva el nuestro: PostgREST también lo usa para un "permission denied" técnico. */
const RECHAZOS_CON_TEXTO = new Set(["CZ001", "CZ012", "PP001", "PP002", "PP003", "PP004", "PP005"]);

/** Tope de `guardar_precios_de_la_ciudad`: un precio es un entero de hasta 2147483647 centavos. */
const MAX_CENTAVOS = 2_147_483_647;

const CATEGORIAS: ReadonlySet<string> = new Set<CategoriaDeProducto>(["BONIFICABLES", "MISIONEROS", "ESPIRITUALES", "REVISTAS", "MATERIAL"]);

function campaniaYaNoVigente(error: unknown): boolean {
  return error instanceof ErrorSupabase && (error.codigo === "CZ001" || error.codigo === "CZ011");
}

/** Centavos → pesos enteros. Un importe con centavos no es de esta vista (no admite centavos): se frena en vez de redondearlo. */
function pesos(rpc: string, fila: Objeto, campo: string): number | null {
  if (fila[campo] === null || fila[campo] === undefined) return null;
  const centavos = numero(rpc, fila, campo);
  if (!Number.isInteger(centavos) || centavos % 100 !== 0) throw new RespuestaInesperada(rpc, `\`${campo}\` no es un número entero de pesos (${centavos} centavos)`);
  return centavos / 100;
}

function enteroONulo(rpc: string, fila: Objeto, campo: string): number | null {
  return fila[campo] === null || fila[campo] === undefined ? null : numero(rpc, fila, campo);
}

function textoDeLibrosAElegir(n: number | null): string | null {
  if (n === null || n <= 0) return null;
  return n === 1 ? "1 libro a elegir" : `${n} libros a elegir`;
}

/** La categoría de un producto. Una que no se conoce se frena en vez de adivinar el grupo. */
function categoriaDe(rpc: string, fila: Objeto): CategoriaDeProducto | null {
  const categoria = cadenaONula(rpc, fila, "categoria");
  if (categoria === null) return null;
  if (!CATEGORIAS.has(categoria)) throw new RespuestaInesperada(rpc, `\`categoria\` no es una categoría conocida (${categoria})`);
  return categoria as CategoriaDeProducto;
}

function aItem(fila: Objeto): ItemDePrecio {
  const rpc = "precios_de_la_ciudad";
  const tipo = cadena(rpc, fila, "tipo");
  if (tipo !== "PRODUCTO" && tipo !== "COLECCION") throw new RespuestaInesperada(rpc, `\`tipo\` no es PRODUCTO ni COLECCION (${tipo})`);
  const id = cadena(rpc, fila, "id");
  const categoria = tipo === "PRODUCTO" ? categoriaDe(rpc, fila) : null;
  return {
    clave: claveDe(tipo, id),
    tipo,
    id,
    nombre: cadena(rpc, fila, "nombre"),
    // Una colección trae `codigo_editor` en null; un texto vacío no es un código.
    codigo: (tipo === "PRODUCTO" ? cadenaONula(rpc, fila, "codigo_editor") : null) || null,
    categoria,
    // Una colección trae `es_bonificable` en null: no lo es.
    esBonificable: tipo === "PRODUCTO" && fila.es_bonificable !== null && fila.es_bonificable !== undefined ? booleano(rpc, fila, "es_bonificable") : false,
    esMisionero: categoria === "MISIONEROS",
    detalle: tipo === "COLECCION" ? textoDeLibrosAElegir(enteroONulo(rpc, fila, "libros_a_elegir")) : null,
    componentesDeBaja: enteroONulo(rpc, fila, "componentes_de_baja") ?? 0,
    precioGeneral: pesos(rpc, fila, "precio_general"),
  };
}

/**
 * Los cambios de la vista (pesos enteros) como los pide la RPC (centavos). `null` si alguno no es de esta vista: un tipo raro, un
 * id que no es un uuid, un precio que no es un entero positivo, el mismo item dos veces o más de 500: se frena acá en vez de
 * mandarlo y que la base lo rechace.
 */
function aCambiosDeRpc(cambios: CambioDePrecio[]): { tipo: string; id: string; precio: number | null }[] | null {
  if (cambios.length === 0 || cambios.length > 500) return null;
  const vistos = new Set<string>();
  const salida: { tipo: string; id: string; precio: number | null }[] = [];
  for (const { tipo, id, precio } of cambios) {
    if (tipo !== "PRODUCTO" && tipo !== "COLECCION") return null;
    if (typeof id !== "string" || !UUID.test(id)) return null;
    const clave = claveDe(tipo, id.toLowerCase());
    if (vistos.has(clave)) return null;
    vistos.add(clave);
    if (precio !== null && (!Number.isSafeInteger(precio) || precio < 1 || precio * 100 > MAX_CENTAVOS)) return null;
    salida.push({ tipo, id, precio: precio === null ? null : precio * 100 });
  }
  return salida;
}

export function crearFuentePreciosRpc(
  cliente: ClienteRpc,
  campaniaElegida: () => Promise<string | null> = async () => null,
): FuenteDatosPrecios {
  return {
    async obtenerPrecios(): Promise<DatosDePrecios | null> {
      const campania = await campaniaProvisoria(cliente, await campaniaElegida());
      if (!campania) return null;

      try {
        const rpcCiudades = "ciudades_de_campania";
        const ciudades = filas(rpcCiudades, await cliente.llamarRpc(rpcCiudades, { p_campania_id: campania.id })).map((fila) => ({
          id: cadena(rpcCiudades, fila, "campania_ciudad_id"),
          nombre: cadena(rpcCiudades, fila, "nombre"),
        }));

        const lecturas = await Promise.all(
          ciudades.map(async (ciudad) => {
            const rpc = "precios_de_la_ciudad";
            return filas(rpc, await cliente.llamarRpc(rpc, { p_campania_ciudad_id: ciudad.id }));
          }),
        );

        const items = (lecturas[0] ?? []).map(aItem);
        const excepciones: DatosDePrecios["excepciones"] = {};
        ciudades.forEach((ciudad, i) => {
          const deLaCiudad: Record<string, number> = {};
          for (const fila of lecturas[i]) {
            const precio = pesos("precios_de_la_ciudad", fila, "precio_modificado");
            if (precio === null) continue;
            deLaCiudad[aItem(fila).clave] = precio;
          }
          excepciones[ciudad.id] = deLaCiudad;
        });

        return { campaniaId: campania.id, campaniaNombre: campania.nombre, items, ciudades, excepciones };
      } catch (error) {
        if (campaniaYaNoVigente(error)) return null;
        throw error;
      }
    },

    async guardarPrecios(_campaniaId, ciudadId, cambios): Promise<ResultadoDeGuardado> {
      // La ciudad y los ids vienen del navegador. La campaña no se manda: la RPC la saca de la ciudad y comprueba que sea de la
      // coordinadora (o ADMIN), así que una ciudad ajena vuelve como 42501.
      if (!UUID.test(ciudadId)) return { ok: false, causa: "rechazado", mensaje: CIUDAD_INVALIDA };
      const enviar = aCambiosDeRpc(cambios);
      if (!enviar) return { ok: false, causa: "rechazado", mensaje: CAMBIOS_INVALIDOS };

      try {
        await cliente.llamarRpc("guardar_precios_de_la_ciudad", { p_campania_ciudad_id: ciudadId, p_cambios: enviar });
        return { ok: true };
      } catch (error) {
        if (error instanceof ErrorSupabase && causaDe(error) === "rechazo") {
          if (error.codigo === "42501") return { ok: false, causa: "rechazado", mensaje: SIN_PERMISO };
          const propio = RECHAZOS_CON_TEXTO.has(error.codigo) && error.message.trim() !== "";
          return { ok: false, causa: "rechazado", mensaje: propio ? error.message : GUARDADO_RECHAZADO };
        }
        if (error instanceof ErrorSupabase && causaDe(error) === "sesion-vencida") {
          return { ok: false, causa: "rechazado", mensaje: MENSAJE_SESION_VENCIDA, sesionVencida: true };
        }
        // Sin red, 5xx o 429: no es un rechazo y no se sabe si se guardó. Sale como excepción; reintentar es seguro (lo igual al
        // vigente vuelve como SIN_CAMBIO).
        throw error;
      }
    },
  };
}

