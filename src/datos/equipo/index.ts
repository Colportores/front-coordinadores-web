/**
 * Único punto de selección de la fuente de datos de Equipo.
 * Al conectar el BFF se cambia esta línea por la implementación real;
 * las vistas importan `fuenteEquipo` y no se tocan.
 *
 * Mientras tanto, y solo en desarrollo, si hay variables de Supabase (`src/datos/supabase/config.ts`) la
 * fuente lee el proyecto de la demo (issue #45). En cualquier build de producción la configuración se
 * ignora y queda la simulada, igual que en el sitio de prueba de Pages.
 */
import type { FuenteDatosEquipo } from "@/datos/equipo/contrato";
import { fuenteEquipoSimulada } from "@/datos/equipo/simulado";
import { crearFuenteEquipoSupabase } from "@/datos/equipo/supabase";
import { crearClienteSupabase } from "@/datos/supabase/cliente";
import { leerConfigSupabase } from "@/datos/supabase/config";

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

const configSupabase = leerConfigSupabase();

export const fuenteEquipo: FuenteDatosEquipo = configSupabase
  ? crearFuenteEquipoSupabase(crearClienteSupabase(configSupabase), fuenteEquipoSimulada)
  : fuenteEquipoSimulada;
