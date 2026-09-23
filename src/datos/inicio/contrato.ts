/**
 * Contrato de datos de la pestaña Inicio: el tablero del coordinador.
 * Es lo que después implementa el BFF (bff-coordinadores). Describe datos
 * de negocio (montos y agregados de la región), nunca datos de clientes.
 */

/** Una de las cuatro cifras principales del tablero. */
export interface KpiRegion {
  id: string;
  etiqueta: string;
  valor: string;
  /** Texto corto bajo la cifra (variación, desglose, antigüedad). */
  detalle: string;
  /** Cuando el detalle destaca una variación positiva o algo que necesita atención. */
  tono?: "positivo" | "alerta";
}

export type EstadoJornadaColportor = "en-jornada" | "finalizada" | "sin-iniciar";

/** Fila de la tabla "Actividad de hoy". */
export interface ActividadColportorHoy {
  id: string;
  colportor: string;
  zona: string;
  /** `null` cuando el colportor todavía no inició la jornada. */
  horasHoy: string | null;
  ventasHoy: string | null;
  estado: EstadoJornadaColportor;
}

/** Avance de una zona respecto de su meta de campaña. */
export interface AvanceZona {
  id: string;
  zona: string;
  porcentajeMeta: number;
}

export type TonoPendiente = "hoy" | "atraso" | "por-autorizar" | "nueva";

export interface AccionPendiente {
  texto: string;
  /** Ruta de la pestaña a la que lleva el atajo. */
  href: string;
}

/** Ítem de "Pendientes de acción". Los botones sin acción diseñada quedan sin comportamiento. */
export interface PendienteAccion {
  id: string;
  titulo: string;
  etiqueta: string;
  tono: TonoPendiente;
  detalle: string;
  accionPrincipal: AccionPendiente;
  /** Botón secundario sin diálogo diseñado todavía (p. ej. "Rechazar", "Ver foto"). */
  accionSecundaria?: { texto: string; tono?: "peligro" };
}

/** Marcador de zona en el mini mapa (placeholder, sin librería de mapas). */
export interface PuntoMapaRegion {
  id: string;
  zona: string;
  /** Posición porcentual dentro del placeholder. */
  left: number;
  top: number;
}

export interface TableroInicio {
  kpis: KpiRegion[];
  actividadHoy: ActividadColportorHoy[];
  avancePorZona: AvanceZona[];
  pendientes: PendienteAccion[];
  mapaRegion: PuntoMapaRegion[];
}

export interface FuenteDatosInicio {
  obtenerTablero(): Promise<TableroInicio>;
}
