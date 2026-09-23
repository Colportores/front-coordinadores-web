/** Monto en pesos uruguayos con el mismo formato que el diseño ($U 19.800). */
export function formatearMonto(monto: number): string {
  const digitos = Math.round(monto).toString();
  let agrupado = "";
  for (let i = 0; i < digitos.length; i++) {
    const posicionDesdeElFinal = digitos.length - i;
    if (i > 0 && posicionDesdeElFinal % 3 === 0) agrupado += ".";
    agrupado += digitos[i];
  }
  return `$U ${agrupado}`;
}
