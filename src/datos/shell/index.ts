/**
 * Único punto de selección de la fuente de datos del shell.
 * Las vistas importan `fuenteShell` y no se tocan.
 *
 * Con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`src/auth/modo.ts`) la fuente llama a las RPC con la sesión
 * de la coordinadora que entró (issue #18). Sin ellas, y solo en desarrollo, si hay variables de la demo
 * (`src/datos/supabase/config.ts`) llama a las RPC con la cuenta de ese puente (issue #45), igual que Equipo y la vista 24.
 * En cualquier build de producción el puente se ignora y queda la simulada, igual que en el sitio de prueba de Pages.
 */
import { leerCampaniaElegida } from "@/datos/shell/campania-elegida-servidor";
import type { FuenteDatosShell } from "@/datos/shell/contrato";
import { crearFuenteShellRpc } from "@/datos/shell/rpc";
import { fuenteShellSimulada } from "@/datos/shell/simulado";
import { modoDeAcceso } from "@/auth/modo";
import { crearClienteSupabase } from "@/datos/supabase/cliente";
import { leerConfigSupabase } from "@/datos/supabase/config";
import { fuenteDeSesion } from "@/datos/supabase/fuente-de-sesion";

export type { CampaniaElegible, FuenteDatosShell, ResultadoCampanias, ResumenCoordinador } from "@/datos/shell/contrato";

const configSupabase = leerConfigSupabase();

export const fuenteShell: FuenteDatosShell =
  modoDeAcceso() !== "apagado"
    ? fuenteDeSesion((cliente) => crearFuenteShellRpc(cliente, leerCampaniaElegida))
    : configSupabase
      ? crearFuenteShellRpc(crearClienteSupabase(configSupabase), leerCampaniaElegida)
      : fuenteShellSimulada;
