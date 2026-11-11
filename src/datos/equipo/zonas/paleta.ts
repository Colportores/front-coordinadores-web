import { bordeDeZona } from "@colportores/lib-mapa";
import { PALETA_ZONAS as PALETA_DE_LA_LIBRERIA, ZONA_SIN_COLOR } from "@colportores/lib-mapa/tokens";

/**
 * Colores de las zonas. El color de una zona lo elige el panel al crearla (el backend lo guarda tal cual y acepta
 * `null`). Los valores salen de los tokens de `lib-mapa` (los mismos que usa el celular): acá solo se nombran.
 */
export const PALETA_ZONAS: readonly string[] = PALETA_DE_LA_LIBRERIA;

/**
 * El color con el que se dibuja una zona que el backend guardó sin color (`zona.color` es nulo, lo permite
 * `guardar_zona()`). No se guarda: es solo para pintarla. El token `zonaSinColor` de lib-mapa todavía no tiene un valor
 * único (decisión de Cristian pendiente, front-coordinadores-web#148): mientras tanto el panel usa el suyo, el gris
 * que no se confunde con ninguna de la paleta.
 */
export const COLOR_ZONA_SIN_COLOR: string = ZONA_SIN_COLOR.panel;

/** El color de la zona nueva número `cantidadDeZonas + 1` de la ciudad: recorre la paleta. */
export function colorParaZonaNueva(cantidadDeZonas: number): string {
  return PALETA_ZONAS[cantidadDeZonas % PALETA_ZONAS.length];
}

export function esColorHex(valor: unknown): valor is string {
  return typeof valor === "string" && /^#[0-9A-Fa-f]{6}$/.test(valor);
}

/**
 * El color con el que se dibuja el borde de una zona en el mapa: el suyo, o el mismo tono oscurecido hasta llegar a 3:1 sobre
 * la tierra y los parques del mapa (WCAG 1.4.11). Es la regla de lib-mapa (`bordeDeZona`), la misma del celular; el relleno y
 * el color guardado no cambian. Un valor que no es #RRGGBB se dibuja como una zona sin color.
 */
export function colorDeBorde(color: string): string {
  return bordeDeZona(esColorHex(color) ? color : COLOR_ZONA_SIN_COLOR);
}
