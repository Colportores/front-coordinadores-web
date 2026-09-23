/**
 * Contrato de datos de Cuentas: estado de cuenta del equipo y tickets por
 * validar. Es lo que después implementa el BFF (`bff-coordinadores`), así
 * que describe datos de negocio, no detalles de pintado.
 *
 * V2/V3: la pestaña se conecta recién con la migración "Stock y cuenta (V2)"
 * (después del 27/11). Hasta entonces solo existe `fuenteCuentasSimulada`.
 */

export interface ResumenCuentasEquipo {
  /** Deuda total del equipo con la campaña. */
  deudaTotal: number;
  /** Total depositado por el equipo en la campaña. */
  depositadoCampania: number;
}

/**
 * Alerta sobre el último depósito de un colportor:
 * - "atraso": pasó el último depósito registrado y está vencido.
 * - "ticket-pendiente": hay un ticket cargado esperando validación, todavía
 *   no hay un depósito confirmado.
 */
export type AlertaUltimoDeposito = "atraso" | "ticket-pendiente";

export interface UltimoDeposito {
  /** Fecha ya formateada como la muestra el diseño (p.ej. "10 jun"). Ausente cuando la alerta es "ticket-pendiente". */
  fecha?: string;
  alerta?: AlertaUltimoDeposito;
}

export interface FilaEstadoCuenta {
  id: string;
  colportor: string;
  deuda: number;
  depositado: number;
  enMano: number;
  porCobrar: number;
  ultimoDeposito: UltimoDeposito;
}

export type MedioTicket = "deposito" | "transferencia";

export interface TicketPorValidar {
  id: string;
  colportor: string;
  monto: number;
  medio: MedioTicket;
  /** Texto del medio tal como lo muestra el diseño (p.ej. "depósito BROU"). */
  medioDetalle: string;
  /** Fecha/hora ya formateada (p.ej. "hoy 10:42", "ayer 18:03"). */
  fecha: string;
  /** Número de recibo, cuando el ticket tiene comprobante cargado (HU-CTA-006). */
  recibo?: string;
  /** Si el ticket tiene foto de comprobante cargada. */
  tieneFoto: boolean;
}

export interface ListaTicketsPorValidar {
  tickets: TicketPorValidar[];
  /** Total de tickets pendientes de validar (puede ser mayor a `tickets.length` si la lista se recorta, como en el diseño). */
  totalPendientes: number;
}

export interface FuenteDatosCuentas {
  obtenerResumenEquipo(): Promise<ResumenCuentasEquipo>;
  obtenerEstadoCuenta(): Promise<{ filas: FilaEstadoCuenta[] }>;
  obtenerTicketsPorValidar(): Promise<ListaTicketsPorValidar>;
}
