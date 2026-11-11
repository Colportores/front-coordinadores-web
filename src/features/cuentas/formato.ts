import { conPuntosDeMiles } from "@/lib/texto";

/**
 * Formatea un monto como lo muestra el diseño: "$U 214.300" (sin decimales,
 * separador de miles con punto). No se usa `Intl.NumberFormat` para no
 * depender de qué datos de configuración regional tenga disponibles el
 * runtime de Node en Docker/CI.
 */
export function formatMonto(valor: number): string {
  const entero = Math.round(valor);
  const signo = entero < 0 ? "-" : "";
  const digitos = conPuntosDeMiles(Math.abs(entero).toString());
  return `$U ${signo}${digitos}`;
}

/**
 * El texto partido en trozos, con cada monto («$U 9.250») aparte: así un título que salta de línea lo puede mostrar sin
 * partirlo en «$U» / «9.250» (QA de la vista 41). Los trozos, juntos, son el texto tal cual (mismo nombre accesible).
 */
export function trozosConMontos(texto: string): Array<{ texto: string; monto: boolean }> {
  return texto
    .split(/(\$U -?\d+(?:\.\d{3})*)/)
    .filter((t) => t !== "")
    .map((t) => ({ texto: t, monto: /^\$U -?\d/.test(t) }));
}
