/**
 * Único punto de selección de la fuente de datos de la vista 24 (zonas).
 * Las vistas importan `fuenteZonas` y no se tocan.
 *
 * Con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`src/auth/modo.ts`) la fuente llama a las RPC con la sesión de la
 * coordinadora que entró (issue #18); el puente de la demo de abajo (#45) solo vale sin ellas.
 *
 * Mientras no haya sesión real del coordinador, y solo en desarrollo, si hay variables de Supabase
 * (`src/datos/supabase/config.ts`) la fuente llama a las RPC de la demo con la cuenta de ese puente (issue #45), igual que
 * Equipo. En cualquier build de producción la configuración se ignora y queda la simulada, igual que en el sitio de
 * prueba de Pages.
 */
import type { FuenteDatosZonas } from "@/datos/equipo/zonas/contrato";
import { crearFuenteZonasRpc } from "@/datos/equipo/zonas/rpc";
import { fuenteZonasSimulada } from "@/datos/equipo/zonas/simulado";
import { leerCampaniaElegida } from "@/datos/shell/campania-elegida-servidor";
import { modoDeAcceso } from "@/auth/modo";
import { crearClienteSupabase } from "@/datos/supabase/cliente";
import { leerConfigSupabase } from "@/datos/supabase/config";
import { fuenteDeSesion } from "@/datos/supabase/fuente-de-sesion";

export type {
  CalleMapa,
  CiudadDelCatalogo,
  CiudadDeCampania,
  ColportorDeCiudad,
  ColportorEnZona,
  DatosZonas,
  Esquina,
  FormaZona,
  FuenteDatosZonas,
  GuardarZonaEntrada,
  PoligonoGeojson,
  Punto,
  ResultadoAgregarCiudad,
  ResultadoAsignacion,
  ResultadoEliminarZona,
  ResultadoGuardarZona,
  TipoForma,
  VistaPreviaEntrada,
  VistaPreviaRechazada,
  VistaPreviaZona,
  ZonaDeCiudad,
} from "@/datos/equipo/zonas/contrato";

const configSupabase = leerConfigSupabase();

export const fuenteZonas: FuenteDatosZonas =
  modoDeAcceso() !== "apagado"
    ? fuenteDeSesion((cliente) => crearFuenteZonasRpc(cliente, leerCampaniaElegida))
    : configSupabase
      ? crearFuenteZonasRpc(crearClienteSupabase(configSupabase), leerCampaniaElegida)
      : fuenteZonasSimulada;
