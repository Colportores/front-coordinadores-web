/**
 * Único punto de selección de la fuente de datos del shell.
 * Las vistas importan `fuenteShell` y no se tocan.
 *
 * Mientras no haya sesión real del coordinador, y solo en desarrollo, si hay variables de Supabase
 * (`src/datos/supabase/config.ts`) la fuente llama a las RPC de la demo con la cuenta de ese puente (issue #45), igual que
 * Equipo y la vista 24. En cualquier build de producción la configuración se ignora y queda la simulada, igual que en el
 * sitio de prueba de Pages.
 */
import { leerCampaniaElegida } from "@/datos/shell/campania-elegida-servidor";
import type { FuenteDatosShell } from "@/datos/shell/contrato";
import { crearFuenteShellRpc } from "@/datos/shell/rpc";
import { fuenteShellSimulada } from "@/datos/shell/simulado";
import { crearClienteSupabase } from "@/datos/supabase/cliente";
import { leerConfigSupabase } from "@/datos/supabase/config";

export type { CampaniaElegible, FuenteDatosShell, ResultadoCampanias, ResumenCoordinador } from "@/datos/shell/contrato";

const configSupabase = leerConfigSupabase();

export const fuenteShell: FuenteDatosShell = configSupabase
  ? crearFuenteShellRpc(crearClienteSupabase(configSupabase), leerCampaniaElegida)
  : fuenteShellSimulada;
