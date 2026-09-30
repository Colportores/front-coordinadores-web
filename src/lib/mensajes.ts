/** Falla de red por acción (convención §10): dice qué no se pudo hacer y qué hacer. */
export function mensajeSinConexion(accion: string): string {
  return `Necesitás conexión para ${accion}. Revisá la conexión y probá de nuevo.`;
}
