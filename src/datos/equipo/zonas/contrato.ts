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
 * Ciudad del catálogo global que se puede sumar a la campaña. `departamento` sale de `ciudades_del_catalogo()`
 * (migración 0066, backend-supabase#92): `null` es una ciudad vieja que todavía no lo tiene cargado. Distingue a las
 * que se llaman igual (hay dos «San José»); el panel lo muestra, nunca lo pide: el departamento se elige de la lista
 * del catálogo, no se escribe (decisión de Cristian, 23/10, «Área depto»).
 */
export interface CiudadDelCatalogo {
  id: string;
  nombre: string;
  departamento: string | null;
}

/**
 * Estado de una casa en el mapa: los siete `color` de `house_status` (ADR-003, prioridad 1 a 7; decisión de Cristian
 * «Cobro panel», 06/10) más `SIN_VISITA` para la que no tiene estado todavía (`estado` nulo en `casas_de_zona()`;
 * decisión del 04/11, regla R7 del diseño 24P·01: «Sin visita», como en la vista 06 del celular). Nunca lleva montos
 * ni personas: el color dice que falta cobrar o está pagado, no a quién ni cuánto.
 */
export type EstadoDeCasa =
  | "SIN_VISITA"
  | "SIN_CONTESTAR"
  | "ENTREVISTA_PROGRAMADA"
  | "ENTREVISTA_SIN_VENTA"
  | "RECHAZO"
  | "COBRANZA_PENDIENTE"
  | "ENTREGA_Y_COBRANZA_PENDIENTE"
  | "VENTA_COMPLETA";

export type TipoDeCasa = "CASA" | "NEGOCIO" | "EDIFICIO";

/**
 * Un punto del mapa de la vista 24 (HU-CAM-006, `casas_de_la_ciudad()`, backend-supabase#254): todas las casas de la ciudad,
 * estén o no dentro de una zona. `zonaIds` son las zonas de la ciudad que la incluyen: vacío si no cae en ninguna («Casas
 * s/zona», decisión de Cristian del 05/11); la base informa una sola (la primera por nombre si se superponen).
 */
export interface CasaDeCiudad {
  id: string;
  lon: number;
  lat: number;
  tipo: TipoDeCasa;
  estado: EstadoDeCasa;
  /** Cuándo cambió por última vez el estado de la casa (marca ISO de `house_status.updated_at`); `null` si no tiene estado («Sin visita»). */
  ultimoCambio?: string | null;
  zonaIds: string[];
  /**
   * La dirección del lugar, como se guardó (`calle` y `numero` de la ubicación; «Tarj. punto», decisión de Cristian del 05/11).
   * `null` o ausente si la casa se marcó en el mapa sin dirección: la tarjeta no escribe la línea. Nunca es de una persona.
   */
  direccion?: string | null;
  /** Nombre del colportor que registró la casa; `null` o ausente si no se sabe (la persona se dio de baja del sistema). */
  registradaPor?: string | null;
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
  /** Busca en el catálogo por nombre o por departamento, sin las ciudades que ya están en la campaña. */
  buscarCiudades(campaniaId: string, texto: string): Promise<CiudadDelCatalogo[]>;
  /** `agregar_ciudad_a_campania`. */
  agregarCiudad(campaniaId: string, catalogoId: string): Promise<ResultadoAgregarCiudad>;
  /**
   * Todas las casas de la ciudad de la campaña con su estado, también las que no están en ninguna zona
   * (`casas_de_la_ciudad()` pide de a páginas: la fuente junta todas). Una falla es una excepción: nunca se toma por «no hay casas».
   */
  casasDeLaCiudad(campaniaId: string, ciudadId: string): Promise<CasaDeCiudad[]>;
}
