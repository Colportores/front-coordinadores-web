/**
 * Único punto de selección de la fuente de datos de Reportes.
 * Al conectar el BFF se cambia esta línea por la implementación real;
 * las vistas importan `fuenteReportes` y no se tocan.
 */
import type { FuenteDatosReportes } from "@/datos/reportes/contrato";
import { fuenteReportesSimulada } from "@/datos/reportes/simulado";

export type {
  DatosReportes,
  FuenteDatosReportes,
  HorasColportor,
  MarcadorMapaRegion,
  ResumenCampania,
  VentaSemanal,
} from "@/datos/reportes/contrato";

export const fuenteReportes: FuenteDatosReportes = fuenteReportesSimulada;
