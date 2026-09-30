/**
 * Contrato de datos de la pestaña Equipo: colportores del coordinador, zonas,
 * precios por zona y acompañamientos. Es lo que después implementa el BFF
 * (bff-coordinadores).
 */

export type EstadoCobro = "bien" | "atencion" | "critico";

export interface FilaColportor {
  id: string;
  nombre: string;
  zonaId: string;
  zonaNombre: string;
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

export interface PrecioProductoZona {
  id: string;
  producto: string;
  /** Formateado como en el diseño, p. ej. "$U 1.450". */
  precioBase: string;
  /** Formateado como en el diseño, p. ej. "$U 1.500". */
  precioZona: string;
}

export interface JornadaSinAcompanamiento {
  id: string;
  /** P. ej. "Jornada de J. Cabrera · ayer". */
  titulo: string;
  /** P. ej. "3,4 h · Cerro Norte · sin acompañamiento registrado". */
  detalle: string;
}

export interface DatosAcompanamiento {
  jornadasSinAcompanamiento: JornadaSinAcompanamiento[];
  porcentajeJornadasAcompanadas: number;
}

export interface DatosEquipo {
  region: string;
  colportores: FilaColportor[];
  sinZonaAsignada: ColportorSinZona[];
  preciosPorZona: PrecioProductoZona[];
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
 * Datos de la vista 23 (añadir colportor). La búsqueda por email o nombre
 * todavía no tiene decisión de backend (coord #19): mientras tanto la fuente
 * entrega `candidatos` completos y la vista filtra en el cliente.
 */
export interface DatosAnadirColportor {
  campaniaId: string;
  /** P. ej. "Verano 2026". */
  campania: string;
  candidatos: CandidatoColportor[];
  equipoActual: MiembroEquipo[];
}

/** Respuesta a `POST /v1/campanias/:campaniaId/colportores {usuarioId}` (bff-coordinadores#3). */
export type ResultadoInscripcion = { ok: true } | { ok: false; mensaje: string };

export interface FuenteDatosEquipo {
  obtenerEquipo(): Promise<DatosEquipo>;
  obtenerAnadirColportor(): Promise<DatosAnadirColportor>;
  inscribirColportor(campaniaId: string, usuarioId: string): Promise<ResultadoInscripcion>;
}
