import {
  CUENTAS_POR_PAGINA,
  type CandidatoColportor,
  type DatosAnadirColportor,
  type EstadoCuenta,
  type FuenteDatosEquipo,
  type MiembroEquipo,
  type ResultadoBusqueda,
  type ResultadoInscripcion,
} from "@/datos/equipo/contrato";
import { campaniaProvisoria } from "@/datos/supabase/campania-provisoria";
import { causaDe, ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import {
  cadena,
  cadenaONula,
  esObjeto,
  filas,
  nombreVisible,
  type Objeto,
  RespuestaInesperada,
  UUID,
} from "@/datos/supabase/respuesta";

/**
 * Fuente de la vista 23 (HU-CAM-004) contra las RPC de Supabase (ADR-013): `campanias_del_coordinador()`,
 * `buscar_candidatos()`, `colportores_de_campania()` e `inscribir_colportor()`. Habla con un `ClienteRpc`, o sea
 * con el JWT del coordinador; de dónde sale esa sesión no es cosa de este archivo.
 *
 * Acá se traducen los rechazos de la base (`CI001`…`CI008`, `42501`, `22023`) al texto para mostrar: las
 * pantallas no conocen códigos. Una falla de conexión, de servicio o de sesión no es un rechazo y sale como
 * excepción (la vista la muestra como «sin conexión»).
 */

/** Cuántos caracteres de la búsqueda se mandan; el resto se descarta (un nombre o un email no pasan de ahí). */
const MAX_TEXTO_BUSQUEDA = 100;

const ESTADOS: Record<string, EstadoCuenta> = {
  PENDIENTE_ASIGNACION: "pendiente_asignacion",
  ACTIVA: "activa",
  SUSPENDIDA: "suspendida",
};

/** El día se cuenta en Montevideo, como en el backend (`hoy_montevideo()`): una cuenta creada a las 22:00 no cambia de día. */
const DIA_EN_MONTEVIDEO = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Montevideo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function diaEnMontevideo(rpc: string, instante: string): string {
  const fecha = new Date(instante);
  if (Number.isNaN(fecha.getTime())) throw new RespuestaInesperada(rpc, `\`creada_en\` no es una fecha (${instante})`);
  return DIA_EN_MONTEVIDEO.format(fecha);
}

/**
 * Una fila de `buscar_candidatos()`. El `motivo_bloqueo` de la fila no se lee: la vista lo deduce del estado de la
 * cuenta y de su campaña vigente, que son las dos reglas con las que la base lo calcula (`motivo_rechazo_inscripcion()`):
 * suspendida (`USUARIO_SUSPENDIDO`), o en otra campaña (`EN_OTRA_CAMPANIA`). Las demás (email sin verificar, ya inscripta)
 * la base ya las deja fuera de la lista, y desde la migración 0028 la baja de esta campaña ya no bloquea (se reactiva).
 * Leerlo solo serviría el día que el backend sume un motivo nuevo, y ese motivo vendría sin texto para mostrar.
 */
function aCandidato(fila: Objeto): CandidatoColportor {
  const rpc = "buscar_candidatos";
  const estado = ESTADOS[cadena(rpc, fila, "estado")];
  if (!estado) throw new RespuestaInesperada(rpc, `\`estado\` desconocido (${String(fila.estado)})`);
  const email = cadena(rpc, fila, "email");
  return {
    id: cadena(rpc, fila, "usuario_id"),
    nombre: nombreVisible(cadena(rpc, fila, "nombre"), cadena(rpc, fila, "apellido"), email),
    email,
    estadoCuenta: estado,
    campaniaActual: cadenaONula(rpc, fila, "campania_actual"),
    cuentaCreada: diaEnMontevideo(rpc, cadena(rpc, fila, "creada_en")),
  };
}

function aMiembro(fila: Objeto): MiembroEquipo {
  const rpc = "colportores_de_campania";
  return {
    id: cadena(rpc, fila, "usuario_id"),
    nombre: nombreVisible(cadena(rpc, fila, "nombre"), cadena(rpc, fila, "apellido"), cadena(rpc, fila, "email")),
    zonaNombre: cadenaONula(rpc, fila, "zona_nombre"),
  };
}

/**
 * Los textos de la base (`message`) son los que se muestran: son los de la HU-CAM-004. Estos son los mismos, por si
 * un rechazo llega sin mensaje. `CI008` ya no sale (migración 0028 reactiva la inscripción dada de baja): queda
 * el texto genérico.
 */
const TEXTO_INSCRIPCION: Record<string, string> = {
  CI001: "La campaña no existe.",
  CI002: "La campaña ya terminó. Elegí una campaña en curso o por empezar.",
  CI003: "El usuario no existe o fue dado de baja.",
  CI004: "El usuario todavía no verificó su email.",
  CI005: "La cuenta está suspendida. Contactá al administrador.",
  CI006: "Ya está inscripto en esta campaña.",
};

const SIN_PERMISO_INSCRIBIR = "Solo el coordinador de la campaña puede inscribir colportores en ella.";
const SIN_PERMISO_BUSCAR = "Solo el coordinador de la campaña puede buscar cuentas para inscribir en ella.";
const INSCRIPCION_RECHAZADA = "No se pudo añadir la cuenta. Probá de nuevo más tarde.";
const BUSQUEDA_RECHAZADA = "No se pudo buscar cuentas. Probá de nuevo más tarde.";
const CURSOR_PERDIDO = "No se encontró la última cuenta de la página anterior. Volvé a buscar desde el principio.";

/** `details` de `CI007`: la campaña donde ya está la cuenta. */
function campaniaEnConflicto(detalle: string): { id: string; nombre: string } | null {
  try {
    const datos: unknown = JSON.parse(detalle);
    if (esObjeto(datos) && typeof datos.campania_id === "string" && typeof datos.campania_nombre === "string") {
      return { id: datos.campania_id, nombre: datos.campania_nombre };
    }
  } catch {
    // Sin detalle o no es JSON: queda el mensaje.
  }
  return null;
}

function rechazoDeInscripcion(error: ErrorSupabase): ResultadoInscripcion {
  if (error.codigo === "42501") return { ok: false, mensaje: SIN_PERMISO_INSCRIBIR };
  if (error.codigo === "CI007") {
    const conflicto = campaniaEnConflicto(error.detalle);
    const mensaje = error.message || (conflicto ? `Está en campaña ${conflicto.nombre}. Reasignar primero.` : "Está en otra campaña. Reasignar primero.");
    return conflicto ? { ok: false, mensaje, campaniaEnConflicto: conflicto } : { ok: false, mensaje };
  }
  // `Object.hasOwn`: un código como «constructor» no puede salir del prototipo como si fuera un rechazo conocido.
  if (Object.hasOwn(TEXTO_INSCRIPCION, error.codigo)) {
    return { ok: false, mensaje: error.message || TEXTO_INSCRIPCION[error.codigo] };
  }
  return { ok: false, mensaje: INSCRIPCION_RECHAZADA };
}

function rechazoDeBusqueda(error: ErrorSupabase): Extract<ResultadoBusqueda, { ok: false }> {
  if (error.codigo === "42501") return { ok: false, mensaje: SIN_PERMISO_BUSCAR };
  if (error.codigo === "22023") return { ok: false, mensaje: CURSOR_PERDIDO, reiniciar: true };
  if (Object.hasOwn(TEXTO_INSCRIPCION, error.codigo)) {
    return { ok: false, mensaje: error.message || TEXTO_INSCRIPCION[error.codigo] };
  }
  return { ok: false, mensaje: BUSQUEDA_RECHAZADA };
}

/** Un rechazo de la regla se traduce; una caída, un 5xx o una sesión vencida siguen como excepción. */
function esRechazo(error: unknown): error is ErrorSupabase {
  return error instanceof ErrorSupabase && causaDe(error) === "rechazo";
}

type FuenteAnadir = Pick<FuenteDatosEquipo, "obtenerAnadirColportor" | "buscarCandidatos" | "inscribirColportor">;

/**
 * @param campaniaElegida la campaña que eligió la coordinadora en el topbar (#70), si hay; sin ella o si ya no figura en
 *   su lista, la primera (`campaniaProvisoria`).
 */
export function crearFuenteAnadirRpc(
  cliente: ClienteRpc,
  campaniaElegida: () => Promise<string | null> = async () => null,
): FuenteAnadir {
  return {
    async obtenerAnadirColportor(): Promise<DatosAnadirColportor | null> {
      // La campaña del panel es la misma que usa la vista 24 (`campaniaProvisoria`: la elegida en el topbar o, si no, la
      // primera de la lista, con las en curso antes). Una campaña por empezar también acepta colportores (decisión de Cristian,
      // 21/10, «Antes inicio»; migración 0058): se arma el equipo antes del primer día. Solo una terminada la rechaza (`CI002`).
      const campania = await campaniaProvisoria(cliente, await campaniaElegida());
      if (!campania) return null;
      const { id: campaniaId, nombre } = campania;

      try {
        const [sugeridos, equipo] = await Promise.all([
          cliente.llamarRpc("buscar_candidatos", { p_campania_id: campaniaId, p_texto: null, p_despues_de: null }),
          cliente.llamarRpc("colportores_de_campania", { p_campania_id: campaniaId }),
        ]);
        return {
          campaniaId,
          campania: nombre,
          sugeridos: filas("buscar_candidatos", sugeridos).map(aCandidato),
          equipoActual: filas("colportores_de_campania", equipo).map(aMiembro),
        };
      } catch (error) {
        // Terminó entre la lista de campañas y esta llamada (`CI002`): no hay campaña a la que añadir.
        if (error instanceof ErrorSupabase && error.codigo === "CI002") return null;
        throw error;
      }
    },

    async buscarCandidatos(campaniaId, texto, despuesDe): Promise<ResultadoBusqueda> {
      // Por caracteres, no por unidades UTF-16: `slice` en el límite partiría un emoji y mandaría media letra.
      const buscado = Array.from(texto.trim()).slice(0, MAX_TEXTO_BUSQUEDA).join("").trim();
      if (buscado === "") return { ok: true, candidatos: [], hayMas: false };
      // El cursor viene del navegador: si no es una cuenta, no hay de dónde seguir.
      if (despuesDe !== null && !UUID.test(despuesDe)) return { ok: false, mensaje: CURSOR_PERDIDO, reiniciar: true };
      try {
        const pagina = filas(
          "buscar_candidatos",
          await cliente.llamarRpc("buscar_candidatos", {
            p_campania_id: campaniaId,
            p_texto: buscado,
            p_despues_de: despuesDe,
          }),
        ).map(aCandidato);
        return { ok: true, candidatos: pagina, hayMas: pagina.length >= CUENTAS_POR_PAGINA };
      } catch (error) {
        if (esRechazo(error)) return rechazoDeBusqueda(error);
        throw error;
      }
    },

    async inscribirColportor(campaniaId, usuarioId): Promise<ResultadoInscripcion> {
      // El id de la cuenta viene del navegador (el de la campaña, atado a la acción en el servidor).
      if (!UUID.test(usuarioId)) return { ok: false, mensaje: TEXTO_INSCRIPCION.CI003 };
      try {
        await cliente.llamarRpc("inscribir_colportor", { p_campania_id: campaniaId, p_usuario_id: usuarioId });
        return { ok: true };
      } catch (error) {
        if (esRechazo(error)) return rechazoDeInscripcion(error);
        throw error;
      }
    },
  };
}
