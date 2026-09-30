/**
 * Contrato de datos de la vista 24 (HU-CAM-006): zonas de la campaña. Es lo
 * que después implementa el BFF (bff-coordinadores#5). La geometría (validez,
 * superposición, conteo de ubicaciones y borde por calles) la calcula el
 * backend con PostGIS y pgRouting (ADR-018): el panel solo pide y dibuja.
 *
 * La zona es solo visual: le dice al colportor por dónde trabajar. La zona de
 * un colportor vive únicamente en `campania_colportor.zona_id`.
 */

export type TipoForma = "RADIAL" | "ESQUINAS";

/** Coordenadas en el orden de GeoJSON: `lon`, `lat`. */
export interface Punto {
  lon: number;
  lat: number;
}

/** Cruce de calles al que se engancha una esquina, con los nombres para mostrar. */
export interface Esquina extends Punto {
  calleA: string;
  calleB: string;
}

/** Polígono GeoJSON sin huecos: un solo anillo cerrado de `[lon, lat]`. */
export interface PoligonoGeojson {
  type: "Polygon";
  coordinates: [number, number][][];
}

export interface ColportorEnZona {
  id: string;
  nombre: string;
}

export interface ZonaDeCiudad {
  id: string;
  nombre: string;
  tipoForma: TipoForma;
  /** `#RRGGBB`. */
  color: string;
  /** Solo RADIAL. */
  centro?: Punto;
  /** Solo RADIAL, de 1 a 3000 m (supuesto S56). */
  radioM?: number;
  /** Solo ESQUINAS, en el orden en que se marcaron. */
  esquinas?: Esquina[];
  poligonoGeojson: PoligonoGeojson;
  colportores: ColportorEnZona[];
  ubicacionesRegistradas: number;
}

/** Colportor inscripto en la campaña, con la zona que tiene hoy en esta ciudad. */
export interface ColportorDeCiudad {
  id: string;
  nombre: string;
  /** `null` mientras no tenga zona en esta ciudad. */
  zonaId: string | null;
  zonaNombre: string | null;
}

/** Calle para dibujar: `trazo` va de un extremo al otro. */
export interface CalleMapa {
  nombre: string;
  trazo: Punto[];
}

export interface CiudadDeCampania {
  id: string;
  nombre: string;
  centro: Punto;
  zoom: number;
  /**
   * Solo los datos simulados traen calles. Con el BFF conectado las dibujan
   * los tiles del mapa; de dónde salen los tiles está pendiente de decisión.
   */
  calles?: CalleMapa[];
  zonas: ZonaDeCiudad[];
  colportores: ColportorDeCiudad[];
}

export interface DatosZonas {
  campaniaId: string;
  /** P. ej. "Verano 2026". */
  campania: string;
  ciudades: CiudadDeCampania[];
}

/** Forma que el coordinador está dibujando (o editando). */
export interface FormaZona {
  tipoForma: TipoForma;
  centro?: Punto;
  radioM?: number;
  /** Esquinas ya marcadas. La forma está cerrada cuando `cerrada` es `true`. */
  esquinas?: Esquina[];
  cerrada?: boolean;
}

export interface VistaPreviaEntrada {
  ciudadId: string;
  /** Presente al editar: esa zona no cuenta como superposición consigo misma. */
  zonaId?: string;
  forma: FormaZona;
}

export interface VistaPreviaZona {
  poligonoGeojson: PoligonoGeojson;
  /** «Incluye N ubicaciones ya registradas». */
  ubicacionesIncluidas: number;
  /** Al editar: cuántas ubicaciones cambian de zona si se guarda. */
  ubicacionesQueCambian: number;
  /** Si se superpone con otra zona viva de la ciudad, con el tramo en conflicto para marcarlo en rojo (CZ007). */
  superposicion: { zonaNombre: string; tramo: Punto[] } | null;
  /** Si comparte una calle como borde con otra zona (no es un error). */
  comparteCalle: { calle: string; zonaNombre: string; punto: Punto } | null;
}

export interface GuardarZonaEntrada {
  ciudadId: string;
  zonaId?: string;
  nombre: string;
  forma: FormaZona;
}

export type ResultadoGuardarZona = { ok: true; zona: ZonaDeCiudad } | { ok: false; mensaje: string };
export type ResultadoAsignacion = { ok: true } | { ok: false; mensaje: string };

export interface FuenteDatosZonas {
  obtenerZonas(): Promise<DatosZonas>;
  /** Cruce de calles más cercano a un punto (backend-supabase#25). */
  esquinaMasCercana(ciudadId: string, punto: Punto): Promise<Esquina>;
  /** Tramo más corto por las calles entre dos esquinas (backend-supabase#25). */
  tramoPorCalles(ciudadId: string, desde: Punto, hasta: Punto): Promise<Punto[]>;
  vistaPreviaZona(entrada: VistaPreviaEntrada): Promise<VistaPreviaZona>;
  guardarZona(entrada: GuardarZonaEntrada): Promise<ResultadoGuardarZona>;
  /** `asignar_zona` (bff-coordinadores#4): pone o cambia la zona de un colportor inscripto. */
  asignarZona(campaniaId: string, usuarioId: string, zonaId: string): Promise<ResultadoAsignacion>;
}
