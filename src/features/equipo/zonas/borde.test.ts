import { describe, expect, it } from "vitest";

import type { Punto } from "@/datos/equipo/zonas";
import { recortarIdaYVuelta } from "@/features/equipo/zonas/borde";

const p = (lon: number, lat: number): Punto => ({ lon, lat });

describe("recortarIdaYVuelta (#179)", () => {
  it("dos caminos que solo se tocan en la esquina no se recortan", () => {
    const llega = [p(0, 0), p(1, 0), p(2, 0)];
    const sale = [p(2, 0), p(2, 1), p(2, 2)];

    expect(recortarIdaYVuelta(llega, sale)).toBeNull();
  });

  it("si el que sale vuelve una cuadra por donde llegó el otro, la esquina queda donde se separan", () => {
    // Llega por (1,0) hasta la esquina (2,0) y sale volviendo por (1,0) antes de doblar hacia (1,1).
    const llega = [p(0, 0), p(1, 0), p(2, 0)];
    const sale = [p(2, 0), p(1, 0), p(1, 1), p(1, 2)];

    expect(recortarIdaYVuelta(llega, sale)).toEqual({
      llega: [p(0, 0), p(1, 0)],
      sale: [p(1, 0), p(1, 1), p(1, 2)],
      esquina: p(1, 0),
    });
  });

  it("recorta todas las cuadras compartidas, no solo la primera", () => {
    const llega = [p(0, 0), p(1, 0), p(2, 0), p(3, 0), p(4, 0)];
    const sale = [p(4, 0), p(3, 0), p(2, 0), p(2, 1)];

    expect(recortarIdaYVuelta(llega, sale)).toEqual({
      llega: [p(0, 0), p(1, 0), p(2, 0)],
      sale: [p(2, 0), p(2, 1)],
      esquina: p(2, 0),
    });
  });

  it("toma por el mismo punto a dos que difieren en menos de un centímetro, y por distintos a los que no", () => {
    const llega = [p(0, 0), p(1, 0), p(2, 0)];

    expect(recortarIdaYVuelta(llega, [p(2, 0), p(1.00000005, 0), p(1, 1)])?.esquina).toEqual(p(1.00000005, 0));
    expect(recortarIdaYVuelta(llega, [p(2, 0), p(1.00001, 0), p(1, 1)])).toBeNull();
  });

  it("si el que sale desanda todo el que llega, el que llega queda en un solo punto: la esquina de antes", () => {
    const llega = [p(0, 0), p(1, 0), p(2, 0)];
    const sale = [p(2, 0), p(1, 0), p(0, 0), p(0, 1)];

    const recorte = recortarIdaYVuelta(llega, sale);

    expect(recorte?.llega).toEqual([p(0, 0)]);
    expect(recorte?.sale).toEqual([p(0, 0), p(0, 1)]);
  });

  it("si el que sale termina sobre el que llega, el que sale queda en un solo punto: la esquina de después", () => {
    const llega = [p(0, 0), p(1, 0), p(2, 0), p(3, 0)];
    const sale = [p(3, 0), p(2, 0)];

    const recorte = recortarIdaYVuelta(llega, sale);

    expect(recorte?.sale).toEqual([p(2, 0)]);
    expect(recorte?.llega).toEqual([p(0, 0), p(1, 0), p(2, 0)]);
  });

  it.each([
    ["el que llega vacío", [], [p(0, 0), p(1, 0)]],
    ["el que sale vacío", [p(0, 0), p(1, 0)], []],
    ["caminos de un solo punto", [p(1, 0)], [p(1, 0)]],
    ["caminos que no se tocan en la esquina", [p(0, 0), p(1, 0)], [p(5, 5), p(0, 0)]],
  ])("%s: nada que recortar", (_caso, llega, sale) => {
    expect(recortarIdaYVuelta(llega, sale)).toBeNull();
  });
});
