/**
 * Azar determinista de los datos simulados: el mismo generador del script de los canvas (mulberry32 con semilla
 * por nombre), para que lo que se ve coincida con el artboard. No usa el reloj ni `Math.random`.
 */

const VUELTA_32_BITS = 2 ** 32;

/**
 * El entero sin signo de 32 bits que queda al «dar la vuelta» a `n` (lo mismo que `n >>> 0` sin perder el sentido de
 * `Math.trunc`): corta lo decimal y, si el valor es negativo o pasa de 32 bits, lo lleva al rango 0 a 2^32 − 1.
 * `NaN` e infinitos dan 0.
 */
export function aEnteroDe32Bits(n: number): number {
  const entero = Math.trunc(n);
  if (!Number.isFinite(entero)) return 0;
  const resto = entero % VUELTA_32_BITS;
  if (resto === 0) return 0; // sin esto, un negativo múltiplo de 2^32 daría -0
  return resto < 0 ? resto + VUELTA_32_BITS : resto;
}

/** Generador mulberry32: devuelve números en [0, 1) siempre iguales para la misma semilla. */
export function generadorDeAzar(semilla: number): () => number {
  let s = aEnteroDe32Bits(semilla);
  return () => {
    s = aEnteroDe32Bits(s + 0x6d2b79f5);
    // `^`, `|`, `>>>` e `imul` leen su argumento como 32 bits, así que `s` sin signo da los mismos bits que con signo.
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
