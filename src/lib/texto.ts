/**
 * Utilidades de texto sin expresiones regulares con retroceso (Sonar S8786): recorren el texto una sola vez, así que
 * una entrada larga o armada a propósito no puede colgar al navegador ni al servidor.
 */

/** Saca las barras `/` del final de un texto («https://x.co//» → «https://x.co»). */
export function sinBarrasFinales(texto: string): string {
  let fin = texto.length;
  while (fin > 0 && texto[fin - 1] === "/") fin -= 1;
  return fin === texto.length ? texto : texto.slice(0, fin);
}

/**
 * Pone un punto cada tres cifras, de derecha a izquierda: «1450» → «1.450», «-1234567» → «-1.234.567».
 * Un texto que no es un entero (con o sin signo menos) vuelve como llegó («NaN», «1e+21»).
 */
export function conPuntosDeMiles(entero: string): string {
  const signo = entero.startsWith("-") ? "-" : "";
  const cifras = signo ? entero.slice(1) : entero;
  if (cifras === "" || !/^\d+$/.test(cifras)) return entero;
  const grupos: string[] = [];
  for (let fin = cifras.length; fin > 0; fin -= 3) {
    grupos.push(cifras.slice(Math.max(0, fin - 3), fin));
  }
  return signo + grupos.reverse().join(".");
}
