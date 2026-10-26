/**
 * Días del calendario como texto `AAAA-MM-DD` (el día de Montevideo, como los manda la base): sin hora ni zona
 * horaria, así que el navegador no los corre un día. La cuenta de días y el nombre del día de la semana se hacen en UTC
 * sobre ese texto.
 */

const DIA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

const DIAS_DE_LA_SEMANA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

const DIA_EN_MONTEVIDEO = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Montevideo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** El día de hoy en Montevideo: a las 22:00 de allá sigue siendo el mismo día aunque en UTC ya sea el siguiente. */
export function hoyEnMontevideo(ahora: Date = new Date()): string {
  return DIA_EN_MONTEVIDEO.format(ahora);
}

export function esDiaIso(valor: unknown): valor is string {
  if (typeof valor !== "string") return false;
  const partes = DIA_ISO.exec(valor);
  if (!partes) return false;
  const fecha = new Date(Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3])));
  return fecha.toISOString().slice(0, 10) === valor;
}

function aUtc(dia: string): number {
  const partes = DIA_ISO.exec(dia);
  if (!partes) throw new Error(`«${dia}» no es un día AAAA-MM-DD`);
  return Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
}

/** Días corridos de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUtc(hasta) - aUtc(desde)) / 86_400_000);
}

export function sumarDias(dia: string, dias: number): string {
  return new Date(aUtc(dia) + dias * 86_400_000).toISOString().slice(0, 10);
}

/** «02/10» */
export function diaYMes(dia: string): string {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/** «vie 02/10» */
export function diaConSemana(dia: string): string {
  return `${DIAS_DE_LA_SEMANA[new Date(aUtc(dia)).getUTCDay()]} ${diaYMes(dia)}`;
}

/** El lunes de la semana de `dia` (las semanas van de lunes a domingo, como en Reportes). */
export function lunesDe(dia: string): string {
  const diaDeLaSemana = new Date(aUtc(dia)).getUTCDay();
  return sumarDias(dia, -((diaDeLaSemana + 6) % 7));
}

/** «hoy», «ayer» o «hace 19 días». */
export function hace(dias: number): string {
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias} días`;
}
