import { describe, expect, it } from "vitest";

import { aEnteroDe32Bits, generadorDeAzar } from "./azar";

/**
 * QA #158 (PR #163): el generador nuevo tiene que dar bit a bit lo mismo que el `| 0` de antes con cualquier semilla
 * (los datos simulados y los canvas dependen de eso), también con las semillas raras que el PR no recorre.
 */

function generadorAnterior(semilla: number): () => number {
  let s = semilla | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("QA #158 · generadorDeAzar contra el de antes", () => {
  it.each([0.5, -0.5, 1.9999, -1.9999, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0, 2 ** 53, -(2 ** 53), 2 ** 63, 1e21, -1e21, Number.MAX_VALUE])(
    "semilla rara %s",
    (semilla) => {
      const nuevo = generadorDeAzar(semilla);
      const anterior = generadorAnterior(semilla);
      for (let i = 0; i < 100; i++) expect(nuevo()).toBe(anterior());
    },
  );

  it("1.000 semillas pseudoaleatorias (de 32 bits con y sin signo) × 64 valores", () => {
    let x = 12345;
    const siguiente = () => {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      return x;
    };
    for (let k = 0; k < 1000; k++) {
      const semilla = k % 2 === 0 ? siguiente() : siguiente() - 2 ** 32;
      const nuevo = generadorDeAzar(semilla);
      const anterior = generadorAnterior(semilla);
      for (let i = 0; i < 64; i++) expect(nuevo()).toBe(anterior());
    }
  });

  it("aEnteroDe32Bits nunca devuelve -0 ni algo fuera de [0, 2^32)", () => {
    for (const n of [-0, -4294967296, -8589934592, 4294967296, -1e21, 1e21, Number.MIN_VALUE, -Number.MIN_VALUE]) {
      const r = aEnteroDe32Bits(n);
      expect(Object.is(r, -0)).toBe(false);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(2 ** 32);
    }
  });
});
