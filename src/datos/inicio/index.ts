/**
 * Único punto de selección de la fuente de datos de Inicio.
 * Al conectar el BFF se cambia esta línea por la implementación real;
 * las vistas importan `fuenteInicio` y no se tocan.
 */
import type { FuenteDatosInicio } from "@/datos/inicio/contrato";
import { fuenteInicioSimulada } from "@/datos/inicio/simulado";

export type {
  AccionPendiente,
  ActividadColportorHoy,
  AvanceZona,
  EstadoJornadaColportor,
  FuenteDatosInicio,
  KpiRegion,
  PendienteAccion,
  PuntoMapaRegion,
  TableroInicio,
  TonoPendiente,
} from "@/datos/inicio/contrato";

export const fuenteInicio: FuenteDatosInicio = fuenteInicioSimulada;
