/**
 * Único punto de selección de la fuente de datos de la vista 24 (zonas).
 * Al conectar el BFF se cambia esta línea por la implementación real;
 * las vistas importan `fuenteZonas` y no se tocan.
 */
import type { FuenteDatosZonas } from "@/datos/equipo/zonas/contrato";
import { fuenteZonasSimulada } from "@/datos/equipo/zonas/simulado";

export type {
  CalleMapa,
  CiudadDeCampania,
  ColportorDeCiudad,
  ColportorEnZona,
  DatosZonas,
  Esquina,
  FormaZona,
  FuenteDatosZonas,
  GuardarZonaEntrada,
  PoligonoGeojson,
  Punto,
  ResultadoAsignacion,
  ResultadoGuardarZona,
  TipoForma,
  VistaPreviaEntrada,
  VistaPreviaZona,
  ZonaDeCiudad,
} from "@/datos/equipo/zonas/contrato";

export const fuenteZonas: FuenteDatosZonas = fuenteZonasSimulada;
