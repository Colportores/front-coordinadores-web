/**
 * Colores de las zonas. El color de una zona lo elige el panel al crearla (el backend lo guarda tal cual y acepta
 * `null`), así que la paleta vive acá, junto al contrato, y no en una fuente en particular.
 */
export const PALETA_ZONAS = ["#13407A", "#1F6E3A", "#A98330", "#5B6B82", "#A8312A", "#3B5C8C"] as const;

/**
 * El color con el que se dibuja una zona que el backend guardó sin color (`zona.color` es nulo, lo permite
 * `guardar_zona()`): un gris que no se confunde con ninguna de la paleta. No se guarda: es solo para pintarla.
 */
export const COLOR_ZONA_SIN_COLOR = "#8A94A6";

/** El color de la zona nueva número `cantidadDeZonas + 1` de la ciudad: recorre la paleta. */
export function colorParaZonaNueva(cantidadDeZonas: number): string {
  return PALETA_ZONAS[cantidadDeZonas % PALETA_ZONAS.length];
}

export function esColorHex(valor: unknown): valor is string {
  return typeof valor === "string" && /^#[0-9A-Fa-f]{6}$/.test(valor);
}
