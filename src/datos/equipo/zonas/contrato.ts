/**
 * Contrato de datos de la vista 24 (HU-CAM-006): zonas de la campaña. Lo implementa la fuente simulada
 * (`simulado.ts`) y la de las RPC de Supabase (`rpc.ts`, ADR-013: no hay BFF). La geometría (validez, conteo de
 * ubicaciones y borde por calles) la calcula el backend con PostGIS y pgRouting (ADR-018): el panel solo pide y dibuja.
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

/**
 * Cruce de calles al que se engancha una esquina, con los nombres para mostrar. Una calle desconocida es `""`:
 * las esquinas de los polígonos que la migración 0008 convirtió a ESQUINAS no tienen calles (`calle_a` y `calle_b`
 * son nulables).
 */
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
  /** Cuenta suspendida: conserva la zona que tenía, pero no se le puede asignar otra. */
  suspendido?: boolean;
}

export interface ZonaDeCiudad {
  id: string;
  nombre: string;
  tipoForma: TipoForma;
  /** `#RRGGBB`. Una zona que el backend guardó sin color llega con `COLOR_ZONA_SIN_COLOR` (`paleta.ts`) y `sinColor`. */
  color: string;
  /**
   * La zona no tiene color en la base (`color` es nulo): `color` es solo el gris con el que se dibuja. Al editarla no se manda
   * como `color` (la base la guardaría gris); sin `color` la base conserva que no tiene.
   */
  sinColor?: true;
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

/**
 * Colportor inscripto en la campaña, con la zona que tiene hoy. La zona de un colportor vive en su inscripción
 * (`campania_colportor.zona_id`): es una por campaña, de la ciudad que sea. Con la fuente de las RPC, cada ciudad
 * lista a todos los inscriptos; la simulada solo a los de Montevideo.
 */
export interface ColportorDeCiudad {
  id: string;
  nombre: string;
  /** `null` mientras no tenga zona en la campaña. */
  zonaId: string | null;
  zonaNombre: string | null;
  /** Cuenta suspendida: aparece marcado y la asignación de zona se rechaza (decisión del 30/09, coord #20). */
  suspendido?: boolean;
}

/** Calle para dibujar: `trazo` va de un extremo al otro. */
export interface CalleMapa {
  nombre: string;
  trazo: Punto[];
}

export interface CiudadDeCampania {
  id: string;
  /** La ciudad en el catálogo global: sirve para no ofrecerla de nuevo en «+ Agregar ciudad». */
  catalogoId: string;
  nombre: string;
  centro: Punto;
  zoom: number;
  /**
   * Solo los datos simulados traen calles. Con las RPC las dibujan los tiles
   * del mapa; de dónde salen los tiles está pendiente de decisión.
   */
  calles?: CalleMapa[];
  zonas: ZonaDeCiudad[];
  colportores: ColportorDeCiudad[];
}

/** Las zonas de la campaña con la que trabaja el panel. */
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

/** Lo que pasa a la fuente cuando se mira cómo quedaría la zona, antes de guardarla. */
export interface VistaPreviaEntrada {
  ciudadId: string;
  /** Presente al editar: esa zona no cuenta como superposición consigo misma. */
  zonaId?: string;
  forma: FormaZona;
}

export interface VistaPreviaZona {
  poligonoGeojson: PoligonoGeojson;
  /** «Incluye N ubicaciones.» (`ubicaciones_incluidas` del backend, backend-supabase#32). */
  ubicacionesIncluidas: number;
  /**
   * Si se superpone con otra zona viva de la ciudad, con el tramo para marcarlo en rojo.
   * Solo avisa: las zonas se pueden superponer y no bloquea el guardado (S56, backend-supabase#39).
   */
  superposicion: { zonaNombre: string; tramo: Punto[] } | null;
  /** Si comparte una calle como borde con otra zona (no es un error). */
  comparteCalle: { calle: string; zonaNombre: string; punto: Punto } | null;
}

/**
 * Respuesta a la vista previa cuando la base la rechaza (la campaña ya terminó, la ciudad se quitó, no hay permiso):
 * `rechazo` es el texto para mostrar. Una falla de conexión no es esto: la fuente tira la excepción.
 */
export interface VistaPreviaRechazada {
  rechazo: string;
}

export interface GuardarZonaEntrada {
  ciudadId: string;
  zonaId?: string;
  nombre: string;
  forma: FormaZona;
  /**
   * `#RRGGBB`. Al editar, el de la zona (guardar sin color se lo borraría), o ninguno si la zona no tiene (`sinColor`);
   * al crear, el que le toca de la paleta. La fuente simulada lo ignora y conserva el de siempre.
   */
  color?: string;
}

export type ResultadoGuardarZona = { ok: true; zona: ZonaDeCiudad } | { ok: false; mensaje: string };
export type ResultadoAsignacion = { ok: true } | { ok: false; mensaje: string };
/** `colportoresSinZona`: cuántos colportores quedaron sin zona por la baja. */
export type ResultadoEliminarZona = { ok: true; colportoresSinZona: number } | { ok: false; mensaje: string };
export type ResultadoAgregarCiudad = { ok: true; ciudad: CiudadDeCampania } | { ok: false; mensaje: string };

/**
 * Ciudad del catálogo global que se puede sumar a la campaña. `provincia` falta cuando la fuente no la tiene:
 * `ciudades_del_catalogo()` devuelve solo el nombre, porque `ciudad` no tiene esa columna (backend-supabase, 0033).
 */
export interface CiudadDelCatalogo {
  id: string;
  nombre: string;
  provincia?: string;
}

export interface FuenteDatosZonas {
  /** `null` si el coordinador no tiene una campaña que no haya terminado: no hay zonas que mostrar. */
  obtenerZonas(): Promise<DatosZonas | null>;
  /** Cruce de calles más cercano a un punto (backend-supabase#25). */
  esquinaMasCercana(ciudadId: string, punto: Punto): Promise<Esquina>;
  /** Tramo más corto por las calles entre dos esquinas (backend-supabase#25). */
  tramoPorCalles(ciudadId: string, desde: Punto, hasta: Punto): Promise<Punto[]>;
  vistaPreviaZona(entrada: VistaPreviaEntrada): Promise<VistaPreviaZona | VistaPreviaRechazada>;
  guardarZona(entrada: GuardarZonaEntrada): Promise<ResultadoGuardarZona>;
  /** `asignar_zona`: pone o cambia la zona de un colportor inscripto. */
  asignarZona(campaniaId: string, usuarioId: string, zonaId: string): Promise<ResultadoAsignacion>;
  /** `quitar_zona`, «Quitar»: deja al colportor sin zona. */
  quitarZona(campaniaId: string, usuarioId: string): Promise<ResultadoAsignacion>;
  /** `baja_zona`: los colportores asignados quedan sin zona; las ubicaciones no se tocan. */
  eliminarZona(campaniaId: string, zonaId: string): Promise<ResultadoEliminarZona>;
  /** Busca en el catálogo (por nombre o provincia, si la fuente tiene la provincia), sin las ciudades que ya están en la campaña. */
  buscarCiudades(campaniaId: string, texto: string): Promise<CiudadDelCatalogo[]>;
  /** `agregar_ciudad_a_campania`. */
  agregarCiudad(campaniaId: string, catalogoId: string): Promise<ResultadoAgregarCiudad>;
}
