import { describe, expect, it } from "vitest";
import { aEnteroDe32Bits, generadorDeAzar } from "./azar";

/** El generador de antes (con `| 0`), tal cual estaba en los cuatro simulados: la referencia de que nada cambia. */
function generadorAnterior(semilla: number): () => number {
  let s = semilla | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("aEnteroDe32Bits", () => {
  it.each([
    [0, 0],
    [1, 1],
    [4294967295, 4294967295],
    [4294967296, 0],
    [4294967297, 1],
    [2 ** 40 + 5, 5],
    [-1, 4294967295],
    [-4294967296, 0],
    [-0.5, 0],
    [-4294967297, 4294967295],
    [-(2 ** 40) - 5, 4294967291],
    [7.9, 7],
    [-7.9, 4294967289],
    [Number.MAX_SAFE_INTEGER, 4294967295],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
    [Number.NEGATIVE_INFINITY, 0],
  ])("%s da %s", (entrada, esperado) => {
    expect(aEnteroDe32Bits(entrada)).toBe(esperado);
  });

  it("da los mismos 32 bits que `>>> 0` en todo lo que cabe en un entero seguro", () => {
    for (const n of [0, 1, 255, 65535, 2 ** 31, 2 ** 31 + 1, 2 ** 32 - 1, 2 ** 32, 2 ** 33 + 12345, -1, -(2 ** 31), -(2 ** 32) - 3, 2 ** 52 + 7]) {
      expect(aEnteroDe32Bits(n)).toBe(n >>> 0);
    }
  });
});

describe("generadorDeAzar", () => {
  it("fija los primeros valores de una semilla (no cambian con el tiempo)", () => {
    const r = generadorDeAzar(0);
    expect([r(), r(), r()]).toEqual([0.26642920868471265, 0.0003297457005828619, 0.2232720274478197]);
  });

  it("es determinista: la misma semilla da la misma serie", () => {
    const a = generadorDeAzar(123456789);
    const b = generadorDeAzar(123456789);
    expect(Array.from({ length: 20 }, a)).toEqual(Array.from({ length: 20 }, b));
  });

  it("siempre devuelve valores en [0, 1)", () => {
    const r = generadorDeAzar(2166136261);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it.each([0, 1, 42, 2147483647, 2147483648, 4294967295, 2166136261, 3735928559, -1, -2147483648, -123456789, 2 ** 40 + 9, -(2 ** 40) - 9])(
    "da la misma serie que el generador de antes con la semilla %s",
    (semilla) => {
      const nuevo = generadorDeAzar(semilla);
      const anterior = generadorAnterior(semilla);
      for (let i = 0; i < 200; i++) expect(nuevo()).toBe(anterior());
    },
  );

  it("sigue igual de largo: 100.000 llamadas coinciden con el generador de antes", () => {
    const nuevo = generadorDeAzar(987654321);
    const anterior = generadorAnterior(987654321);
    for (let i = 0; i < 100_000; i++) expect(nuevo()).toBe(anterior());
  });
});
