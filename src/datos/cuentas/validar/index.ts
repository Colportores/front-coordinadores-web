/**
 * Único punto de selección de la fuente de «Validar tickets» (vista 29). Como el resto de Cuentas, hoy es la simulada; al
 * conectar las RPC (`tickets_de_campania`, `validacion_de_*`, `validar_ticket`, `confirmar_retiro`, `rechazar_*`) se cambia
 * esta línea y las vistas no se tocan.
 */
import type { FuenteValidarTickets } from "@/datos/cuentas/validar/contrato";
import { fuenteValidarTicketsSimulada } from "@/datos/cuentas/validar/simulado";

export type {
  AccionesValidarTickets,
  CifrasDelColportor,
  ConceptoPorValidar,
  DatosDeValidacion,
  EstadoPorValidar,
  FuenteValidarTickets,
  ItemPorValidar,
  LugarDelDeposito,
  Resolucion,
  ResultadoDeAccion,
  TarjetaDelDeposito,
  TipoPorValidar,
} from "@/datos/cuentas/validar/contrato";

export const fuenteValidarTickets: FuenteValidarTickets = fuenteValidarTicketsSimulada;
