import { claveDe, type DatosDePrecios, type FuenteDatosPrecios, type ItemDePrecio } from "@/datos/precios/contrato";
import { campaniaProvisoria } from "@/datos/supabase/campania-provisoria";
import { ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import {
  booleano,
  cadena,
  filas,
  numero,
  type Objeto,
  RespuestaInesperada,
} from "@/datos/supabase/respuesta";

/**
 * Fuente de la vista 27 (HU-CAT-005) contra las RPC de Supabase (ADR-013): `campanias_del_coordinador()`,
 * `ciudades_de_campania()` y `precios_de_la_ciudad()` (backend-supabase#84; 0037, 0057 y 0071), una llamada por ciudad de la
 * campaña. Habla con un `ClienteRpc`, o sea con el JWT del coordinador.
 *
 * - El catálogo y el precio general no dependen de la ciudad: salen de la primera; las excepciones, de `precio_modificado` de
 *   cada una. Importes en centavos en la base, pesos enteros acá.
 * - **Lo que la lectura todavía no trae** y por eso queda sin cargar: el tipo del producto (libro, revista…), si es
 *   misionero y el código del editor. La vista agrupa esos productos como «Productos» y deja el código en blanco. Ver los
 *   pendientes del PR.
 * - **No hay RPC de escritura de excepciones**: hoy son políticas sobre las tablas y ADR-013 no deja que un cliente las use.
 *   `guardarPrecios` contesta un rechazo con su texto en vez de afirmar que guardó (la vista deja los cambios marcados).
 * - Una falla de conexión, de servicio o de sesión no es un rechazo y sale como excepción: **ninguna falla se toma por una
 *   lista vacía.** La campaña que terminó o se dio de baja entre dos llamadas (`CZ001`, `CZ011`) es «sin campaña».
 */

const SIN_ESCRITURA =
  "Por ahora el panel no puede guardar precios en la base de datos, así que este cambio no se guardó. Tus cambios siguen marcados.";

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

function aItem(fila: Objeto): ItemDePrecio {
  const rpc = "precios_de_la_ciudad";
  const tipo = cadena(rpc, fila, "tipo");
  if (tipo !== "PRODUCTO" && tipo !== "COLECCION") throw new RespuestaInesperada(rpc, `\`tipo\` no es PRODUCTO ni COLECCION (${tipo})`);
  const id = cadena(rpc, fila, "id");
  return {
    clave: claveDe(tipo, id),
    tipo,
    id,
    nombre: cadena(rpc, fila, "nombre"),
    codigo: null,
    tipoDeProducto: null,
    // Una colección trae `es_bonificable` en null: no lo es.
    esBonificable: tipo === "PRODUCTO" && fila.es_bonificable !== null && fila.es_bonificable !== undefined ? booleano(rpc, fila, "es_bonificable") : false,
    esMisionero: false,
    detalle: tipo === "COLECCION" ? textoDeLibrosAElegir(enteroONulo(rpc, fila, "libros_a_elegir")) : null,
    componentesDeBaja: enteroONulo(rpc, fila, "componentes_de_baja") ?? 0,
    precioGeneral: pesos(rpc, fila, "precio_general"),
  };
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

    async guardarPrecios() {
      return { ok: false, causa: "rechazado", mensaje: SIN_ESCRITURA };
    },
  };
}

