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

/** A qué beca apunta el colportor (HU-BEC-006): la meta que se le muestra depende de esto y de su carrera. */
export type TipoDeBeca = "media" | "completa";

/** Las dos medidas de una meta de beca: es la misma meta vista en libros bonificables y en compra a la casa editora. */
export interface MetaDeBeca {
  /** Libros bonificables. */
  libros: number;
  /** Compra a la casa editora (CES), en $U enteros (la base lo guarda en centavos; la fuente real lo convierte). */
  monto: number;
}

/**
 * Una carrera del catálogo (`carrera` + `meta_beca`, HU-BEC-001). `null` en una de las metas: el administrador todavía no
 * la cargó (la vista avisa «Falta configurar la meta de esta carrera»).
 */
export interface CarreraDelCatalogo {
  id: string;
  nombre: string;
  metaMedia: MetaDeBeca | null;
  metaCompleta: MetaDeBeca | null;
}

/** La carrera que el coordinador le eligió al colportor, una sola vez; si hubo un error la corrige el administrador. */
export interface CarreraElegida {
  id: string;
  nombre: string;
  /** Día en que se eligió, `AAAA-MM-DD`. */
  elegidaEl: string;
}

/** Lo que muestra la tabla «Becas» de un colportor (HU-BEC-004, HU-BEC-006). */
export interface BecaDeColportor {
  carrera: CarreraElegida | null;
  /** `null`: nadie le asignó todavía a qué apunta, así que no tiene meta. */
  apuntaA: TipoDeBeca | null;
  /** La meta que tiene hoy (copia de la de su carrera al asignar el tipo, S50); `null` sin carrera o sin tipo. */
  meta: MetaDeBeca | null;
  /** Lo que lleva: libros bonificables y compra a la CES. */
  avance: MetaDeBeca;
}

/** Las becas de la campaña: el catálogo de carreras para elegir y la beca de cada colportor (por su id). */
export interface DatosDeBecas {
  carreras: CarreraDelCatalogo[];
  /** Un colportor sin entrada no tiene carrera ni avance todavía. */
  porColportor: Record<string, BecaDeColportor>;
}

/**
 * Respuesta a elegir la carrera o el tipo de beca de un colportor: la beca como quedó. `sinMeta`: la carrera no tiene la
 * meta cargada (hay que avisar al administrador); `recargar`: el colportor ya no figura en la campaña o la beca cambió
 * (otra persona elegió la carrera): lo que se está viendo ya no es cierto.
 */
export type ResultadoBeca =
  | { ok: true; beca: BecaDeColportor }
  | { ok: false; mensaje: string; sinMeta?: boolean; recargar?: boolean };

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
  /**
   * La pestaña «Becas» (V2: el backend se conecta después del 20/11). `null`: esta fuente todavía no trae las becas, la
   * pestaña lo dice en vez de mostrar una tabla vacía.
   */
  becas: DatosDeBecas | null;
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
  | { ok: false; mensaje: string; reiniciar?: boolean; sesionVencida?: true };

/**
 * Respuesta a inscribir (`inscribir_colportor()`). `mensaje` es el texto para mostrar. Si la cuenta ya está en otra
 * campaña (`CI007`), `campaniaEnConflicto` dice cuál.
 */
export type ResultadoInscripcion =
  | { ok: true }
  | { ok: false; mensaje: string; campaniaEnConflicto?: { id: string; nombre: string }; sesionVencida?: true };

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
  /**
   * El coordinador elige la carrera de un colportor de la campaña, del catálogo y una sola vez (HU-BEC-004). Si ya tiene
   * una, no se cambia desde el panel. Un rechazo de la regla vuelve como `ok: false`; una falla de conexión, como excepción.
   */
  elegirCarrera(campaniaId: string, colportorId: string, carreraId: string): Promise<ResultadoBeca>;
  /**
   * Asigna a qué beca apunta el colportor (HU-BEC-006): fija su meta en libros y en monto con la de su carrera. `null` es
   * «sin beca» (`tipo_beca` null en el esquema): lo deja sin meta. Cambiarlo no borra lo que ya alcanzó. Mismos rechazos y
   * fallas que `elegirCarrera`.
   */
  asignarTipoDeBeca(campaniaId: string, colportorId: string, tipo: TipoDeBeca | null): Promise<ResultadoBeca>;
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
