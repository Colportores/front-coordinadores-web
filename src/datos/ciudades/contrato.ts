/**
 * Contrato de datos de la pestaña Ciudades (HU-CAM-006), versión mínima de solo
 * lectura: las ciudades de la campaña con sus zonas y los colportores de cada
 * una. La vista completa (dibujar, modificar y asignar zonas) es la vista 24.
 */

export interface ColportorDeCiudad {
  id: string;
  nombre: string;
}

export interface ZonaDeCiudad {
  id: string;
  nombre: string;
  colportores: ColportorDeCiudad[];
}

export interface CiudadDeCampania {
  id: string;
  nombre: string;
  zonas: ZonaDeCiudad[];
  /** Colportores de la ciudad que todavía no tienen zona. */
  sinAsignar: ColportorDeCiudad[];
}

export interface DatosCiudades {
  /** P. ej. "Verano 2026". */
  campania: string;
  ciudades: CiudadDeCampania[];
}

export interface FuenteDatosCiudades {
  obtenerCiudades(): Promise<DatosCiudades>;
}
