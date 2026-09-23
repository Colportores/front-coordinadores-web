/**
 * Único punto de selección de la fuente de datos de Cuentas.
 * Al conectar el BFF (V2, con la migración "Stock y cuenta (V2)") se cambia
 * esta línea por la implementación real; las vistas importan `fuenteCuentas`
 * y no se tocan.
 */
import type { FuenteDatosCuentas } from "@/datos/cuentas/contrato";
import { fuenteCuentasSimulada } from "@/datos/cuentas/simulado";

export type {
  AlertaUltimoDeposito,
  FilaEstadoCuenta,
  FuenteDatosCuentas,
  ListaTicketsPorValidar,
  MedioTicket,
  ResumenCuentasEquipo,
  TicketPorValidar,
  UltimoDeposito,
} from "@/datos/cuentas/contrato";

export const fuenteCuentas: FuenteDatosCuentas = fuenteCuentasSimulada;
