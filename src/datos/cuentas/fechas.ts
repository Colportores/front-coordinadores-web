/**
 * Fechas de los tickets en hora de Montevideo (UTC-3 todo el año: Uruguay no tiene horario de verano desde 2015), sin
 * depender de la zona del navegador ni de `Intl`, como `formato.ts`.
 */

const MS_POR_HORA = 3_600_000;
const DESFASE_MONTEVIDEO_MS = 3 * MS_POR_HORA;

interface PartesDeFecha {
  anio: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
}

function partesEnMontevideo(iso: string): PartesDeFecha | null {
  const instante = Date.parse(iso);
  if (Number.isNaN(instante)) return null;
  const fecha = new Date(instante - DESFASE_MONTEVIDEO_MS);
  return {
    anio: fecha.getUTCFullYear(),
    mes: fecha.getUTCMonth() + 1,
    dia: fecha.getUTCDate(),
    hora: fecha.getUTCHours(),
    minuto: fecha.getUTCMinutes(),
  };
}

const dos = (n: number) => String(n).padStart(2, "0");

/** El día (AAAA-MM-DD) de un instante, en hora de Montevideo. `null` si el instante no se entiende. */
export function diaEnMontevideo(iso: string): string | null {
  const p = partesEnMontevideo(iso);
  return p ? `${p.anio}-${dos(p.mes)}-${dos(p.dia)}` : null;
}

/** El día anterior de un AAAA-MM-DD. */
export function diaAnterior(dia: string): string {
  const [anio, mes, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, d - 1)).toISOString().slice(0, 10);
}

/** Un AAAA-MM-DD válido (que el calendario conoce: no hay 31 de abril). */
export function esDiaValido(dia: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  const fecha = new Date(`${dia}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === dia;
}

/**
 * Como la muestra el diseño: «hoy 09:15», «ayer 18:30» y, antes, «09/10». Con un instante ilegible, un guion largo (nunca
 * «NaN»).
 */
export function textoFechaDeTicket(iso: string, ahoraIso: string): string {
  const p = partesEnMontevideo(iso);
  const dia = diaEnMontevideo(iso);
  const hoy = diaEnMontevideo(ahoraIso);
  if (!p || !dia) return "—";
  if (hoy && dia === hoy) return `hoy ${dos(p.hora)}:${dos(p.minuto)}`;
  if (hoy && dia === diaAnterior(hoy)) return `ayer ${dos(p.hora)}:${dos(p.minuto)}`;
  return `${dos(p.dia)}/${dos(p.mes)}`;
}

/** Solo el día, «02/11», en hora de Montevideo. Con un instante ilegible, un guion largo. */
export function textoDia(iso: string): string {
  const p = partesEnMontevideo(iso);
  return p ? `${dos(p.dia)}/${dos(p.mes)}` : "—";
}

/** El día y la hora, «04/11 14:20», en hora de Montevideo (lo que dice la fila de una decisión). */
export function textoDiaYHora(iso: string): string {
  const p = partesEnMontevideo(iso);
  return p ? `${dos(p.dia)}/${dos(p.mes)} ${dos(p.hora)}:${dos(p.minuto)}` : "—";
}

/** Un instante `diasAtras` días antes del día de `ahoraIso`, a la hora indicada (hora de Montevideo). */
export function instanteHaceDias(ahoraIso: string, diasAtras: number, hora: number, minuto: number): string {
  let dia = diaEnMontevideo(ahoraIso) ?? "1970-01-01";
  for (let i = 0; i < diasAtras; i++) dia = diaAnterior(dia);
  return `${dia}T${dos(hora)}:${dos(minuto)}:00-03:00`;
}
