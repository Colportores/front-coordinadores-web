/**
 * Único punto de selección de la fuente de datos de Reportes.
 * Las vistas importan `fuenteReportes` y no se tocan.
 *
 * Las horas de la vista 32 (HU-REP-001) salen de `horas_por_ciudad_y_colportor()` (backend-supabase#95). Mientras no haya
 * sesión real del coordinador, y solo en desarrollo, si hay variables de Supabase (`src/datos/supabase/config.ts`) la
 * fuente llama a la RPC con la cuenta de la demo (issue #45), igual que Inicio, Equipo y Ciudades. En cualquier build de
 * producción la configuración se ignora y queda la simulada, igual que en el sitio de prueba de Pages.
 * Los agregados del Reportes del S4 (`obtenerReportes`) siguen simulados: son de la HU-REP-002 (#61).
 */
import type { FuenteDatosReportes } from "@/datos/reportes/contrato";
import { crearFuenteReportesRpc } from "@/datos/reportes/rpc";
import { fuenteReportesSimulada } from "@/datos/reportes/simulado";
import { leerCampaniaElegida } from "@/datos/shell/campania-elegida-servidor";
import { crearClienteSupabase } from "@/datos/supabase/cliente";
import { leerConfigSupabase } from "@/datos/supabase/config";

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

const configSupabase = leerConfigSupabase();

export const fuenteReportes: FuenteDatosReportes = configSupabase
  ? {
      obtenerReportes: fuenteReportesSimulada.obtenerReportes,
      ...crearFuenteReportesRpc(crearClienteSupabase(configSupabase), leerCampaniaElegida),
    }
  : fuenteReportesSimulada;
