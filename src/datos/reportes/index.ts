/**
 * Único punto de selección de la fuente de datos de Reportes.
 * Las vistas importan `fuenteReportes` y no se tocan.
 *
 * Con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`src/auth/modo.ts`) la fuente llama a las RPC con la sesión de la
 * coordinadora que entró (issue #18); el puente de la demo de abajo (#45) solo vale sin ellas.
 *
 * Las horas de la vista 32 (HU-REP-001) salen de `horas_por_ciudad_y_colportor()` (backend-supabase#95). Mientras no haya
 * sesión real del coordinador, y solo en desarrollo, si hay variables de Supabase (`src/datos/supabase/config.ts`) la
 * fuente llama a la RPC con la cuenta de la demo (issue #45), igual que Inicio, Equipo y Ciudades. En cualquier build de
 * producción la configuración se ignora y queda la simulada, igual que en el sitio de prueba de Pages.
 * Los agregados del Reportes del S4 (`obtenerReportes`) siguen simulados: son de la HU-REP-002 (#61).
 */
import type { FuenteDatosReportes } from "@/datos/reportes/contrato";
import type { ClienteRpc } from "@/datos/supabase/cliente";
import { crearFuenteReportesRpc } from "@/datos/reportes/rpc";
import { fuenteReportesSimulada } from "@/datos/reportes/simulado";
import { leerCampaniaElegida } from "@/datos/shell/campania-elegida-servidor";
import { modoDeAcceso } from "@/auth/modo";
import { crearClienteSupabase } from "@/datos/supabase/cliente";
import { leerConfigSupabase } from "@/datos/supabase/config";
import { fuenteDeSesion } from "@/datos/supabase/fuente-de-sesion";

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
  VentasDelDia,
} from "@/datos/reportes/contrato";

const configSupabase = leerConfigSupabase();

/** Las horas salen de las RPC; el resto del reporte (ventas por día…) todavía es el simulado hasta que haya RPC (#61). */
function conRpc(cliente: ClienteRpc): FuenteDatosReportes {
  return { obtenerReportes: fuenteReportesSimulada.obtenerReportes, ...crearFuenteReportesRpc(cliente, leerCampaniaElegida) };
}

export const fuenteReportes: FuenteDatosReportes =
  modoDeAcceso() !== "apagado"
    ? fuenteDeSesion(conRpc)
    : configSupabase
      ? conRpc(crearClienteSupabase(configSupabase))
      : fuenteReportesSimulada;
