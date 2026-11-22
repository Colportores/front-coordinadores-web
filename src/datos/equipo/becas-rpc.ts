import type { BecaDeColportor, CarreraDelCatalogo, DatosDeBecas, MetaDeBeca, ResultadoBeca, TipoDeBeca } from "@/datos/equipo/contrato";
import { causaDe, ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import { cadena, cadenaONula, filas, numero, type Objeto, RespuestaInesperada, UUID } from "@/datos/supabase/respuesta";
import { hoyEnMontevideo } from "@/lib/dias";

/**
 * Las becas de la vista 33 (HU-BEC-002/004/006) contra las RPC de Supabase (ADR-013): el catálogo `carreras_de_beca()`
 * (las carreras vivas con las metas del tipo de la campaña), `becas_de_campania()` (0117/0132/0149: carrera, tipo, meta
 * copiada, avance y lo alcanzado de cada inscripto), `elegir_carrera()` (0117) y `asignar_beca()` (0132). Los montos
 * llegan en centavos y la vista los muestra en pesos.
 *
 * Elegir la carrera o el tipo devuelven solo lo que cambió: la beca como quedó (avance, lo alcanzado, el aviso de carrera
 * corregida) se vuelve a leer de `becas_de_campania()`, así la fila no se arma a medias.
 *
 * Los rechazos de la base (`BC001`…`BC006`, `CZ001`, `CZ003`, `42501`, `22023`) se traducen al texto para mostrar; una
 * falla de conexión, de servicio o de sesión sale como excepción («sin conexión»).
 */

const RPC_CATALOGO = "carreras_de_beca";
const RPC_BECAS = "becas_de_campania";

/** Los códigos cuyo `message` es el texto para mostrar (migraciones 0117 y 0132). */
const CODIGOS_CON_TEXTO = new Set(["BC001", "BC002", "BC003", "BC004", "BC005", "BC006", "CZ001", "CZ003", "22023"]);
/** Lo que se ve ya no es cierto (la carrera ya no está, el colportor ya no es de la campaña, otra persona eligió la carrera). */
const CODIGOS_PARA_RECARGAR = new Set(["BC002", "BC003", "BC005", "CZ003"]);

// Los mismos textos que manda la base, por si un rechazo llega sin mensaje o un id inválido se frena antes de llamar.
const SIN_PERMISO = "Solo el coordinador de la campaña puede cambiar las becas de su equipo.";
const COLPORTOR_FUERA = "El colportor no está en esta campaña. Recargá la página.";
const CARRERA_FUERA = "Esa carrera no está en la lista. Recargá la página y elegí una de las que ofrece el panel.";
const SIN_META = "Falta configurar la meta de esta carrera. Avisale al administrador para que la cargue y volvé a asignar la beca.";
const GUARDADO_RECHAZADO = "No se pudo guardar la beca. Probá de nuevo más tarde.";

function esRechazo(error: unknown): error is ErrorSupabase {
  return error instanceof ErrorSupabase && causaDe(error) === "rechazo";
}

/** La base todavía no publicó la función (PostgREST `PGRST202`; Postgres `42883`). */
function laRpcNoExiste(error: unknown): boolean {
  return error instanceof ErrorSupabase && (error.codigo === "PGRST202" || error.codigo === "42883");
}

function enteroONulo(rpc: string, fila: Objeto, campo: string): number | null {
  return fila[campo] === null || fila[campo] === undefined ? null : numero(rpc, fila, campo);
}

/** Libros y monto (centavos → pesos) de una meta; si falta cualquiera de los dos, no hay meta. */
function metaDe(rpc: string, fila: Objeto, libros: string, monto: string): MetaDeBeca | null {
  const cantidad = enteroONulo(rpc, fila, libros);
  const centavos = enteroONulo(rpc, fila, monto);
  return cantidad === null || centavos === null ? null : { libros: cantidad, monto: centavos / 100 };
}

/** `MEDIA`, `COMPLETA` o `null`; cualquier otra cosa es una respuesta que el panel no entiende. */
function tipoDe(rpc: string, fila: Objeto, campo: string): TipoDeBeca | null {
  const valor = cadenaONula(rpc, fila, campo);
  if (valor === null) return null;
  if (valor === "MEDIA") return "media";
  if (valor === "COMPLETA") return "completa";
  throw new RespuestaInesperada(rpc, `\`${campo}\` no es un tipo de beca (${valor})`);
}

function aCarrera(fila: Objeto): CarreraDelCatalogo {
  const rpc = RPC_CATALOGO;
  return {
    id: cadena(rpc, fila, "carrera_id"),
    nombre: cadena(rpc, fila, "nombre"),
    metaMedia: metaDe(rpc, fila, "meta_media", "meta_media_monto"),
    metaCompleta: metaDe(rpc, fila, "meta_completa", "meta_completa_monto"),
  };
}

function aBeca(fila: Objeto): BecaDeColportor {
  const rpc = RPC_BECAS;
  const carreraId = cadenaONula(rpc, fila, "carrera_id");
  const elegidaEn = cadenaONula(rpc, fila, "carrera_elegida_en");
  const apuntaA = tipoDe(rpc, fila, "tipo_beca");
  const alcanzada = tipoDe(rpc, fila, "beca_alcanzada_tipo");
  const metaRecalculadaEn = cadenaONula(rpc, fila, "meta_recalculada_en");
  if (elegidaEn !== null && Number.isNaN(Date.parse(elegidaEn))) {
    throw new RespuestaInesperada(rpc, `\`carrera_elegida_en\` no es una fecha (${elegidaEn})`);
  }
  return {
    carrera:
      carreraId === null
        ? null
        : {
            id: carreraId,
            nombre: cadena(rpc, fila, "carrera_nombre"),
            // Una carrera cargada antes de que se guardara el día (0117) no tiene fecha: no se inventa una.
            elegidaEl: elegidaEn === null ? null : hoyEnMontevideo(new Date(elegidaEn)),
          },
    apuntaA,
    meta: apuntaA === null ? null : metaDe(rpc, fila, "meta_libros", "meta_monto_ces"),
    avance: { libros: numero(rpc, fila, "libros_bonificables"), monto: numero(rpc, fila, "compra_ces") / 100 },
    ...(alcanzada ? { alcanzada } : {}),
    ...(metaRecalculadaEn ? { metaRecalculadaEn } : {}),
  };
}

async function leerPorColportor(cliente: ClienteRpc, campaniaId: string): Promise<Record<string, BecaDeColportor>> {
  const crudas = await cliente.llamarRpc(RPC_BECAS, { p_campania_id: campaniaId });
  return Object.fromEntries(filas(RPC_BECAS, crudas).map((fila) => [cadena(RPC_BECAS, fila, "usuario_id"), aBeca(fila)]));
}

/**
 * El catálogo y la beca de cada inscripto. `null` cuando la base no las da: falta publicar alguna de las dos RPC, o la
 * campaña no las deja leer (`BC001` terminada, `42501`); Equipo se sigue viendo, sin la pestaña «Becas». Una caída sale
 * como excepción, igual que el resto de la vista: **ninguna falla se toma por «nadie tiene beca»**.
 */
export async function leerBecas(cliente: ClienteRpc, campaniaId: string): Promise<DatosDeBecas | null> {
  try {
    const [catalogo, porColportor] = await Promise.all([
      cliente.llamarRpc(RPC_CATALOGO, { p_campania_id: campaniaId }),
      leerPorColportor(cliente, campaniaId),
    ]);
    return { carreras: filas(RPC_CATALOGO, catalogo).map(aCarrera), porColportor };
  } catch (error) {
    if (laRpcNoExiste(error) || esRechazo(error)) return null;
    throw error;
  }
}

function textoDeRechazo(error: ErrorSupabase): string {
  if (error.codigo === "42501") return SIN_PERMISO;
  if (CODIGOS_CON_TEXTO.has(error.codigo) && error.message !== "") return error.message;
  if (error.codigo === "BC004") return SIN_META;
  return GUARDADO_RECHAZADO;
}

function rechazoDeBeca(error: unknown): ResultadoBeca {
  if (!esRechazo(error)) throw error;
  return {
    ok: false,
    mensaje: textoDeRechazo(error),
    ...(error.codigo === "BC004" ? { sinMeta: true } : {}),
    ...(CODIGOS_PARA_RECARGAR.has(error.codigo) ? { recargar: true } : {}),
  };
}

/** La beca de un colportor como quedó después de guardar. */
async function becaGuardada(cliente: ClienteRpc, campaniaId: string, colportorId: string): Promise<ResultadoBeca> {
  const beca = (await leerPorColportor(cliente, campaniaId))[colportorId];
  // Se guardó, pero ya no figura entre los inscriptos: lo que se ve ya no es cierto.
  return beca ? { ok: true, beca } : { ok: false, mensaje: COLPORTOR_FUERA, recargar: true };
}

/** `elegir_carrera()` (HU-BEC-004): una sola vez; con la misma carrera es un reintento y no es un error. */
export async function elegirCarreraRpc(cliente: ClienteRpc, campaniaId: string, colportorId: string, carreraId: string): Promise<ResultadoBeca> {
  // Los ids vienen del navegador: si no son ids, no hay nada que pedir.
  if (!UUID.test(colportorId)) return { ok: false, mensaje: COLPORTOR_FUERA, recargar: true };
  if (!UUID.test(carreraId)) return { ok: false, mensaje: CARRERA_FUERA, recargar: true };
  try {
    await cliente.llamarRpc("elegir_carrera", { p_campania_id: campaniaId, p_usuario_id: colportorId, p_carrera_id: carreraId });
    return await becaGuardada(cliente, campaniaId, colportorId);
  } catch (error) {
    return rechazoDeBeca(error);
  }
}

/** `asignar_beca()` (HU-BEC-006): fija la meta con la de la carrera; `null` es «Sin beca». */
export async function asignarTipoDeBecaRpc(cliente: ClienteRpc, campaniaId: string, colportorId: string, tipo: TipoDeBeca | null): Promise<ResultadoBeca> {
  if (!UUID.test(colportorId)) return { ok: false, mensaje: COLPORTOR_FUERA, recargar: true };
  try {
    const p_tipo = tipo === null ? null : tipo === "media" ? "MEDIA" : "COMPLETA";
    await cliente.llamarRpc("asignar_beca", { p_campania_id: campaniaId, p_usuarios: [colportorId], p_tipo });
    return await becaGuardada(cliente, campaniaId, colportorId);
  } catch (error) {
    return rechazoDeBeca(error);
  }
}
