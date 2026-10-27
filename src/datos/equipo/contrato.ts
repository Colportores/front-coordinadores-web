/**
 * Contrato de datos de la pestaña Equipo: la vista 33 (zonas y acompañamientos de cada colportor, por ciudad) y la
 * vista 23 (añadir colportor a la campaña). Es lo que después implementa el BFF (bff-coordinadores).
 */

/**
 * Una ciudad de la campaña. `departamento` viene de `ciudades_de_campania()` (0066, backend-supabase#92) y es `null`
 * en una ciudad vieja que todavía no lo tiene cargado: la lista de ciudades pone esas ciudades al final, sin título de
 * departamento.
 */
export interface CiudadDeEquipo {
  id: string;
  nombre: string;
  departamento: string | null;
}

/** La zona que tiene hoy el colportor. */
export interface ZonaActualDeColportor {
  id: string;
  nombre: string;
  /** Día en que la tiene, `AAAA-MM-DD`. */
  desde: string;
  /** `true`: el día es una cota (la zona ya la tenía cuando se empezó a guardar el historial), no la asignación real. */
  desdeInicial: boolean;
}

/** Una zona que el colportor tuvo y ya no tiene, con las fechas en que la tuvo (`AAAA-MM-DD`, ambas incluidas). */
export interface ZonaAnterior {
  nombre: string;
  desde: string;
  hasta: string;
  /** La zona se dio de baja después: figura igual, con el nombre que tenía. */
  eliminada: boolean;
  /** Ver `ZonaActualDeColportor.desdeInicial`. */
  inicial: boolean;
}

/** Una jornada acompañada de un colportor: la fila del historial de acompañamientos. */
export interface AcompanamientoDeColportor {
  jornadaId: string;
  /** Día de la jornada, `AAAA-MM-DD`. */
  dia: string;
  /** Horas de la jornada; `null` si todavía sigue abierta. */
  horas: number | null;
  /** Nombre de quien acompañó (cualquier coordinador, o un colportor). */
  acompanante: string;
  /** Quien acompañó es quien tiene la sesión: el panel lo escribe «Nombre (vos)». */
  acompananteEsVos: boolean;
}

/** Un colportor inscripto en la campaña, con lo que muestran las dos tablas de la vista 33. */
export interface ColportorDeEquipo {
  id: string;
  nombre: string;
  /** Ciudad de su zona actual; `null` mientras no tenga zona. */
  ciudadId: string | null;
  zonaActual: ZonaActualDeColportor | null;
  /** Del más viejo al más nuevo. */
  zonasAnteriores: ZonaAnterior[];
  /** Casas que cargó en las ciudades de la campaña, sin mirar la zona: las de una zona vieja siguen contando. */
  casasRegistradas: number;
  /** El más nuevo primero. Los «días sin acompañar» se cuentan desde el primero o, si no hay, desde el inicio de la campaña. */
  acompanamientos: AcompanamientoDeColportor[];
}

/** Los datos de la vista 33 de la campaña del coordinador. */
export interface DatosEquipoPorCiudad {
  campaniaId: string;
  campania: string;
  /** Inicio de la campaña, `AAAA-MM-DD`: de ahí salen las semanas S1, S2… de la tabla de acompañamientos. */
  campaniaInicio: string;
  /** Fin de la campaña, `AAAA-MM-DD`; `null` si no tiene. */
  campaniaFin: string | null;
  /** El día de hoy en Montevideo, `AAAA-MM-DD`: lo pone el servidor, de ahí salen los «días sin acompañar». */
  hoy: string;
  ciudades: CiudadDeEquipo[];
  /** Los de la lista de la campaña, con zona o sin ella. */
  colportores: ColportorDeEquipo[];
  /**
   * Personas que pidieron entrar a la campaña y esperan una respuesta. Siempre 0 hasta que exista el flujo «Unirse a una
   * campaña» (HU-CAM-009, después del 20/11): con 0 la franja «SOLICITUD» no aparece.
   */
  solicitudesPendientes: number;
}

/** Una jornada terminada del colportor entre las que elegir para registrar un acompañamiento. */
export interface JornadaParaAcompanar {
  id: string;
  /** `AAAA-MM-DD` */
  dia: string;
  horas: number;
  /** Quien ya la acompañó; `null` si nadie: solo esas se pueden registrar. */
  acompanante: string | null;
  /** Ver `AcompanamientoDeColportor.acompananteEsVos`. */
  acompananteEsVos: boolean;
}

export type ResultadoJornadas = { ok: true; jornadas: JornadaParaAcompanar[] } | { ok: false; mensaje: string };

