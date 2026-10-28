/**
 * Contrato de datos de la pestaña Reportes: lo que las vistas necesitan y la
 * interfaz de la fuente de datos. Es lo que después implementan las RPC de
 * Supabase (el BFF es implementación futura, ADR-013). Datos agregados de la
 * región: nunca datos de clientes.
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
  resumenCampania: ResumenCampania;
  marcadoresMapa: MarcadorMapaRegion[];
}

/**
 * Fecha de calendario `AAAA-MM-DD`, en el día de Montevideo (el de la jornada, no el del navegador).
 * Nunca lleva hora: el panel no hace cuentas con zonas horarias.
 */
export type Fecha = string;

/**
 * Lo que un colportor hizo en un día (vista 32, HU-REP-002): cifras agregadas, nunca quién compró ni cuánto compró
 * cada persona (el coordinador ve montos, no clientes).
 */
export interface VentasDelDia {
  /** Visitas con la entrevista hecha: resultado `VENTA` o `ENTREVISTA` (HU-VIS-005). `NO_CONTESTO` y `COBRANZA` no cuentan. */
  presentaciones: number;
  /** Ventas hechas en el día. */
  ventas: number;
  /** Monto vendido en el día, en $U. */
  monto: number;
  /**
   * Lo cobrado de lo vendido en el día, en $U: de ahí sale el % por cobrar. Es V2 (depende de los cobros y de Cuentas,
   * HU-COB-005 y HU-CTA-005): hasta entonces la fuente lo deja en `null` y el panel no muestra esa cifra.
   */
  cobrado: number | null;
}

/**
 * Un colportor de la campaña con sus horas y sus ventas por día (vista 32, HU-REP-001 y HU-REP-002).
 * Solo el nombre: ni correo, ni clientes, ni ubicaciones, ni la hora de inicio y fin de cada jornada.
 */
export interface ColportorHoras {
  id: string;
  /** Nombre y apellido, tal cual se muestran. */
  nombre: string;
  /**
   * Horas trabajadas en cada día con datos (jornadas cerradas, sumadas por día). Un día que no figura es un día
   * sin datos —el colportor no tiene jornadas cerradas ese día—, no un día de 0 horas: se muestra con guion y no
   * lleva tendencia. Una jornada sin `fin` no suma horas hasta que se cierre (HU-JOR-002).
   */
  horasPorDia: Readonly<Record<Fecha, number>>;
  /**
   * Cuántas de las jornadas cerradas de cada día tuvieron acompañante (`jornada.acompaniante_id`, HU-JOR-004). Figura el
   * mismo conjunto de días que `horasPorDia` (un día con jornadas cerradas y 0 acompañadas figura con 0); un día que no
   * figura es un día sin datos, no un día sin acompañamiento. De ahí sale «jornadas con acompañamiento» del rango (HU-REP-001).
   */
  acompaniadasPorDia: Readonly<Record<Fecha, number>>;
  /**
   * Presentaciones, ventas y monto de cada día con datos. Igual que las horas, un día que no figura es un día sin
   * datos (no se pudo sincronizar), no un día de 0 ventas: se muestra con guion y no lleva tendencia.
   */
  ventasPorDia: Readonly<Record<Fecha, VentasDelDia>>;
  /**
   * Su último día con datos, solo si dejó de llegar información y hace falta avisarlo: el panel escribe «sin datos
   * desde el 17/10». Cuándo corresponde avisar lo decide la fuente; el panel solo lo muestra.
   */
  sinDatosDesde: Fecha | null;
}

/** Una ciudad de la campaña con los colportores de sus zonas (la ciudad de un colportor sale de su zona actual). */
export interface CiudadHoras {
  id: string;
  nombre: string;
  /** Departamento de la ciudad, para agrupar la lista. `null` si la fuente todavía no lo sabe. */
  departamento: string | null;
  colportores: ColportorHoras[];
}

/** Lo que necesita la vista 32: las ciudades de la campaña y sus colportores, con las horas y las ventas de cada día. */
export interface DatosHoras {
  /** Primer día de la campaña: de ahí se cuentan las semanas (S1, S2…). */
  inicioCampania: Fecha;
  /** Último día de la campaña; `null` si no tiene fecha de fin. Una campaña terminada se lee igual (se liquidan viáticos). */
  finCampania: Fecha | null;
  /** El día de hoy en Montevideo. Lo que cae hoy está en curso: no se compara. */
  hoy: Fecha;
  ciudades: CiudadHoras[];
}

export interface FuenteDatosReportes {
  obtenerReportes(): Promise<DatosReportes>;
  /** Las horas y las ventas de la campaña por ciudad y colportor, o `null` si el coordinador no tiene una campaña que consultar. */
  obtenerHoras(): Promise<DatosHoras | null>;
}
