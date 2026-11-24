import type {
  AccionesPedidos,
  CantidadAutorizada,
  CiudadDePedidos,
  CuentaDelColportor,
  DatosDePedidos,
  DecisionDeSolicitud,
  EstadoDePedido,
  EstadoDeTransferencia,
  FuenteDatosPedidos,
  LineaDeTransferencia,
  LineaDeUnPedido,
  PedidoDeColportor,
  ResultadoDeAccion,
  SolicitudResuelta,
  TransferenciaDeStock,
} from "@/datos/stock/pedidos/contrato";
import { LIMITE_DE_DEUDA_MAXIMO } from "@/datos/stock/pedidos/contrato";
import { campaniaProvisoria } from "@/datos/supabase/campania-provisoria";
import { causaDe, ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import { llamarRpcPorPaginas } from "@/datos/supabase/paginas";
import { cadena, cadenaONula, filas, nombreVisible, numero, type Objeto, RespuestaInesperada, UUID } from "@/datos/supabase/respuesta";
import { hoyEnMontevideo } from "@/lib/dias";
import { MENSAJE_SESION_VENCIDA } from "@/lib/mensajes";

/**
 * Pedidos y transferencias (vista 35, HU-STK-003 · HU-STK-005, front-coordinadores-web#215) contra las RPC de la bandeja
 * (ADR-013): `pedidos_de_campania` / `pedido_lineas` / `pedido_contexto` (0112, 0130, 0198) y `transferencias_de_campania` /
 * `transferencia_lineas` (0126, 0140, 0198), más `ciudades_de_campania` para las ciudades. Los montos llegan en centavos y la
 * vista los muestra en pesos.
 *
 * Lectura: la bandeja es de la campaña elegida en el topbar (#70). Cada pedido y cada transferencia pide su detalle (líneas y
 * cuenta del colportor) con una llamada propia, de a `DETALLES_A_LA_VEZ`: la base no trae el detalle en lote. Un detalle que la
 * base rechaza (el pedido ya no existe, ya no se puede ver) deja ese ítem afuera de la lista; una caída de la red, un 5xx o un 429
 * siguen como excepción (la página muestra «Reintentar»): nunca una lista a medias como si estuviera completa.
 *
 * El límite de deuda de la campaña NO se lee: ninguna RPC se lo da al panel (`campanias_del_coordinador` y la bandeja no lo
 * traen, y ADR-013 no deja leer tablas). La fuente lo dice con `limiteSinLeer` y la vista no afirma «sin límite» (pendiente P1).
 *
 * Escrituras: `autorizar_pedido` (con las cantidades de «Reducir»), `rechazar_pedido`, `autorizar_transferencia`,
 * `rechazar_transferencia` y `definir_limite_de_deuda_de_campania`. Un rechazo de la regla vuelve con su texto (el `message` de la
 * base ya está escrito para la persona); la sesión vencida vuelve como resultado, con su aviso (#41); una caída de la red, un 5xx
 * o un 429 siguen como excepción, que la vista muestra como «sin conexión».
 */

/** PostgREST corta toda respuesta en 1000 filas sin avisar (`max_rows`): una lista que llega ahí puede estar incompleta. */
export const FILAS_MAXIMAS = 1000;

/** Cuántos detalles (un pedido o una transferencia con sus llamadas) se piden a la vez. */
export const DETALLES_A_LA_VEZ = 6;

/** Lo que va en el título de la fila si la cuenta no tiene nombre ni apellido. */
const CUENTA_SIN_NOMBRE = "Colportor sin nombre";

const MAX_MOTIVO = 500;

const ESTADOS_DE_PEDIDO: Readonly<Record<string, EstadoDePedido>> = {
  PENDIENTE_AUTORIZACION: "POR_AUTORIZAR",
  AUTORIZADO: "AUTORIZADO",
  DESPACHADO: "DESPACHADO",
  RECIBIDO: "RECIBIDO",
  RECHAZADO: "RECHAZADO",
};

/** `EJECUTADO` queda sin uso en la base (autorizar ya ejecuta); el contrato del panel lo junta con `AUTORIZADO` en «Autorizada». */
const ESTADOS_DE_TRANSFERENCIA: Readonly<Record<string, EstadoDeTransferencia>> = {
  PENDIENTE_AUTORIZACION: "POR_AUTORIZAR",
  AUTORIZADO: "AUTORIZADA",
  EJECUTADO: "AUTORIZADA",
  RECHAZADO: "RECHAZADA",
};

/** Los textos de la base (0112, 0126), por si un rechazo llega sin `message`. */
const TEXTO_DEL_RECHAZO: Readonly<Record<string, string>> = {
  PE001: "El pedido no existe o no es de un colportor de tus campañas. Recargá la lista de pedidos.",
  PE002: "Este pedido ya no está por autorizar: otra persona lo decidió. Recargá la lista para ver cómo quedó.",
  PE003: "Las cantidades no sirven: ninguna puede pasar de lo que pidió el colportor y al menos un producto tiene que quedar con cantidad.",
  PE004: "Escribí el motivo del rechazo (hasta 500 caracteres) para que el colportor sepa qué corregir.",
  TR001: "La transferencia no existe o no es de colportores de tus campañas. Recargá la lista de transferencias.",
  TR002: "Esta transferencia ya no está por autorizar: otra persona la decidió. Recargá la lista para ver cómo quedó.",
  TR003: "Quien da no tiene el stock completo para esta transferencia. Rechazala con un motivo, o esperá a que tenga los libros.",
  TR004: "Escribí el motivo del rechazo (hasta 500 caracteres) para que el colportor sepa qué corregir.",
  TR005: "No se puede valorar esta transferencia: falta el costo de la casa editora de algún producto. Avisá al equipo.",
  CZ001: "La campaña no existe. Elegí otra campaña en la barra de arriba.",
  CZ011: "La campaña ya terminó y su límite de deuda queda como estaba. Elegí una campaña en curso.",
  "22023": "El límite de deuda no puede ser negativo. Escribí un monto de cero o más, o quitá el límite.",
};

/** 42501 sin un texto propio de la base (el `permission denied` de PostgreSQL). */
const SIN_PERMISO = "Solo el coordinador de la campaña o un administrador puede decidir pedidos y transferencias. Entrá con la cuenta del coordinador de esta campaña.";
const NO_SE_GUARDO = "No pudimos guardar la decisión. Probá de nuevo; si sigue igual, avisá al equipo.";
const NO_SE_GUARDO_EL_LIMITE = "No pudimos guardar el límite. Probá de nuevo; si sigue igual, avisá al equipo.";
const NO_EXISTE = "No encontramos ese pedido o esa transferencia. Recargá la lista y probá de nuevo.";
const MOTIVO_INVALIDO = TEXTO_DEL_RECHAZO.PE004;
const CANTIDADES_INVALIDAS = TEXTO_DEL_RECHAZO.PE003;
const LIMITE_INVALIDO = "El límite tiene que ser un monto entero de cero o más, en pesos, o quedar sin límite.";

/** Un rechazo de la regla se traduce; una caída, un 5xx, un 429 o una sesión vencida no lo son. */
function esRechazo(error: unknown): error is ErrorSupabase {
  return error instanceof ErrorSupabase && causaDe(error) === "rechazo";
}

/** El JWT venció entre que el proxy lo comprobó y la RPC: vuelve como resultado, con su aviso (#41). */
function esSesionVencidaDeLaBase(error: unknown): boolean {
  return error instanceof ErrorSupabase && causaDe(error) === "sesion-vencida";
}

function textoDelRechazo(error: ErrorSupabase, alternativa: string): string {
  if (error.codigo === "42501") {
    // Los 42501 propios de la base dicen qué pasó; el de PostgreSQL viene en inglés.
    return error.message && !/^permission denied/i.test(error.message) ? error.message : SIN_PERMISO;
  }
  // `Object.hasOwn`: un código como «constructor» no puede salir del prototipo como si fuera un rechazo conocido.
  if (Object.hasOwn(TEXTO_DEL_RECHAZO, error.codigo)) return error.message || TEXTO_DEL_RECHAZO[error.codigo];
  return alternativa;
}

/** Centavos de la base → pesos de la vista. */
function pesos(rpc: string, fila: Objeto, campo: string): number {
  return numero(rpc, fila, campo) / 100;
}

function pesosONulo(rpc: string, fila: Objeto, campo: string): number | null {
  return fila[campo] === null || fila[campo] === undefined ? null : pesos(rpc, fila, campo);
}

/** Un instante ISO 8601 que se puede leer (la vista calcula «hoy», «ayer» y «hace 3 h» con él). */
function instante(rpc: string, fila: Objeto, campo: string): string {
  const valor = cadena(rpc, fila, campo);
  if (Number.isNaN(Date.parse(valor))) throw new RespuestaInesperada(rpc, `\`${campo}\` no es un instante (${valor})`);
  return valor;
}

function instanteONulo(rpc: string, fila: Objeto, campo: string): string | null {
  return cadenaONula(rpc, fila, campo) === null ? null : instante(rpc, fila, campo);
}

function entero(rpc: string, fila: Objeto, campo: string): number {
  const valor = numero(rpc, fila, campo);
  if (!Number.isInteger(valor)) throw new RespuestaInesperada(rpc, `\`${campo}\` no es un entero`);
  return valor;
}

/** Un número bigint (el número visible del pedido) llega como número: se muestra tal cual. */
function numeroVisible(rpc: string, fila: Objeto): string {
  return String(entero(rpc, fila, "numero"));
}

function estadoDe<T extends string>(rpc: string, fila: Objeto, estados: Readonly<Record<string, T>>): T {
  const estado = cadena(rpc, fila, "estado");
  if (!Object.hasOwn(estados, estado)) throw new RespuestaInesperada(rpc, `\`estado\` desconocido (${estado})`);
  return estados[estado];
}

function cuentaDe(rpc: string, fila: Objeto): CuentaDelColportor {
  const fecha = instanteONulo(rpc, fila, "ultimo_deposito_fecha");
  const monto = pesosONulo(rpc, fila, "ultimo_deposito_monto");
  return {
    deuda: pesos(rpc, fila, "deuda_actual"),
    porCobrar: pesos(rpc, fila, "por_cobrar"),
    librosPorEntregar: entero(rpc, fila, "libros_por_entregar"),
    ultimoDeposito: fecha !== null && monto !== null ? { dia: hoyEnMontevideo(new Date(fecha)), monto } : null,
  };
}

/** Lo que la base sabe de un pedido de la lista, sin su detalle. */
interface FilaDePedido {
  fila: Objeto;
  id: string;
}

async function detalleDePedido(cliente: ClienteRpc, { fila, id }: FilaDePedido): Promise<PedidoDeColportor> {
  const [lineas, contexto] = await Promise.all([
    cliente.llamarRpc("pedido_lineas", { p_pedido_id: id }),
    cliente.llamarRpc("pedido_contexto", { p_pedido_id: id }),
  ]);
  const rpcLineas = "pedido_lineas";
  const rpcContexto = "pedido_contexto";
  const [filaContexto] = filas(rpcContexto, contexto);
  if (!filaContexto) throw new RespuestaInesperada(rpcContexto, "no devolvió ninguna fila");
  const lineasLeidas = filas(rpcLineas, lineas);
  const rpc = "pedidos_de_campania";
  const colportorId = cadena(rpc, fila, "colportor_id");
  const motivo = cadenaONula(rpc, fila, "motivo_rechazo");
  const estado = estadoDe(rpc, fila, ESTADOS_DE_PEDIDO);
  return {
    id,
    numero: `#${numeroVisible(rpc, fila)}`,
    colportorId,
    colportorNombre: nombreVisible(cadenaONula(rpc, fila, "nombre") ?? "", cadenaONula(rpc, fila, "apellido") ?? "", CUENTA_SIN_NOMBRE),
    ciudadId: cadenaONula(rpc, fila, "ciudad_id"),
    estado,
    enviadoEn: instante(rpc, fila, "fecha_pedido"),
    resueltoEn: estado === "POR_AUTORIZAR" ? null : instanteONulo(rpc, fila, "decidido_en"),
    motivoDeRechazo: estado === "RECHAZADO" ? motivo : null,
    lineas: lineasLeidas.map((l): LineaDeUnPedido => {
      const autorizada = l.cantidad_autorizada === null || l.cantidad_autorizada === undefined ? null : entero(rpcLineas, l, "cantidad_autorizada");
      return {
        productoId: cadena(rpcLineas, l, "producto_id"),
        nombre: cadena(rpcLineas, l, "producto_nombre"),
        cantidad: entero(rpcLineas, l, "cantidad"),
        costoUnitario: pesos(rpcLineas, l, "precio_unitario"),
        ...(autorizada === null ? {} : { cantidadAutorizada: autorizada }),
      };
    }),
    cuenta: cuentaDe(rpcContexto, filaContexto),
    stock: lineasLeidas.map((l) => ({ nombre: cadena(rpcLineas, l, "producto_nombre"), cantidad: entero(rpcLineas, l, "stock") })),
  };
}

async function detalleDeTransferencia(cliente: ClienteRpc, fila: Objeto): Promise<TransferenciaDeStock> {
  const rpc = "transferencias_de_campania";
  const rpcLineas = "transferencia_lineas";
  const id = cadena(rpc, fila, "transferencia_id");
  const lineas = filas(rpcLineas, await cliente.llamarRpc(rpcLineas, { p_transferencia_id: id }));
  const estado = estadoDe(rpc, fila, ESTADOS_DE_TRANSFERENCIA);
  const motivo = cadenaONula(rpc, fila, "motivo_rechazo");
  return {
    id,
    numero: `T-${numeroVisible(rpc, fila)}`,
    deId: cadena(rpc, fila, "origen_id"),
    deNombre: nombreVisible(cadenaONula(rpc, fila, "origen_nombre") ?? "", cadenaONula(rpc, fila, "origen_apellido") ?? "", CUENTA_SIN_NOMBRE),
    aId: cadena(rpc, fila, "destino_id"),
    aNombre: nombreVisible(cadenaONula(rpc, fila, "destino_nombre") ?? "", cadenaONula(rpc, fila, "destino_apellido") ?? "", CUENTA_SIN_NOMBRE),
    ciudadId: cadenaONula(rpc, fila, "ciudad_id"),
    estado,
    pedidaEn: instante(rpc, fila, "fecha_solicitud"),
    resueltaEn: estado === "POR_AUTORIZAR" ? null : instanteONulo(rpc, fila, "decidido_en"),
    motivoDeRechazo: estado === "RECHAZADA" ? motivo : null,
    lineas: lineas.map(
      (l): LineaDeTransferencia => ({
        productoId: cadena(rpcLineas, l, "producto_id"),
        nombre: cadena(rpcLineas, l, "producto_nombre"),
        cantidad: entero(rpcLineas, l, "cantidad"),
        // Sin costo cargado (null) la base no la deja autorizar (TR005): el costo en cero no suma nada a lo que se ve.
        costoUnitario: pesosONulo(rpcLineas, l, "precio_unitario") ?? 0,
        tieneQuienDa: entero(rpcLineas, l, "tiene_quien_da"),
        debeEntregarQuienRecibe: entero(rpcLineas, l, "debe_entregar_quien_recibe"),
        tieneQuienRecibe: entero(rpcLineas, l, "tiene_quien_recibe"),
      }),
    ),
  };
}

/**
 * Resuelve `tarea` para cada elemento de a `DETALLES_A_LA_VEZ`. Un elemento que la base rechaza (ya no existe, ya no se puede
 * ver) queda afuera; cualquier otra falla corta todo.
 */
async function enTandas<E, R>(elementos: readonly E[], tarea: (elemento: E) => Promise<R>): Promise<R[]> {
  const resultado: R[] = [];
  for (let desde = 0; desde < elementos.length; desde += DETALLES_A_LA_VEZ) {
    const tanda = elementos.slice(desde, desde + DETALLES_A_LA_VEZ);
    const leidos = await Promise.all(
      tanda.map(async (elemento) => {
        try {
          return await tarea(elemento);
        } catch (error) {
          if (esRechazo(error)) return null;
          throw error;
        }
      }),
    );
    for (const leido of leidos) if (leido !== null) resultado.push(leido);
  }
  return resultado;
}

/** Una lista de la base sin cortar: si llegó al tope de PostgREST puede faltar lo que sigue y no se muestra como completa. */
function listaCompleta(rpc: string, respuesta: unknown): Objeto[] {
  const leidas = filas(rpc, respuesta);
  if (leidas.length >= FILAS_MAXIMAS) throw new RespuestaInesperada(rpc, `llegó al tope de ${FILAS_MAXIMAS} filas: puede faltar el resto`);
  return leidas;
}

/**
 * @param campaniaElegida la campaña que eligió la coordinadora en el topbar (#70), si hay; sin ella o si ya no figura en su
 *   lista, la primera (`campaniaProvisoria`).
 */
export function crearFuentePedidosRpc(cliente: ClienteRpc, campaniaElegida: () => Promise<string | null> = async () => null): FuenteDatosPedidos {
  return {
    async obtenerPedidos(): Promise<DatosDePedidos | null> {
      const campania = await campaniaProvisoria(cliente, await campaniaElegida());
      if (!campania) return null;

      const ahora = new Date().toISOString();
      const [ciudadesLeidas, pedidosLeidos, transferenciasLeidas] = await Promise.all([
        llamarRpcPorPaginas(cliente, "ciudades_de_campania", { p_campania_id: campania.id }),
        cliente.llamarRpc("pedidos_de_campania", { p_campania_id: campania.id }),
        cliente.llamarRpc("transferencias_de_campania", { p_campania_id: campania.id }),
      ]);
      const filasDePedidos = listaCompleta("pedidos_de_campania", pedidosLeidos).map(
        (fila): FilaDePedido => ({ fila, id: cadena("pedidos_de_campania", fila, "pedido_id") }),
      );
      const filasDeTransferencias = listaCompleta("transferencias_de_campania", transferenciasLeidas);

      const pedidos = await enTandas(filasDePedidos, (f) => detalleDePedido(cliente, f));
      const transferencias = await enTandas(filasDeTransferencias, (f) => detalleDeTransferencia(cliente, f));

      const ciudades = new Map<string, CiudadDePedidos>();
      for (const c of ciudadesLeidas) {
        const id = cadena("ciudades_de_campania", c, "ciudad_id");
        ciudades.set(id, { id, nombre: cadena("ciudades_de_campania", c, "nombre"), departamento: cadenaONula("ciudades_de_campania", c, "departamento") });
      }
      // La ciudad de un pedido es la de la zona de quien lo pide: si la campaña ya no la lista, no se pierde el pedido.
      for (const fila of [...filasDePedidos.map((f) => f.fila), ...filasDeTransferencias]) {
        const id = cadenaONula("pedidos_de_campania", fila, "ciudad_id");
        if (id === null || ciudades.has(id)) continue;
        ciudades.set(id, { id, nombre: cadenaONula("pedidos_de_campania", fila, "ciudad_nombre") ?? "Sin nombre", departamento: cadenaONula("pedidos_de_campania", fila, "departamento") });
      }

      return {
        campaniaId: campania.id,
        limiteDeDeuda: null,
        limiteSinLeer: true,
        campaniaNombre: campania.nombre,
        ahora,
        ciudades: [...ciudades.values()],
        pedidos,
        transferencias,
      };
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Escrituras
// ---------------------------------------------------------------------------------------------------------------------

type Rechazada = Extract<ResultadoDeAccion<never>, { ok: false }>;

const rechazada = (mensaje: string): Rechazada => ({ ok: false, causa: "rechazado", mensaje });

/** Las cantidades de «Reducir» como las pide `autorizar_pedido`, o `null` si alguna no sirve (el id viene del navegador). */
function cantidadesParaLaBase(cantidades: readonly CantidadAutorizada[]): Array<{ producto_id: string; cantidad: number }> | null {
  const lista: Array<{ producto_id: string; cantidad: number }> = [];
  for (const c of cantidades) {
    if (typeof c?.productoId !== "string" || !UUID.test(c.productoId)) return null;
    if (typeof c.cantidad !== "number" || !Number.isInteger(c.cantidad) || c.cantidad < 0) return null;
    lista.push({ producto_id: c.productoId, cantidad: c.cantidad });
  }
  return lista;
}

export function crearAccionesPedidosRpc(cliente: ClienteRpc, campaniaElegida: () => Promise<string | null> = async () => null): AccionesPedidos {
  /** Llama a la RPC de una decisión y traduce lo que no es una caída. */
  async function llamar(rpc: string, argumentos: Record<string, unknown>, alternativa: string): Promise<{ fila: Objeto } | Rechazada> {
    try {
      const [fila] = filas(rpc, await cliente.llamarRpc(rpc, argumentos));
      if (!fila) throw new RespuestaInesperada(rpc, "no devolvió ninguna fila");
      return { fila };
    } catch (error) {
      if (esRechazo(error)) return rechazada(textoDelRechazo(error, alternativa));
      if (esSesionVencidaDeLaBase(error)) return rechazada(MENSAJE_SESION_VENCIDA);
      throw error;
    }
  }

  return {
    async decidir(decision: DecisionDeSolicitud): Promise<ResultadoDeAccion<SolicitudResuelta>> {
      const esPedido = decision?.tipo === "pedido";
      if ((!esPedido && decision?.tipo !== "transferencia") || typeof decision.id !== "string" || !UUID.test(decision.id)) return rechazada(NO_EXISTE);
      if (decision.accion !== "autorizar" && decision.accion !== "rechazar") return rechazada(NO_EXISTE);
      const rpc = `${decision.accion === "autorizar" ? "autorizar" : "rechazar"}_${esPedido ? "pedido" : "transferencia"}`;
      const idDeLaBase = esPedido ? { p_pedido_id: decision.id } : { p_transferencia_id: decision.id };

      if (decision.accion === "rechazar") {
        const motivo = typeof decision.motivo === "string" ? decision.motivo.trim() : "";
        // Por caracteres, como `length()` de la base: un emoji cuenta uno, no las dos unidades UTF-16 de `String.length`.
        if (motivo === "" || Array.from(motivo).length > MAX_MOTIVO) return rechazada(MOTIVO_INVALIDO);
        const respuesta = await llamar(rpc, { ...idDeLaBase, p_motivo: motivo }, NO_SE_GUARDO);
        if (!("fila" in respuesta)) return respuesta;
        return {
          ok: true,
          valor: {
            tipo: decision.tipo,
            id: decision.id,
            estado: esPedido ? "RECHAZADO" : "RECHAZADA",
            resueltoEn: instante(rpc, respuesta.fila, "decidido_en"),
            motivoDeRechazo: motivo,
          },
        };
      }

      let argumentos: Record<string, unknown> = idDeLaBase;
      let cantidades: CantidadAutorizada[] | undefined;
      if (decision.cantidades !== undefined) {
        // Solo un pedido se autoriza reducido (HU-STK-003); la transferencia es toda o nada.
        const paraLaBase = esPedido && Array.isArray(decision.cantidades) ? cantidadesParaLaBase(decision.cantidades) : null;
        if (paraLaBase === null || paraLaBase.length === 0) return rechazada(CANTIDADES_INVALIDAS);
        argumentos = { ...idDeLaBase, p_cantidades: paraLaBase };
        cantidades = decision.cantidades.map((c) => ({ nombre: c.nombre, productoId: c.productoId, cantidad: c.cantidad }));
      }
      const respuesta = await llamar(rpc, argumentos, NO_SE_GUARDO);
      if (!("fila" in respuesta)) return respuesta;
      return {
        ok: true,
        valor: {
          tipo: decision.tipo,
          id: decision.id,
          estado: esPedido ? "AUTORIZADO" : "AUTORIZADA",
          resueltoEn: instante(rpc, respuesta.fila, "decidido_en"),
          motivoDeRechazo: null,
          ...(cantidades ? { cantidades } : {}),
        },
      };
    },

    async editarLimite(limite, campaniaId) {
      if (limite !== null && (typeof limite !== "number" || !Number.isInteger(limite) || limite < 0 || limite > LIMITE_DE_DEUDA_MAXIMO)) {
        return rechazada(LIMITE_INVALIDO);
      }
      if (campaniaId !== undefined && (typeof campaniaId !== "string" || !UUID.test(campaniaId))) return rechazada(TEXTO_DEL_RECHAZO.CZ001);
      let campania = campaniaId;
      if (campania === undefined) {
        const elegida = await campaniaProvisoria(cliente, await campaniaElegida());
        if (!elegida) return rechazada(TEXTO_DEL_RECHAZO.CZ001);
        campania = elegida.id;
      }
      const rpc = "definir_limite_de_deuda_de_campania";
      const respuesta = await llamar(rpc, { p_campania_id: campania, p_monto: limite === null ? null : limite * 100 }, NO_SE_GUARDO_EL_LIMITE);
      if (!("fila" in respuesta)) return respuesta;
      return { ok: true, valor: { limiteDeDeuda: pesosONulo(rpc, respuesta.fila, "limite_deuda") } };
    },
  };
}
