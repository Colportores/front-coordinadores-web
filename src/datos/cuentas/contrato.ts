/**
 * Contrato de datos de Cuentas (vista 36): lo que cada colportor le debe a la casa editora, lo que depositó, lo que
 * tiene en mano y por cobrar, la deuda de alquiler y el historial de tickets (con los retiros que carga el coordinador
 * donde no hay banco). Describe datos de negocio, no detalles de pintado.
 *
 * V2: la pestaña se conecta después del 20/11 (plan-sprints §5). Hasta entonces solo existe `fuenteCuentasSimulada`.
 * Nunca viajan datos de clientes: el ticket es del depósito, no de la venta.
 */

/** A qué deuda baja un depósito. Un depósito tiene un solo destino (HU-CTA-004). */
export type DestinoDeTicket = "casa-editora" | "alquiler";

/** Cómo llegó la plata. El retiro lo carga el coordinador donde no hay banco y entra ya validado. */
export type MedioDeTicket = "deposito-banco" | "tarjeta-debito" | "tarjeta-credito" | "retiro-coordinador";

/** Los tres estados de `esquema-datos.md`. Solo `VALIDADO` acredita. */
export type EstadoDeTicket = "PENDIENTE" | "VALIDADO" | "RECHAZADO";

export interface CiudadDeCuentas {
  id: string;
  nombre: string;
  departamento: string;
  /** Si no hay banco, el colportor le entrega el efectivo al coordinador (retiro). */
  hayBanco: boolean;
}

export interface ColportorDeCuentas {
  id: string;
  nombre: string;
  ciudadId: string;
  /** Deuda con la casa editora. La del alquiler se calcula aparte (alquiler de la campaña menos lo pagado). */
  deuda: number;
  depositado: number;
  /** Lo cobrado y no depositado, sin descontar gastos del día: una referencia. */
  enMano: number;
  porCobrar: number;
}

export interface TicketDeCuentas {
  id: string;
  colportorId: string;
  /** Instante ISO 8601. */
  fecha: string;
  monto: number;
  medio: MedioDeTicket;
  /** Banco o tarjeta ("BROU", "Visa", "OCA"…). Ausente en el retiro. */
  entidad?: string;
  /** N° de autorización (tarjeta) o de recibo (depósito en banco). Ausente en el retiro. */
  numero?: string;
  destino: DestinoDeTicket;
  estado: EstadoDeTicket;
  /** Obligatorio cuando el estado es `RECHAZADO`. */
  motivoRechazo?: string;
  /** Si hay foto para pedir con una URL firmada (el retiro no tiene comprobante). */
  tieneFoto: boolean;
}

export interface DatosDeCuentas {
  campaniaId: string;
  /** Instante ISO 8601 de la lectura: de él salen «hoy» y «ayer» de las fechas de los tickets. */
  ahora: string;
  /** Monto fijo de la campaña por colportor; se ve como deuda y no bloquea nada (C7). */
  alquilerPorColportor: number;
  ciudades: CiudadDeCuentas[];
  colportores: ColportorDeCuentas[];
  /** Todos los tickets de la campaña, en cualquier estado. */
  tickets: TicketDeCuentas[];
}

export interface FuenteDatosCuentas {
  obtenerCuentas(): Promise<DatosDeCuentas>;
}

/** Lo que el coordinador carga al registrar el retiro de un efectivo. */
export interface NuevoRetiro {
  colportorId: string;
  /** Entero mayor que cero. */
  monto: number;
  /** Día del retiro, AAAA-MM-DD en hora de Montevideo; no puede ser futuro. */
  dia: string;
  destino: DestinoDeTicket;
}

/** Por qué no se pudo guardar: sin conexión (se reintenta igual) o rechazado por el servidor (trae su texto). */
export type CausaDeFalla = "sin-conexion" | "rechazado";

export type ResultadoDeAccion<T> = { ok: true; valor: T } | { ok: false; causa: CausaDeFalla; mensaje?: string };

/** Escrituras de la vista. La fuente simulada las resuelve en el navegador; la real serán server actions. */
export interface AccionesCuentas {
  /** El retiro entra ya VALIDADO (lo carga el mismo coordinador): acredita y baja la deuda del destino. */
  registrarRetiro(retiro: NuevoRetiro): Promise<ResultadoDeAccion<TicketDeCuentas>>;
  /** Cambia el alquiler de todos los inscriptos de la campaña. */
  editarAlquiler(monto: number): Promise<ResultadoDeAccion<number>>;
}
