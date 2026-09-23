/**
 * Contrato de datos de la pestaña Reportes: lo que las vistas necesitan y la
 * interfaz de la fuente de datos. Es lo que después implementa el BFF
 * (bff-coordinadores). Datos agregados de la región: nunca datos de clientes.
 */

/** Venta agregada de la región en una semana de la campaña. */
export interface VentaSemanal {
  /** Etiqueta corta de la semana (p. ej. "S1"). */
  semana: string;
  /** Monto vendido en la semana, en miles de $U. */
  montoMiles: number;
  /** Semana en curso: todavía no cerró, sus datos son parciales. */
  semanaActual?: boolean;
}

/** Horas trabajadas por un colportor en la semana en curso. */
export interface HorasColportor {
  id: string;
  nombre: string;
  horas: number;
  /** Por debajo del mínimo esperado de horas semanales: se resalta como alerta. */
  horasBajas?: boolean;
}

/** Agregados de toda la campaña para la región del coordinador. */
export interface ResumenCampania {
  horasTotalesRegion: number;
  librosColocados: number;
  visitasRegistradas: number;
  /** Porcentaje (0-100) de jornadas que tuvieron acompañamiento. */
  porcentajeJornadasAcompanadas: number;
  /** Porcentaje (0-100) cobrado sobre lo vendido. */
  porcentajeCobradoSobreVendido: number;
}

/** Punto de ejemplo en el placeholder del mapa: sin coordenadas ni PII reales. */
export interface MarcadorMapaRegion {
  id: string;
  /** Cantidad que muestra el marcador (p. ej. visitas o ventas del punto). */
  cantidad: number;
  /** Posición relativa dentro del placeholder, en porcentaje (0-100). */
  left: number;
  top: number;
}

export interface DatosReportes {
  region: string;
  ventasPorSemana: VentaSemanal[];
  horasPorColportor: HorasColportor[];
  resumenCampania: ResumenCampania;
  marcadoresMapa: MarcadorMapaRegion[];
}

export interface FuenteDatosReportes {
  obtenerReportes(): Promise<DatosReportes>;
}
