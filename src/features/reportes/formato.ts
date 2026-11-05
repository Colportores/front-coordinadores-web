/** Formatea un monto en miles de $U con el formato del diseño (p. ej. "$U 612K"). */
export function formatearMilesUY(montoMiles: number): string {
  const redondeado = Math.round(montoMiles);
  return `$U ${redondeado}K`;
}

/** Formatea horas con una posición decimal, coma como separador (p. ej. "31,0 h"). */
export function formatearHoras(horas: number): string {
  return `${horas.toFixed(1).replace(".", ",")} h`;
}
