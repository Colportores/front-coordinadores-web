import type { Fecha } from "@/datos/reportes/contrato";

/**
 * Cuentas con fechas de calendario (`AAAA-MM-DD`) sin pasar por la zona horaria del navegador: todo se hace en UTC
 * sobre el día, así «el lunes de esta semana» da lo mismo en Montevideo que en cualquier otro lugar.
 */

const MS_POR_DIA = 86_400_000;

const DIAS_ABREVIADOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;
const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

function aMs(fecha: Fecha): number {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return Date.UTC(anio, mes - 1, dia);
}

function deMs(ms: number): Fecha {
  const f = new Date(ms);
  const mm = String(f.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(f.getUTCDate()).padStart(2, "0");
  return `${f.getUTCFullYear()}-${mm}-${dd}`;
}

export function sumarDias(fecha: Fecha, dias: number): Fecha {
  return deMs(aMs(fecha) + dias * MS_POR_DIA);
}

/** Días entre dos fechas (`hasta - desde`). */
export function diasEntre(desde: Fecha, hasta: Fecha): number {
  return Math.round((aMs(hasta) - aMs(desde)) / MS_POR_DIA);
}

/** 0 = domingo … 6 = sábado. */
export function diaDeSemana(fecha: Fecha): number {
  return new Date(aMs(fecha)).getUTCDay();
}

/** El lunes de la semana de la fecha (las semanas van de lunes a domingo). */
export function lunesDe(fecha: Fecha): Fecha {
  return sumarDias(fecha, -((diaDeSemana(fecha) + 6) % 7));
}

/** Mes de la fecha como número corrido (año × 12 + mes), para comparar y recorrer meses. */
export function numeroDeMes(fecha: Fecha): number {
  const [anio, mes] = fecha.split("-").map(Number);
  return anio * 12 + (mes - 1);
}

/** Índice del mes (0 = enero) de un número de mes corrido. */
export function indiceDeMes(numero: number): number {
  return numero % 12;
}

export function diaDelMes(fecha: Fecha): number {
  return Number(fecha.slice(8, 10));
}

/** `2026-10-20` → `20/10`. */
export function diaYMes(fecha: Fecha): string {
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
}

/** `2026-10-20` → `mar`. */
export function nombreDelDia(fecha: Fecha): string {
  return DIAS_ABREVIADOS[diaDeSemana(fecha)];
}

/** Nombre completo del mes en minúscula (`septiembre`). */
export function nombreDelMes(numero: number): string {
  return MESES[indiceDeMes(numero)];
}

/** Tres letras con la inicial en mayúscula (`Sep`): rótulo de la barra del mes. */
export function rotuloDelMes(numero: number): string {
  const corto = nombreDelMes(numero).slice(0, 3);
  return corto.charAt(0).toUpperCase() + corto.slice(1);
}

/** Tres letras con punto (`sep.`), para frases como «contra sep. a la misma fecha». */
export function mesAbreviado(numero: number): string {
  return `${nombreDelMes(numero).slice(0, 3)}.`;
}
