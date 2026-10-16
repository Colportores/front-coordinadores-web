/**
 * Contrato de datos de la pestaña Equipo: colportores del coordinador (con su
 * ciudad y sus zonas), precios por ciudad y acompañamientos. Es lo que después implementa el BFF
 * (bff-coordinadores).
 */

export type EstadoCobro = "bien" | "atencion" | "critico";

export interface FilaColportor {
  id: string;
  nombre: string;
  /** Ciudad de la campaña a la que pertenece el colportor (los precios son por ciudad). */
  ciudadId: string;
  ciudadNombre: string;
  /** Zonas asignadas (solo visual); vacío mientras no tenga ninguna: se muestra «Sin asignar». */
  zonas: string[];
  /** Formateado como en el diseño, p. ej. "28,4 h". */
  horasSemana: string;
  /** Formateado como en el diseño, p. ej. "$U 84K". */
  ventas: string;
  porcentajeCobrado: number;
  /**
   * Estado visual del % cobrado (verde/ámbar/rojo). El umbral numérico exacto
   * no está definido en el diseño ni en la documentación: se refleja tal cual
   * el diseño por fila; el criterio real lo define el negocio al conectar la HU.
   */
  estadoCobro: EstadoCobro;
  /** Formateado como en el diseño, p. ej. "hace 20 min". */
  ultimaSync: string;
  /**
   * Si la última sincronización es "vieja" y hay que alertar. El umbral exacto
   * (cuántas horas/días) no está definido en el diseño ni en la documentación:
   * lo decide el BFF al conectar la HU. Acá se refleja tal cual el diseño.
   */
  sincronizacionVieja: boolean;
}

export interface ColportorSinZona {
  id: string;
  nombre: string;
  nota: string;
}

export interface PrecioProductoCiudad {
  id: string;
  producto: string;
  /** Formateado como en el diseño, p. ej. "$U 1.450". */
  precioBase: string;
  /** Precio configurado para la ciudad, formateado, p. ej. "$U 1.500". */
  precioCiudad: string;
}

/** Precios de los productos de una ciudad de la campaña (`campania_ciudad`). */
export interface PreciosDeCiudad {
  ciudadId: string;
  ciudadNombre: string;
  productos: PrecioProductoCiudad[];
}

/** Último acompañamiento registrado: a quién, qué día y quién acompañó. */
export interface UltimoAcompanamiento {
  id: string;
  colportor: string;
  /** Día de la jornada, en texto como lo muestra el panel, p. ej. "ayer" o "lun 28/09". */
  dia: string;
  acompaniante: string;
}

/** Jornada finalizada reciente del equipo, candidata a registrarle un acompañamiento. */
export interface JornadaReciente {
  id: string;
  colportor: string;
  /** Día de la jornada, p. ej. "ayer". */
  dia: string;
  /** P. ej. "3,4 h · Cerro Norte". */
  detalle: string;
}

export interface DatosAcompanamiento {
  /** Más reciente primero. */
  ultimosAcompanamientos: UltimoAcompanamiento[];
  /** Últimas jornadas del equipo sin acompañamiento, para elegir al registrar uno. */
  jornadasRecientes: JornadaReciente[];
  /** Quien registra (el coordinador de la sesión): figura como acompañante. */
  acompaniante: string;
  /** Jornadas finalizadas de la campaña con acompañamiento registrado. */
  jornadasAcompanadas: number;
  /** Jornadas finalizadas de la campaña: el % acompañado se calcula con estos dos números. */
  jornadasTotales: number;
}

export interface DatosEquipo {
  region: string;
  colportores: FilaColportor[];
  sinZonaAsignada: ColportorSinZona[];
  preciosPorCiudad: PreciosDeCiudad[];
  acompanamiento: DatosAcompanamiento;
}

/** Estado de la cuenta de un candidato (HU-CAM-004). `suspendida` no se puede añadir. */
export type EstadoCuenta = "pendiente_asignacion" | "activa" | "suspendida";

/** Cuenta que el coordinador puede buscar para añadirla a su campaña. */
export interface CandidatoColportor {
  id: string;
  nombre: string;
  email: string;
  estadoCuenta: EstadoCuenta;
  /** Nombre de la campaña en la que ya está, o `null` si no está en ninguna. */
  campaniaActual: string | null;
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
  obtenerEquipo(): Promise<DatosEquipo>;
  /** `null`: el coordinador no tiene una campaña en curso a la que añadir colportores. */
  obtenerAnadirColportor(): Promise<DatosAnadirColportor | null>;
  /**
   * Una página de cuentas que coinciden con `texto` (no vacío), primero las que empiezan con él y después por orden
   * alfabético. `despuesDe` es el id de la última cuenta de la página anterior (`null` para la primera).
   * Un rechazo de la regla vuelve como `ok: false`; una falla de conexión, como excepción.
   */
  buscarCandidatos(campaniaId: string, texto: string, despuesDe: string | null): Promise<ResultadoBusqueda>;
  inscribirColportor(campaniaId: string, usuarioId: string): Promise<ResultadoInscripcion>;
}
