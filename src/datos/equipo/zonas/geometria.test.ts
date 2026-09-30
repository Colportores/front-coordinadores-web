import { describe, expect, it } from "vitest";

import {
  contiene,
  distanciaM,
  LADOS_CIRCULO,
  poligonoCircular,
  poligonoDePuntos,
  puntoADistancia,
  vertices,
} from "@/datos/equipo/zonas/geometria";

const CENTRO = { lon: -56.26, lat: -34.87 };

describe("geometria", () => {
  describe("puntoADistancia y distanciaM", () => {
    it("son inversas: un punto a 400 m está a 400 m", () => {
      for (const angulo of [0, Math.PI / 3, Math.PI, 5]) {
        expect(distanciaM(CENTRO, puntoADistancia(CENTRO, 400, angulo))).toBeCloseTo(400, 1);
      }
    });

    it("hacia el este mantiene la latitud", () => {
      expect(puntoADistancia(CENTRO, 600).lat).toBeCloseTo(CENTRO.lat, 9);
    });

    it("la distancia de un punto a sí mismo es cero", () => {
      expect(distanciaM(CENTRO, CENTRO)).toBe(0);
    });
  });

  describe("poligonoDePuntos", () => {
    it("cierra el anillo repitiendo el primer punto", () => {
      const poligono = poligonoDePuntos([
        { lon: 0, lat: 0 },
        { lon: 1, lat: 0 },
        { lon: 1, lat: 1 },
      ]);
      expect(poligono.coordinates[0]).toEqual([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ]);
    });

    it("no lo repite si ya venía cerrado y tolera una lista vacía", () => {
      const cerrado = poligonoDePuntos([
        { lon: 0, lat: 0 },
        { lon: 1, lat: 0 },
        { lon: 0, lat: 0 },
      ]);
      expect(cerrado.coordinates[0]).toHaveLength(3);
      expect(poligonoDePuntos([]).coordinates[0]).toEqual([]);
    });
  });

  describe("poligonoCircular", () => {
    it("dibuja un círculo de la medida pedida, sin repetir vértices al leerlo", () => {
      const circulo = poligonoCircular(CENTRO, 600);
      const vs = vertices(circulo);

      expect(vs).toHaveLength(LADOS_CIRCULO);
      expect(circulo.coordinates[0]).toHaveLength(LADOS_CIRCULO + 1);
      for (const v of vs) expect(distanciaM(CENTRO, v)).toBeCloseTo(600, 1);
    });
  });

  describe("contiene", () => {
    const circulo = poligonoCircular(CENTRO, 500);

    it("acepta el centro y rechaza un punto lejano", () => {
      expect(contiene(circulo, CENTRO)).toBe(true);
      expect(contiene(circulo, puntoADistancia(CENTRO, 700))).toBe(false);
    });

    it("distingue por dentro y por fuera cerca del borde", () => {
      expect(contiene(circulo, puntoADistancia(CENTRO, 480, 1))).toBe(true);
      expect(contiene(circulo, puntoADistancia(CENTRO, 520, 1))).toBe(false);
    });

    it("no se confunde con una forma en L", () => {
      const ele = poligonoDePuntos([
        { lon: 0, lat: 0 },
        { lon: 2, lat: 0 },
        { lon: 2, lat: 1 },
        { lon: 1, lat: 1 },
        { lon: 1, lat: 2 },
        { lon: 0, lat: 2 },
      ]);
      expect(contiene(ele, { lon: 0.5, lat: 1.5 })).toBe(true);
      expect(contiene(ele, { lon: 1.5, lat: 0.5 })).toBe(true);
      expect(contiene(ele, { lon: 1.5, lat: 1.5 })).toBe(false);
    });
  });
});
