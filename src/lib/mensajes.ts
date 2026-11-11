/** Falla de red por acción (convención §10): dice qué no se pudo hacer y qué hacer. */
export function mensajeSinConexion(accion: string): string {
  return `Necesitás conexión para ${accion}. Revisá la conexión y probá de nuevo.`;
}

/**
 * La sesión del coordinador venció con la pantalla abierta. Provisorio (mapa §2, textos de «Sesión panel»): lo que dice la
 * vista 38·05 es «Tu sesión venció. Entrá de nuevo para seguir donde estabas.», pero acá se está *antes* de llegar a esa pantalla.
 */
export const MENSAJE_SESION_VENCIDA = "Tu sesión venció. Volvé a entrar para seguir.";
