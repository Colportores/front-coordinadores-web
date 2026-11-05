/**
 * Único punto de selección de la fuente de datos de Inicio (vista 31).
 * Las vistas importan `fuenteInicio` y no se tocan.
 *
 * Con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`src/auth/modo.ts`) la fuente llama a las RPC con la sesión de la
 * coordinadora que entró (issue #18); el puente de la demo de abajo (#45) solo vale sin ellas.
 *
 * Mientras no haya sesión real del coordinador, y solo en desarrollo, si hay variables de Supabase
 * (`src/datos/supabase/config.ts`) la fuente llama a `tablero_de_inicio()` con la cuenta de la demo (issue #45), igual
 * que Equipo y Ciudades. En cualquier build de producción la configuración se ignora y queda la simulada, igual que en el
 * sitio de prueba de Pages.
 */
import type { FuenteDatosInicio } from "@/datos/inicio/contrato";
import { crearFuenteInicioRpc } from "@/datos/inicio/rpc";
import { fuenteInicioSimulada } from "@/datos/inicio/simulado";
import { leerCampaniaElegida } from "@/datos/shell/campania-elegida-servidor";
import { modoDeAcceso } from "@/auth/modo";
import { crearClienteSupabase } from "@/datos/supabase/cliente";
import { leerConfigSupabase } from "@/datos/supabase/config";
import { fuenteDeSesion } from "@/datos/supabase/fuente-de-sesion";

export type {
  CiudadDelDia,
  ColportorDelDia,
  ColportorSinZona,
  EstadoJornada,
  FuenteDatosInicio,
  OpcionesTablero,
  PendienteDeAccion,
  ResultadoTablero,
  TableroDelDia,
} from "@/datos/inicio/contrato";

const configSupabase = leerConfigSupabase();

export const fuenteInicio: FuenteDatosInicio =
  modoDeAcceso() !== "apagado"
    ? fuenteDeSesion((cliente) => crearFuenteInicioRpc(cliente, leerCampaniaElegida))
    : configSupabase
      ? crearFuenteInicioRpc(crearClienteSupabase(configSupabase), leerCampaniaElegida)
      : fuenteInicioSimulada;
