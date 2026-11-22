import { contrasteSobreElMapa } from "@colportores/lib-mapa";
import { CONTRASTE } from "@colportores/lib-mapa/tokens";
import { describe, expect, it } from "vitest";

import { COLOR_ZONA_SIN_COLOR, colorDeBorde, colorParaZonaNueva, esColorHex, PALETA_ZONAS } from "@/datos/equipo/zonas/paleta";

describe("paleta de zonas", () => {
  it("sale de los tokens de lib-mapa sin cambiar el aspecto: la misma paleta, en el mismo orden, y el gris provisional", () => {
    expect(PALETA_ZONAS).toEqual(["#13407A", "#1F6E3A", "#A98330", "#5B6B82", "#A8312A", "#3B5C8C"]);
    expect(COLOR_ZONA_SIN_COLOR).toBe("#8A94A6");
  });

  it("todos los colores de la paleta son #RRGGBB (la base solo guarda eso) y ninguno se repite", () => {
    for (const color of PALETA_ZONAS) expect(esColorHex(color)).toBe(true);
    expect(new Set(PALETA_ZONAS).size).toBe(PALETA_ZONAS.length);
  });

  it("el color de «sin color» es #RRGGBB y no se confunde con ninguno de la paleta", () => {
    expect(esColorHex(COLOR_ZONA_SIN_COLOR)).toBe(true);
    expect(PALETA_ZONAS).not.toContain(COLOR_ZONA_SIN_COLOR);
  });

  it("la zona nueva toma el color que sigue y, pasada la paleta, vuelve a empezar", () => {
    expect(colorParaZonaNueva(0)).toBe(PALETA_ZONAS[0]);
    expect(colorParaZonaNueva(1)).toBe(PALETA_ZONAS[1]);
    expect(colorParaZonaNueva(PALETA_ZONAS.length)).toBe(PALETA_ZONAS[0]);
    expect(colorParaZonaNueva(PALETA_ZONAS.length * 10 + 2)).toBe(PALETA_ZONAS[2]);
  });

  it("esColorHex acepta #RRGGBB y rechaza nombres, formas cortas, sin # y lo que no es texto", () => {
    expect(esColorHex("#13407A")).toBe(true);
    expect(esColorHex("#13407a")).toBe(true);
    for (const malo of ["rojo", "#FFF", "13407A", "#13407AFF", "#GGGGGG", "", null, undefined, 123]) {
      expect(esColorHex(malo)).toBe(false);
    }
  });
});

describe("colorDeBorde (borde de la zona con 3:1, lib-mapa#9)", () => {
  it.each([...PALETA_ZONAS, COLOR_ZONA_SIN_COLOR])("el borde de %s llega a 3:1 sobre la tierra y los parques del mapa", (color) => {
    const borde = colorDeBorde(color);
    expect(esColorHex(borde)).toBe(true);
    expect(contrasteSobreElMapa(borde)).toBeGreaterThanOrEqual(CONTRASTE.bordes);
  });

  it("un color que ya llega a 3:1 no cambia; uno claro se oscurece sin cambiar de tono", () => {
    expect(colorDeBorde("#13407A")).toBe("#13407A");
    const claro = colorDeBorde("#A98330");
    expect(claro).not.toBe("#A98330");
    // Oscurecer es acercar cada canal al negro en la misma proporción: el orden de los canales (el tono) se mantiene.
    const canales = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const [r, g, b] = canales(claro);
    expect(r > g && g > b).toBe(true);
  });

  it("un valor que no es #RRGGBB se dibuja con el borde de la zona sin color, sin romper el mapa", () => {
    for (const malo of ["", "rojo", "#FFF"]) expect(colorDeBorde(malo)).toBe(colorDeBorde(COLOR_ZONA_SIN_COLOR));
  });
});
