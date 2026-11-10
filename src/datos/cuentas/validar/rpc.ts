import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AccionesValidarTickets,
  CifrasDelColportor,
  ConceptoPorValidar,
  DatosDeValidacion,
  EstadoPorValidar,
  FuenteValidarTickets,
  ItemPorValidar,
  LugarDelDeposito,
  Resolucion,
  ResultadoDeAccion,
  TarjetaDelDeposito,
  TipoPorValidar,
} from "@/datos/cuentas/validar/contrato";
import { campaniaProvisoria } from "@/datos/supabase/campania-provisoria";
import { causaDe, ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import {
  booleano,
  cadena,
  cadenaONula,
  esObjeto,
  filas,
  nombreVisible,
  numero,
  type Objeto,
  RespuestaInesperada,
  UUID,
} from "@/datos/supabase/respuesta";
import { MENSAJE_SESION_VENCIDA } from "@/lib/mensajes";

/**
 * «Validar tickets» (vista 29, HU-COB-008) contra Supabase (ADR-013), conectada antes que el resto de Cuentas por la decisión
 * de Cristian del 10/11, «Conectar 29» (front-coordinadores-web#170).
 *
 * Lectura: la cola es lo de la campaña elegida en el topbar (#70) que pasa por esta vista, en cualquier estado:
 * - los tickets de DEPÓSITO de `tickets_de_campania` (0113/0131), con el destino y el concepto de su depósito. Los de cobros
 *   con tarjeta (y los `OTRO`) no entran (decisión del 10/11, «Ticket dep.»);
 * - los retiros por el coordinador de `retiros_de_campania` (0184, backend-supabase#261): su id es el del depósito;
 * - de lo que está por validar y no es propio, lo que la app sabe para comparar (`validacion_de_ticket` /
 *   `validacion_de_retiro`, 0152): lo que tenía en mano y la deuda del concepto antes de decidir.
 * Los montos llegan en centavos y la vista los muestra en pesos.
 *
 * Escrituras: `validar_ticket`, `confirmar_retiro`, `rechazar_ticket` y `rechazar_retiro` (0152), y el enlace firmado de la
 * foto por la Edge Function `foto-ticket` (0134), que pregunta `ruta_para_ver_foto_de_ticket` con la sesión de quien pide.
 * Un rechazo de la regla vuelve con su texto (el `message` de la base ya está escrito para la persona); la sesión vencida
 * vuelve como resultado, con su aviso (#41); una caída de la red, un 5xx o un 429 siguen como excepción, que la vista
 * muestra como «sin conexión».
 */

/** El tope de filas por página de `tickets_de_campania` y `retiros_de_campania`. */
export const FILAS_POR_PAGINA = 500;

/** Cuántas vistas previas (`validacion_de_*`) se piden a la vez: una por ítem por validar. */
const PREVIAS_A_LA_VEZ = 6;

/** El nombre de la Edge Function de la foto (backend-supabase, `supabase/functions/foto-ticket`). */
export const FUNCION_DE_LA_FOTO = "foto-ticket";

const ESTADOS: ReadonlySet<string> = new Set<EstadoPorValidar>(["PENDIENTE", "VALIDADO", "RECHAZADO"]);

const CONCEPTOS: Readonly<Record<string, ConceptoPorValidar>> = { CASA_EDITORA: "casa-editora", ALQUILER: "alquiler" };

const LUGARES: Readonly<Record<string, LugarDelDeposito>> = { BANCO: "banco", OFICINA: "oficina" };

/** `ticket.tarjeta_tipo`; sin tarjeta, la base no guarda nada y la vista muestra «—». */
const TARJETAS: Readonly<Record<string, TarjetaDelDeposito>> = { DEBITO: "debito", CREDITO: "credito" };

/** Lo que va en el título de la fila si la cuenta no tiene nombre ni apellido. */
const CUENTA_SIN_NOMBRE = "Colportor sin nombre";

/** Los textos de la base (0129, 0152, 0175), por si un rechazo llega sin `message`. */
const TEXTO_DEL_RECHAZO: Readonly<Record<string, string>> = {
  TV001: "El ticket no existe o no es de un colportor de tus campañas. Recargá la lista de tickets.",
  TV002: "Este ticket ya no está pendiente: otra persona lo resolvió. Recargá la lista para ver cómo quedó.",
  TV003: "Escribí el motivo del rechazo (hasta 500 caracteres) para que el colportor sepa qué corregir.",
  TV004: "El ticket no tiene monto, no hay nada para acreditar. Rechazalo con un motivo para que el colportor lo cargue de nuevo.",
  TV005: "Todavía no llegó el depósito de este ticket: el teléfono del colportor tiene que sincronizar. Probá de nuevo más tarde.",
  DP002: "El retiro no existe o no es de un colportor de tus campañas. Recargá la lista.",
  DP003: "Este depósito tiene ticket: se valida desde su ticket, en la lista de tickets.",
  DP004: "Este retiro ya lo confirmó otra persona. Recargá la lista para ver cómo quedó.",
  DP005: "Este retiro ya lo rechazó otra persona. Recargá la lista para ver cómo quedó.",
  DP006: "Escribí el motivo del rechazo (hasta 500 caracteres) para que la colportora sepa qué corregir.",
};

/** 42501 sin un texto propio de la base (el `permission denied` de PostgreSQL). */
const SIN_PERMISO = "Solo el coordinador de la campaña o un administrador puede validar tickets y retiros. Entrá con la cuenta del coordinador de esta campaña.";
const NO_SE_GUARDO = "No pudimos guardar la decisión. Probá de nuevo; si sigue igual, avisá al equipo.";
const NO_EXISTE: Readonly<Record<TipoPorValidar, string>> = { deposito: TEXTO_DEL_RECHAZO.TV001, retiro: TEXTO_DEL_RECHAZO.DP002 };
const MOTIVO_INVALIDO: Readonly<Record<TipoPorValidar, string>> = { deposito: TEXTO_DEL_RECHAZO.TV003, retiro: TEXTO_DEL_RECHAZO.DP006 };
const MAX_MOTIVO = 500;

/** Un rechazo de la regla se traduce; una caída, un 5xx, un 429 o una sesión vencida no lo son. */
function esRechazo(error: unknown): error is ErrorSupabase {
  return error instanceof ErrorSupabase && causaDe(error) === "rechazo";
}

/** El JWT venció entre que el proxy lo comprobó y la RPC: vuelve como resultado, con su aviso (#41, P3). */
function esSesionVencidaDeLaBase(error: unknown): boolean {
  return error instanceof ErrorSupabase && causaDe(error) === "sesion-vencida";
}

/** La función no existe todavía en ese proyecto (una migración sin aplicar): PostgREST `PGRST202`, PostgreSQL `42883`. */
function esFuncionQueNoExiste(error: unknown): boolean {
  return error instanceof ErrorSupabase && (error.codigo === "PGRST202" || error.codigo === "42883");
}

function textoDelRechazo(error: ErrorSupabase): string {
  if (error.codigo === "42501") {
    // Los 42501 propios de la base dicen qué pasó («No podés validar tu propio ticket…»); el de PostgreSQL viene en inglés.
    return error.message && !/^permission denied/i.test(error.message) ? error.message : SIN_PERMISO;
  }
  // `Object.hasOwn`: un código como «constructor» no puede salir del prototipo como si fuera un rechazo conocido.
  if (Object.hasOwn(TEXTO_DEL_RECHAZO, error.codigo)) return error.message || TEXTO_DEL_RECHAZO[error.codigo];
  return NO_SE_GUARDO;
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

function estadoDe(rpc: string, fila: Objeto): EstadoPorValidar {
  const estado = cadena(rpc, fila, "estado");
  if (!ESTADOS.has(estado)) throw new RespuestaInesperada(rpc, `\`estado\` desconocido (${estado})`);
  return estado as EstadoPorValidar;
}

function conceptoDe(rpc: string, valor: string): ConceptoPorValidar {
  const concepto = CONCEPTOS[valor];
  if (!concepto) throw new RespuestaInesperada(rpc, `\`concepto\` desconocido (${valor})`);
  return concepto;
}

/** Lo que tienen en común un ticket de depósito y un retiro. */
function base(rpc: string, fila: Objeto, yo: string | null) {
  const colportorId = cadena(rpc, fila, "colportor_id");
  const estado = estadoDe(rpc, fila);
  const revisadoPor = cadenaONula(rpc, fila, "revisado_por");
  const resueltoEn = instanteONulo(rpc, fila, "revisado_en");
  const motivo = cadenaONula(rpc, fila, "motivo_rechazo");
  return {
    colportorId,
    colportorNombre: nombreVisible(cadenaONula(rpc, fila, "nombre") ?? "", cadenaONula(rpc, fila, "apellido") ?? "", CUENTA_SIN_NOMBRE),
    esVos: yo !== null && colportorId === yo,
    ciudad: cadenaONula(rpc, fila, "ciudad_nombre"),
    monto: pesos(rpc, fila, "monto"),
    enviadoEn: instante(rpc, fila, "subido_en"),
    estado,
    ...(estado === "RECHAZADO" && motivo !== null ? { motivoRechazo: motivo } : {}),
    ...(estado !== "PENDIENTE" && resueltoEn !== null ? { resueltoEn, resueltoPorVos: yo !== null && revisadoPor === yo } : {}),
    cifras: null,
  };
}

/**
 * Una fila de `tickets_de_campania`; `null` si no es de esta vista: un ticket que no es de depósito (cobro con tarjeta,
 * `OTRO`) o uno de depósito cuyo depósito todavía no llegó del teléfono (sin destino ni concepto: no se sabe contra qué
 * deuda cuenta y validarlo da TV005; aparece cuando el teléfono sincroniza).
 */
function aDeposito(fila: Objeto, yo: string | null): ItemPorValidar | null {
  const rpc = "tickets_de_campania";
  if (cadena(rpc, fila, "tipo") !== "DEPOSITO") return null;
  const concepto = cadenaONula(rpc, fila, "deposito_concepto");
  const destino = cadenaONula(rpc, fila, "deposito_destino");
  if (concepto === null || destino === null) return null;
  const lugar = LUGARES[destino];
  if (!lugar) throw new RespuestaInesperada(rpc, `\`deposito_destino\` no es de un depósito con ticket (${destino})`);
  const numeroAutorizacion = cadenaONula(rpc, fila, "numero_autorizacion");
  const tarjetaTipo = cadenaONula(rpc, fila, "tarjeta_tipo");
  const tarjeta = tarjetaTipo === null ? undefined : TARJETAS[tarjetaTipo];
  if (tarjetaTipo !== null && !tarjeta) throw new RespuestaInesperada(rpc, `\`tarjeta_tipo\` desconocido (${tarjetaTipo})`);
  const subidoEn = instante(rpc, fila, "subido_en");
  return {
    id: cadena(rpc, fila, "ticket_id"),
    tipo: "deposito",
    ...base(rpc, fila, yo),
    concepto: conceptoDe(rpc, concepto),
    lugar,
    ...(numeroAutorizacion ? { numeroAutorizacion } : {}),
    ...(tarjeta ? { tarjeta } : {}),
    fecha: instanteONulo(rpc, fila, "fecha") ?? subidoEn,
    tieneFoto: booleano(rpc, fila, "tiene_foto"),
  };
}

/** Una fila de `retiros_de_campania` (0184): el efectivo que la colportora le dio en mano a la coordinadora, sin ticket ni foto. */
function aRetiro(fila: Objeto, yo: string | null): ItemPorValidar {
  const rpc = "retiros_de_campania";
  return {
    id: cadena(rpc, fila, "deposito_id"),
    tipo: "retiro",
    ...base(rpc, fila, yo),
    concepto: conceptoDe(rpc, cadena(rpc, fila, "concepto")),
    fecha: instante(rpc, fila, "fecha"),
    tieneFoto: false,
  };
}

async function miId(cliente: ClienteRpc): Promise<string | null> {
  const rpc = "mi_perfil";
  const [fila] = filas(rpc, await cliente.llamarRpc(rpc, {}));
  return fila ? cadena(rpc, fila, "usuario_id") : null;
}

/** Todas las páginas de una lectura de la campaña (PostgREST y la RPC cortan en 500 filas). */
async function todasLasFilas(cliente: ClienteRpc, rpc: string, campaniaId: string): Promise<Objeto[]> {
  const todas: Objeto[] = [];
  for (let desplazamiento = 0; ; desplazamiento += FILAS_POR_PAGINA) {
    const pagina = filas(
      rpc,
      await cliente.llamarRpc(rpc, { p_campania_id: campaniaId, p_limite: FILAS_POR_PAGINA, p_desplazamiento: desplazamiento }),
    );
    todas.push(...pagina);
    if (pagina.length < FILAS_POR_PAGINA) return todas;
  }
}

/**
 * Lo que la app sabe para comparar antes de decidir. Sin cifras (`null`) si la base no las calcula (una campaña sin alquiler,
 * un depósito que ya no está pendiente) o si rechaza la pregunta (otra persona lo resolvió entre la lista y esto): la vista
 * igual deja decidir. Una caída sigue como excepción.
 */
async function cifrasDe(cliente: ClienteRpc, item: ItemPorValidar): Promise<CifrasDelColportor | null> {
  const rpc = item.tipo === "retiro" ? "validacion_de_retiro" : "validacion_de_ticket";
  const argumentos = item.tipo === "retiro" ? { p_deposito_id: item.id } : { p_ticket_id: item.id };
  let respuesta: unknown;
  try {
    respuesta = await cliente.llamarRpc(rpc, argumentos);
  } catch (error) {
    if (esRechazo(error)) return null;
    throw error;
  }
  const [fila] = filas(rpc, respuesta);
  if (!fila) return null;
  const enMano = pesosONulo(rpc, fila, "en_mano");
  const deuda = pesosONulo(rpc, fila, "deuda_antes");
  return enMano === null || deuda === null ? null : { enMano, deuda };
}

/** Las cifras de cada ítem por validar que no es propio (nadie valida lo suyo: 42501), de a `PREVIAS_A_LA_VEZ`. */
async function conCifras(cliente: ClienteRpc, items: ItemPorValidar[]): Promise<ItemPorValidar[]> {
  const resultado = [...items];
  const porCalcular = items.flatMap((item, i) => (item.estado === "PENDIENTE" && !item.esVos ? [i] : []));
  for (let desde = 0; desde < porCalcular.length; desde += PREVIAS_A_LA_VEZ) {
    const tanda = porCalcular.slice(desde, desde + PREVIAS_A_LA_VEZ);
    const cifras = await Promise.all(tanda.map((i) => cifrasDe(cliente, items[i])));
    tanda.forEach((i, j) => {
      resultado[i] = { ...items[i], cifras: cifras[j] };
    });
  }
  return resultado;
}

/**
 * @param campaniaElegida la campaña que eligió la coordinadora en el topbar (#70), si hay; sin ella o si ya no figura en su
 *   lista, la primera (`campaniaProvisoria`).
 */
export function crearFuenteValidarTicketsRpc(
  cliente: ClienteRpc,
  campaniaElegida: () => Promise<string | null> = async () => null,
): FuenteValidarTickets {
  return {
    async obtenerPorValidar(): Promise<DatosDeValidacion> {
      const ahora = new Date().toISOString();
      const campania = await campaniaProvisoria(cliente, await campaniaElegida());
      // Sin campaña que coordine no hay nada que validar: la vista lo dice («No quedan tickets por validar»).
      if (!campania) return { campaniaId: "", ahora, items: [] };

      const [tickets, retiros, yo] = await Promise.all([
        todasLasFilas(cliente, "tickets_de_campania", campania.id),
        // La 0184 puede no estar aplicada todavía en un proyecto: sin la función, la cola queda solo con los depósitos.
        todasLasFilas(cliente, "retiros_de_campania", campania.id).catch((error: unknown) => {
          if (esFuncionQueNoExiste(error)) return [];
          throw error;
        }),
        miId(cliente),
      ]);
      const items = [
        ...tickets.flatMap((fila) => aDeposito(fila, yo) ?? []),
        ...retiros.map((fila) => aRetiro(fila, yo)),
      ];
      return { campaniaId: campania.id, ahora, items: await conCifras(cliente, items) };
    },
  };
}

/** Lo que el panel le pide a la Edge Function: un `POST` con un cuerpo JSON, y la respuesta tal cual (sin tirar por el estado). */
export interface ClienteDeFunciones {
  /** Tira solo si no hubo respuesta (sin red, cancelada). */
  invocarFuncion(nombre: string, cuerpo: Record<string, unknown>): Promise<Response>;
}

/** El `mensaje` de un error de la función (`{error:{codigo,mensaje}}`), si la respuesta tiene esa forma y un texto usable. */
async function mensajeDeLaFuncion(respuesta: Response): Promise<string | undefined> {
  try {
    const cuerpo: unknown = await respuesta.json();
    if (!esObjeto(cuerpo) || !esObjeto(cuerpo.error)) return undefined;
    const mensaje = cuerpo.error.mensaje;
    return typeof mensaje === "string" && mensaje.trim() !== "" ? mensaje : undefined;
  } catch {
    return undefined;
  }
}

/** Un enlace que el navegador puede abrir: `https`, o `http` solo en un Supabase local de desarrollo. */
function esEnlaceUsable(valor: unknown): valor is string {
  if (typeof valor !== "string") return false;
  try {
    const url = new URL(valor);
    return url.protocol === "https:" || (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1"));
  } catch {
    return false;
  }
}

function resolucion(rpc: string, respuesta: unknown, campoDelInstante: string): Resolucion {
  const [fila] = filas(rpc, respuesta);
  if (!fila) throw new RespuestaInesperada(rpc, "no devolvió ninguna fila");
  return { resueltoEn: instante(rpc, fila, campoDelInstante), yaEstaba: booleano(rpc, fila, "ya_estaba") };
}

const TIPOS: ReadonlySet<unknown> = new Set<TipoPorValidar>(["deposito", "retiro"]);

export function crearAccionesValidarTicketsRpc(cliente: ClienteRpc, funciones: ClienteDeFunciones): AccionesValidarTickets {
  /** Llama a la RPC de una decisión y traduce lo que no es una caída. */
  async function decidir(
    rpc: string,
    argumentos: Record<string, unknown>,
    campoDelInstante: string,
  ): Promise<ResultadoDeAccion<Resolucion>> {
    try {
      return { ok: true, valor: resolucion(rpc, await cliente.llamarRpc(rpc, argumentos), campoDelInstante) };
    } catch (error) {
      if (esRechazo(error)) return { ok: false, causa: "rechazado", mensaje: textoDelRechazo(error) };
      if (esSesionVencidaDeLaBase(error)) return { ok: false, causa: "rechazado", mensaje: MENSAJE_SESION_VENCIDA };
      throw error;
    }
  }

  /** El id y el tipo vienen del navegador: lo que no es un uuid o un tipo de esta vista no se manda. */
  const valido = (item: Pick<ItemPorValidar, "id" | "tipo">) => TIPOS.has(item.tipo) && typeof item.id === "string" && UUID.test(item.id);

  return {
    async validar(item) {
      if (!valido(item)) return { ok: false, causa: "rechazado", mensaje: NO_EXISTE[item.tipo] ?? NO_SE_GUARDO };
      return item.tipo === "retiro"
        ? decidir("confirmar_retiro", { p_deposito_id: item.id }, "validado_en")
        : decidir("validar_ticket", { p_ticket_id: item.id }, "validado_en");
    },

    async rechazar(item, motivo) {
      if (!valido(item)) return { ok: false, causa: "rechazado", mensaje: NO_EXISTE[item.tipo] ?? NO_SE_GUARDO };
      const limpio = typeof motivo === "string" ? motivo.trim() : "";
      if (limpio === "" || limpio.length > MAX_MOTIVO) return { ok: false, causa: "rechazado", mensaje: MOTIVO_INVALIDO[item.tipo] };
      return item.tipo === "retiro"
        ? decidir("rechazar_retiro", { p_deposito_id: item.id, p_motivo: limpio }, "rechazado_en")
        : decidir("rechazar_ticket", { p_ticket_id: item.id, p_motivo: limpio }, "revisado_en");
    },

    async enlaceDeFoto(ticketId) {
      if (typeof ticketId !== "string" || !UUID.test(ticketId)) {
        return { ok: false, causa: "rechazado", mensaje: "No encontramos ese ticket o no tenés permiso para ver su foto." };
      }
      let respuesta: Response;
      try {
        // La función pide `ticketId` en minúsculas (README de foto-ticket).
        respuesta = await funciones.invocarFuncion(FUNCION_DE_LA_FOTO, { accion: "ver", ticketId: ticketId.toLowerCase() });
      } catch {
        return { ok: false, causa: "sin-conexion" };
      }
      if (respuesta.status === 401) return { ok: false, causa: "rechazado", mensaje: MENSAJE_SESION_VENCIDA };
      if (!respuesta.ok) {
        const mensaje = await mensajeDeLaFuncion(respuesta);
        return { ok: false, causa: "rechazado", ...(mensaje ? { mensaje } : {}) };
      }
      let cuerpo: unknown;
      try {
        cuerpo = await respuesta.json();
      } catch {
        cuerpo = null;
      }
      // Un 200 sin un enlace usable (otra función con el mismo nombre, un proxy) no se muestra como si fuera la foto.
      return esObjeto(cuerpo) && esEnlaceUsable(cuerpo.url) ? { ok: true, valor: cuerpo.url } : { ok: false, causa: "rechazado" };
    },
  };
}

/**
 * La Edge Function con el `supabase-js` de la sesión (`functions.invoke`): devuelve la respuesta tal cual, también la de un
 * error de la función (`FunctionsHttpError`, que trae la respuesta en `context`). Sin respuesta (`FunctionsFetchError`,
 * `FunctionsRelayError`) tira.
 */
export function funcionesDeSupabase(supabase: Pick<SupabaseClient, "functions">): ClienteDeFunciones {
  return {
    async invocarFuncion(nombre, cuerpo) {
      const { data, error } = await supabase.functions.invoke<unknown>(nombre, { body: cuerpo });
      if (error) {
        // Sin `instanceof`: el `Response` del SDK puede venir de otro entorno que el global de quien lo prueba.
        const contexto: unknown = error.name === "FunctionsHttpError" ? (error as { context?: unknown }).context : undefined;
        if (esObjeto(contexto) && typeof contexto.status === "number" && typeof contexto.json === "function") {
          return contexto as unknown as Response;
        }
        throw error;
      }
      return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  };
}
