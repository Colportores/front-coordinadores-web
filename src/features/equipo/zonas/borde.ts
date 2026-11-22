import type { Punto } from "@/datos/equipo/zonas";

/**
 * El borde de una zona por esquinas mientras se dibuja (#179). El camino entre dos esquinas lo calcula la base
 * (`tramo_por_calles()`, ADR-018); acá solo se mira si el camino que llega a una esquina y el que sale de ella pasan por
 * las mismas cuadras, una vez de ida y otra de vuelta. Con ese ida y vuelta la base rechaza la zona («el borde se cruza a
 * sí mismo», `CZ008`), y pasa seguido: desde una esquina de una calle chica, el camino más corto hacia las dos esquinas
 * vecinas suele arrancar por la misma cuadra.
 */

/** Dos puntos de dos tramos son el mismo si coinciden a un centímetro: los dos salen de los mismos nodos de la red de calles. */
const TOLERANCIA_GRADOS = 1e-7;

function mismoPunto(a: Punto, b: Punto): boolean {
  return Math.abs(a.lon - b.lon) <= TOLERANCIA_GRADOS && Math.abs(a.lat - b.lat) <= TOLERANCIA_GRADOS;
}

export interface RecorteDeBorde {
  /** El camino que llega, ahora hasta el punto donde los dos caminos se separan. */
  llega: Punto[];
  /** El camino que sale, ahora desde ese punto. */
  sale: Punto[];
  /** Dónde se separan: ahí queda la esquina. */
  esquina: Punto;
}

/**
 * Si `llega` (el camino hasta una esquina) y `sale` (el camino desde ella) comparten cuadras pegadas a la esquina, los dos
 * caminos sin esa parte y el punto donde se separan. `null` si no comparten nada: el borde no vuelve sobre sus pasos.
 *
 * Un camino que queda con un solo punto quiere decir que el punto donde se separan es la esquina de al lado: no hay
 * esquina que correr, el que llama decide qué hacer.
 */
export function recortarIdaYVuelta(llega: Punto[], sale: Punto[]): RecorteDeBorde | null {
  const esquina = llega.at(-1);
  if (!esquina || sale.length === 0 || !mismoPunto(esquina, sale[0])) return null;
  let compartidos = 0;
  while (
    compartidos + 1 < llega.length &&
    compartidos + 1 < sale.length &&
    mismoPunto(llega[llega.length - 2 - compartidos], sale[compartidos + 1])
  ) {
    compartidos++;
  }
  if (compartidos === 0) return null;
  return { llega: llega.slice(0, llega.length - compartidos), sale: sale.slice(compartidos), esquina: sale[compartidos] };
}
