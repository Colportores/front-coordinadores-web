/**
 * Contrato de datos del shell: lo que el topbar necesita del coordinador.
 * Es lo que después implementa la RPC del perfil propio de Supabase (backend-supabase#54), sin BFF
 * (ADR-013). La RPC devuelve nombre y apellido; las iniciales las arma el panel.
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
