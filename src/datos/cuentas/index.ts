/**
 * Único punto de selección de la fuente de datos de Cuentas.
 * Al conectar las RPC (V2, después del 20/11) se cambia esta línea por la implementación real; las vistas importan
 * `fuenteCuentas` y no se tocan.
 */
import type { FuenteDatosCuentas } from "@/datos/cuentas/contrato";
import { fuenteCuentasSimulada } from "@/datos/cuentas/simulado";

export type {
  AccionesCuentas,
  CausaDeFalla,
  CiudadDeCuentas,
  ColportorDeCuentas,
  DatosDeCuentas,
  DecisionDeAlquiler,
  DestinoDeAlquiler,
  DestinoDeTicket,
  EstadoDeTicket,
  FuenteDatosCuentas,
  MedioDeTicket,
  ResultadoDeAccion,
  ResultadoDeDecision,
  TicketDeCuentas,
} from "@/datos/cuentas/contrato";

export const fuenteCuentas: FuenteDatosCuentas = fuenteCuentasSimulada;
