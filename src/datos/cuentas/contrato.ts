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
  /**
   * Deuda con la casa editora, ya sin lo que el alquiler pagado de más le descontó («Alquiler fav»: el servidor lo traslada a
   * esta deuda y lo lee como `alquiler_trasladado`; el panel lo calcula de los tickets validados y el alquiler, igual que
   * `alquiler_calculado()`, y lo muestra en la fila). La deuda del alquiler se calcula aparte (alquiler de la campaña menos lo pagado).
   */
  deuda: number;
  /** Lo pagado de más a la casa editora: no se pierde, queda a favor y se descuenta de la próxima deuda. Lo calcula el servidor. */
  aFavor?: number;
  depositado: number;
  /** Lo cobrado y no depositado, sin descontar gastos del día: una referencia. */
  enMano: number;
  porCobrar: number;
  /**
   * Se dio de baja de la campaña: ya no debe alquiler y lo que pagó lo decide el coordinador (`de_baja` de
   * `cuentas_de_campania()`; decisión «Baja y alq.», 03/11). `fecha` es el instante ISO de la baja, si se sabe.
   */
  baja?: { fecha: string | null };
  /**
   * La fila es la de quien mira el panel (un coordinador inscripto en su propia campaña). Su alquiler no lo decide él: la
   * acción no se ofrece (el servidor contesta 42501, «No podés decidir qué hacer con tu propio alquiler»).
   */
  esVos?: boolean;
}

/**
 * Qué hace el coordinador con lo pagado de alquiler «por decidir» («Alq. baja», Cristian 04/11; `decidir_alquiler_pagado`
 * de la 0167/0181). Una sola elección para todo lo que está por decidir.
 * - `devolver`: DEVOLVER_AL_COLPORTOR. Los pagos validados después de la última decisión quedan anulados (nunca borrados):
 *   dejan de contar como pagados y como «Depositado», y la plata vuelve a figurar «en mano».
 * - `a-cuenta`: A_CUENTA_PROXIMO_DEPOSITO. Se descuenta de la deuda con la casa editora.
 * - `se-lo-queda`: SE_LO_QUEDA_EL_COORDINADOR. Queda con el coordinador; la deuda no se mueve.
 */
export type DestinoDeAlquiler = "devolver" | "a-cuenta" | "se-lo-queda";

/** Una decisión vigente sobre lo pagado de alquiler de un colportor (`alquiler_decision`). */
export interface DecisionDeAlquiler {
  id: string;
  colportorId: string;
  destino: DestinoDeAlquiler;
  /** Lo decidido en esa vez (todo lo que estaba por decidir). */
  monto: number;
  /** Nombre y apellido de quien decidió. */
  decididoPor: string;
  /** Instante ISO 8601 de la decisión. */
  decididoEn: string;
}

/** Lo que contesta la decisión: la que quedó registrada, o `yaEstaba` si no había nada por decidir (doble toque u otra persona). */
export type ResultadoDeDecision = { yaEstaba: false; decision: DecisionDeAlquiler } | { yaEstaba: true };

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
  /** Instante ISO de la validación; si falta, se toma `fecha`. Con él se sabe qué pagos llegaron después de una decisión. */
  validadoEn?: string;
  /**
   * Pago de alquiler devuelto al colportor (`deposito.anulado_at`, 0167): queda como historia y no cuenta como pagado, ni
   * como depositado. `en` es el instante ISO de la anulación.
   */
  anulado?: { en: string };
}

export interface DatosDeCuentas {
  campaniaId: string;
  /** Instante ISO 8601 de la lectura: de él salen «hoy» y «ayer» de las fechas de los tickets. */
  ahora: string;
  /** Monto fijo de la campaña por colportor; se ve como deuda y no bloquea nada (C7). */
  alquilerPorColportor: number;
  /**
   * El día (AAAA-MM-DD) en que la campaña dejó de cobrar alquiler, si se sabe. Solo tiene sentido con `alquilerPorColportor`
   * en 0; sin el dato el subtítulo no dice la fecha (41B·01). Hoy lo llena la fuente simulada; el servidor aún no lo trae.
   */
  alquilerDejoDeCobrarEl?: string;
  ciudades: CiudadDeCuentas[];
  colportores: ColportorDeCuentas[];
  /** Todos los tickets de la campaña, en cualquier estado. */
  tickets: TicketDeCuentas[];
  /** Las decisiones vigentes sobre el alquiler pagado «por decidir» (sin decisiones, vacío o ausente). */
  decisionesDeAlquiler?: DecisionDeAlquiler[];
}

export interface FuenteDatosCuentas {
  obtenerCuentas(): Promise<DatosDeCuentas>;
}

/** Por qué no se pudo guardar: sin conexión (se reintenta igual) o rechazado por el servidor (trae su texto). */
export type CausaDeFalla = "sin-conexion" | "rechazado";

export type ResultadoDeAccion<T> = { ok: true; valor: T } | { ok: false; causa: CausaDeFalla; mensaje?: string };

/** Escrituras de la vista. La fuente simulada las resuelve en el navegador; la real serán server actions. */
export interface AccionesCuentas {
  /** Cambia el alquiler de todos los inscriptos de la campaña. */
  editarAlquiler(monto: number): Promise<ResultadoDeAccion<number>>;
  /**
   * Decide qué se hace con todo lo pagado de alquiler «por decidir» de un colportor (`decidir_alquiler_pagado`, sin monto).
   * El servidor registra quién y cuándo.
   */
  decidirAlquiler(colportorId: string, destino: DestinoDeAlquiler): Promise<ResultadoDeAccion<ResultadoDeDecision>>;
}