/**
 * Respuesta a registrar un acompañamiento (`agregar_acompaniamiento()`). `yaEstaba`: ya figuraba a nombre del mismo
 * coordinador (un reintento o un doble toque): no se tocó nada. `recargar`: la jornada cambió y la lista que se está
 * viendo ya no es cierta.
 */
export type ResultadoAcompanamiento =
  | { ok: true; dia: string; acompanante: string; yaEstaba: boolean }
  | { ok: false; mensaje: string; recargar?: boolean };

/** Estado de la cuenta de un candidato (HU-CAM-004). `suspendida` no se puede añadir. */
export type EstadoCuenta = "pendiente_asignacion" | "activa" | "suspendida";

/** Cuenta que el coordinador puede buscar para añadirla a su campaña. */
export interface CandidatoColportor {
  id: string;
  nombre: string;
  email: string;
  estadoCuenta: EstadoCuenta;
  /** Nombre de la campaña en curso en la que ya está, o `null` si no está en ninguna. */
  campaniaActual: string | null;
  /**
   * La base no la deja añadir a esta campaña porque ya está en otra del mismo momento (`EN_OTRA_CAMPANIA`: las dos en curso
   * o las dos por empezar, 0058). Estar en una campaña en curso no alcanza: se puede sumar a una que empieza después.
   */
  enOtraCampania: boolean;
  /** Fecha de creación de la cuenta, ISO `AAAA-MM-DD`. */
  cuentaCreada: string;
}

/** Colportor que ya está en la campaña; `zonaNombre` es `null` mientras no tenga zona. */
export interface MiembroEquipo {
  id: string;
  nombre: string;
  zonaNombre: string | null;
}

/**
 * Datos de la vista 23 (añadir colportor) con los que abre la página: la campaña, los sugeridos y el
 * equipo que ya tiene. La búsqueda es del servidor (decisión de Cristian, 30/09): la vista pide cada
 * página con `buscarCandidatos`, no filtra una lista completa en el cliente.
 */
export interface DatosAnadirColportor {
  campaniaId: string;
  /** P. ej. "Verano 2026". */
  campania: string;
  /** Sin texto de búsqueda: hasta 5 cuentas pendientes de asignación, de la más nueva a la más antigua. */
  sugeridos: CandidatoColportor[];
  equipoActual: MiembroEquipo[];
}

/** Cuántas cuentas trae cada página de la búsqueda (`buscar_candidatos()`). Una página llena avisa que puede haber más. */
export const CUENTAS_POR_PAGINA = 10;

/** Una página de la búsqueda; `hayMas` es que la página vino llena y la siguiente puede traer más. */
export type ResultadoBusqueda =
  | { ok: true; candidatos: CandidatoColportor[]; hayMas: boolean }
  /**
   * `reiniciar`: el cursor de la página ya no sirve (la cuenta de la que seguía no existe más); hay que buscar
   * de nuevo desde el principio, reintentar la misma página no arregla nada.
   */
  | { ok: false; mensaje: string; reiniciar?: boolean };

/**
 * Respuesta a inscribir (`inscribir_colportor()`). `mensaje` es el texto para mostrar. Si la cuenta ya está en otra
 * campaña (`CI007`), `campaniaEnConflicto` dice cuál.
 */
export type ResultadoInscripcion =
  | { ok: true }
  | { ok: false; mensaje: string; campaniaEnConflicto?: { id: string; nombre: string } };

export interface FuenteDatosEquipo {
  /** `null`: el coordinador no tiene una campaña que no haya terminado. */
  obtenerEquipoPorCiudad(): Promise<DatosEquipoPorCiudad | null>;
  /**
   * Las jornadas terminadas de un colportor de la campaña, la más nueva primero. Un rechazo de la regla vuelve como
   * `ok: false`; una falla de conexión, como excepción.
   */
  jornadasParaAcompanar(campaniaId: string, colportorId: string): Promise<ResultadoJornadas>;
  /** El coordinador de la sesión se anota como acompañante de esa jornada. */
  registrarAcompanamiento(campaniaId: string, jornadaId: string): Promise<ResultadoAcompanamiento>;
  /** `null`: el coordinador no tiene una campaña en curso ni por empezar a la que añadir colportores. */
  obtenerAnadirColportor(): Promise<DatosAnadirColportor | null>;
  /**
   * Una página de cuentas que coinciden con `texto` (no vacío), primero las que empiezan con él y después por orden
   * alfabético. `despuesDe` es el id de la última cuenta de la página anterior (`null` para la primera).
   * Un rechazo de la regla vuelve como `ok: false`; una falla de conexión, como excepción.
   */
  buscarCandidatos(campaniaId: string, texto: string, despuesDe: string | null): Promise<ResultadoBusqueda>;
  inscribirColportor(campaniaId: string, usuarioId: string): Promise<ResultadoInscripcion>;
}
