/**
 * Único punto de selección de la fuente de datos de Equipo.
 * Al conectar el BFF se cambia esta línea por la implementación real;
 * las vistas importan `fuenteEquipo` y no se tocan.
 */
import type { FuenteDatosEquipo } from "@/datos/equipo/contrato";
import { fuenteEquipoSimulada } from "@/datos/equipo/simulado";

export type {
  CandidatoColportor,
  ColportorSinZona,
  DatosAcompanamiento,
  DatosAnadirColportor,
  DatosEquipo,
  EstadoCobro,
  EstadoCuenta,
  FilaColportor,
  FuenteDatosEquipo,
  JornadaReciente,
  MiembroEquipo,
  PrecioProductoCiudad,
  PreciosDeCiudad,
  ResultadoInscripcion,
  UltimoAcompanamiento,
} from "@/datos/equipo/contrato";

export const fuenteEquipo: FuenteDatosEquipo = fuenteEquipoSimulada;
