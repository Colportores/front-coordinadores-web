/**
 * Único punto de selección de la fuente de datos de Equipo.
 * Al conectar el BFF se cambia esta línea por la implementación real;
 * las vistas importan `fuenteEquipo` y no se tocan.
 *
 * Con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`src/auth/modo.ts`) la fuente llama a las RPC con la sesión
 * de la coordinadora que entró (issue #18). Sin ellas, y solo en desarrollo, si hay variables de Supabase
 * (`src/datos/supabase/config.ts`) la fuente lee el proyecto de la demo (issue #45). En cualquier build de producción el puente
 * se ignora y queda la simulada, igual que en el sitio de prueba de Pages.
 */
import type { FuenteDatosEquipo } from "@/datos/equipo/contrato";
import { fuenteEquipoSimulada } from "@/datos/equipo/simulado";
import { crearFuenteEquipoSupabase } from "@/datos/equipo/supabase";
import { leerCampaniaElegida } from "@/datos/shell/campania-elegida-servidor";
import { modoDeAcceso } from "@/auth/modo";
import { crearClienteSupabase } from "@/datos/supabase/cliente";
import { leerConfigSupabase } from "@/datos/supabase/config";
import { fuenteDeSesion } from "@/datos/supabase/fuente-de-sesion";

export type {
  AcompanamientoDeColportor,
  CandidatoColportor,
  CiudadDeEquipo,
  ColportorDeEquipo,
  DatosAnadirColportor,
  DatosEquipoPorCiudad,
  EstadoCuenta,
  FuenteDatosEquipo,
  JornadaParaAcompanar,
  MiembroEquipo,
  ResultadoAcompanamiento,
  ResultadoBusqueda,
  ResultadoInscripcion,
  ResultadoJornadas,
  ZonaActualDeColportor,
  ZonaAnterior,
} from "@/datos/equipo/contrato";

const configSupabase = leerConfigSupabase();

export const fuenteEquipo: FuenteDatosEquipo =
  modoDeAcceso() !== "apagado"
    ? fuenteDeSesion((cliente) => crearFuenteEquipoSupabase(cliente, leerCampaniaElegida))
    : configSupabase
      ? crearFuenteEquipoSupabase(crearClienteSupabase(configSupabase), leerCampaniaElegida)
      : fuenteEquipoSimulada;
