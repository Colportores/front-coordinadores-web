/**
 * Contrato de datos del shell: lo que el topbar necesita del coordinador.
 * Es lo que después implementa el BFF (bff-coordinadores).
 */

export interface ResumenCoordinador {
  /** Nombre para mostrar (accesible), no se pinta en el topbar. */
  nombre: string;
  /** Iniciales del avatar del topbar. */
  iniciales: string;
  /** Región que coordina. */
  region: string;
  /** Campaña en curso. */
  campania: string;
}

export interface FuenteDatosShell {
  obtenerResumenCoordinador(): Promise<ResumenCoordinador>;
}
