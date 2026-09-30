/**
 * Único punto de selección de la fuente de datos de Ciudades.
 * Al conectar el BFF se cambia esta línea por la implementación real.
 */
import type { FuenteDatosCiudades } from "@/datos/ciudades/contrato";
import { fuenteCiudadesSimulada } from "@/datos/ciudades/simulado";

export type {
  CiudadDeCampania,
  ColportorDeCiudad,
  DatosCiudades,
  FuenteDatosCiudades,
  ZonaDeCiudad,
} from "@/datos/ciudades/contrato";

export const fuenteCiudades: FuenteDatosCiudades = fuenteCiudadesSimulada;
