/**
 * Formatea un monto como lo muestra el diseño: "$U 214.300" (sin decimales,
 * separador de miles con punto). No se usa `Intl.NumberFormat` para no
 * depender de qué datos de configuración regional tenga disponibles el
 * runtime de Node en Docker/CI.
 */
export function formatMonto(valor: number): string {
  const entero = Math.round(valor);
  const signo = entero < 0 ? "-" : "";
  const digitos = Math.abs(entero).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `$U ${signo}${digitos}`;
}
