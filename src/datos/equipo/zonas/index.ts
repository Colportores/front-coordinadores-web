/**
 * Único punto de selección de la fuente de datos de la vista 24 (zonas).
 * Las vistas importan `fuenteZonas` y no se tocan.
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
import { crearClienteSupabase } from "@/datos/supabase/cliente";
import { leerConfigSupabase } from "@/datos/supabase/config";

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

export const fuenteZonas: FuenteDatosZonas = configSupabase
  ? crearFuenteZonasRpc(crearClienteSupabase(configSupabase), leerCampaniaElegida)
  : fuenteZonasSimulada;
