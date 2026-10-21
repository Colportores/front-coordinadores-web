/**
 * Único punto de selección de la fuente de datos de Reportes.
 * Al conectar la RPC de horas (backend-supabase#95) se cambia esta línea por la implementación real;
 * las vistas importan `fuenteReportes` y no se tocan.
 */
import type { FuenteDatosReportes } from "@/datos/reportes/contrato";
import { fuenteReportesSimulada } from "@/datos/reportes/simulado";

export type {
  CiudadHoras,
  ColportorHoras,
  DatosHoras,
  DatosReportes,
  Fecha,
  FuenteDatosReportes,
  MarcadorMapaRegion,
  ResumenCampania,
  VentaSemanal,
} from "@/datos/reportes/contrato";

export const fuenteReportes: FuenteDatosReportes = fuenteReportesSimulada;
