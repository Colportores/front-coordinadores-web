/**
 * Contrato de datos de la pestaña Equipo: colportores del coordinador, zonas,
 * precios por zona y acompañamientos. Es lo que después implementa el BFF
 * (bff-coordinadores).
 */

export type EstadoCobro = "bien" | "atencion" | "critico";

export interface FilaColportor {
  id: string;
  nombre: string;
  zonaId: string;
  zonaNombre: string;
  /** Formateado como en el diseño, p. ej. "28,4 h". */
  horasSemana: string;
  /** Formateado como en el diseño, p. ej. "$U 84K". */
  ventas: string;
  porcentajeCobrado: number;
  /**
   * Estado visual del % cobrado (verde/ámbar/rojo). El umbral numérico exacto
   * no está definido en el diseño ni en la documentación: se refleja tal cual
   * el diseño por fila; el criterio real lo define el negocio al conectar la HU.
   */
  estadoCobro: EstadoCobro;
  /** Formateado como en el diseño, p. ej. "hace 20 min". */
  ultimaSync: string;
  /**
   * Si la última sincronización es "vieja" y hay que alertar. El umbral exacto
   * (cuántas horas/días) no está definido en el diseño ni en la documentación:
   * lo decide el BFF al conectar la HU. Acá se refleja tal cual el diseño.
   */
  sincronizacionVieja: boolean;
}

export interface ColportorSinZona {
  id: string;
  nombre: string;
  nota: string;
}

export interface PrecioProductoZona {
  id: string;
  producto: string;
  /** Formateado como en el diseño, p. ej. "$U 1.450". */
  precioBase: string;
  /** Formateado como en el diseño, p. ej. "$U 1.500". */
  precioZona: string;
}

export interface JornadaSinAcompanamiento {
  id: string;
  /** P. ej. "Jornada de J. Cabrera · ayer". */
  titulo: string;
  /** P. ej. "3,4 h · Cerro Norte · sin acompañamiento registrado". */
  detalle: string;
}

export interface DatosAcompanamiento {
  jornadasSinAcompanamiento: JornadaSinAcompanamiento[];
  porcentajeJornadasAcompanadas: number;
}

export interface DatosEquipo {
  region: string;
  colportores: FilaColportor[];
  sinZonaAsignada: ColportorSinZona[];
  preciosPorZona: PrecioProductoZona[];
  acompanamiento: DatosAcompanamiento;
}

export interface FuenteDatosEquipo {
  obtenerEquipo(): Promise<DatosEquipo>;
}
