import { describe, expect, it } from "vitest";

import { COLOR_ZONA_SIN_COLOR, colorParaZonaNueva, esColorHex, PALETA_ZONAS } from "@/datos/equipo/zonas/paleta";

describe("paleta de zonas", () => {
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
