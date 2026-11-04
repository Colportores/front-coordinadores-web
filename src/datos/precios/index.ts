/**
 * Único punto de selección de la fuente de datos de la vista 27 (precios). Las vistas importan `fuentePrecios` y no se tocan.
 *
 * Con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`src/auth/modo.ts`) la fuente llama a las RPC con la sesión
 * de la coordinadora que entró (issue #18); el puente de la demo de abajo (#45) solo vale sin ellas. Mientras no haya sesión
 * real del coordinador, y solo en desarrollo, si hay variables de Supabase (`src/datos/supabase/config.ts`) la fuente llama a
 * las RPC de la demo. En cualquier build de producción la configuración se ignora y queda la simulada, igual que en el sitio
 * de prueba de Pages.
 */
import type { FuenteDatosPrecios } from "@/datos/precios/contrato";
import { crearFuentePreciosRpc } from "@/datos/precios/rpc";
import { fuentePreciosSimulada } from "@/datos/precios/simulado";
import { leerCampaniaElegida } from "@/datos/shell/campania-elegida-servidor";
import { modoDeAcceso } from "@/auth/modo";
import { crearClienteSupabase } from "@/datos/supabase/cliente";
import { leerConfigSupabase } from "@/datos/supabase/config";
import { fuenteDeSesion } from "@/datos/supabase/fuente-de-sesion";

export type {
  AccionesPrecios,
  CambioDePrecio,
  CausaDeFalla,
  CiudadDePrecios,
  DatosDePrecios,
  FuenteDatosPrecios,
  ItemDePrecio,
  ResultadoDeGuardado,
  TipoDeItem,
  TipoDeProducto,
} from "@/datos/precios/contrato";
export { claveDe } from "@/datos/precios/contrato";

const configSupabase = leerConfigSupabase();

export const fuentePrecios: FuenteDatosPrecios =
  modoDeAcceso() !== "apagado"
    ? fuenteDeSesion((cliente) => crearFuentePreciosRpc(cliente, leerCampaniaElegida))
    : configSupabase
      ? crearFuentePreciosRpc(crearClienteSupabase(configSupabase), leerCampaniaElegida)
      : fuentePreciosSimulada;
