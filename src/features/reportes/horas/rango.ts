import type { DatosHoras, Fecha } from "@/datos/reportes/contrato";
import { diaYMes } from "@/datos/reportes/fechas";
import { esDiaIso } from "@/lib/dias";

import type { Calendario } from "./calculo";

/**
 * El rango de fechas libre de la vista 32 (issue #107, «Rango horas», HU-REP-001): validar lo que la persona escribió
 * en «desde» y «hasta», y qué días de la campaña entran. Funciones puras, sin reloj: el «hoy» viene en los datos.
 */

export interface RangoDeFechas {
  desde: Fecha;
  hasta: Fecha;
}

/** Los días entre los que se puede mirar: del primero de la campaña a hoy (o a su último día, si ya terminó). */
export interface LimitesDelRango {
  primero: Fecha;
  ultimo: Fecha;
}

export type ProblemaDeRango = "falta" | "al-reves" | "fuera-de-la-campania";

export type ResultadoDeRango =
  | { ok: true; rango: RangoDeFechas }
  | { ok: false; problema: ProblemaDeRango; texto: string };

export function limitesDelRango(datos: Pick<DatosHoras, "inicioCampania" | "finCampania" | "hoy">): LimitesDelRango {
  const ultimo = datos.finCampania !== null && datos.finCampania < datos.hoy ? datos.finCampania : datos.hoy;
  return { primero: datos.inicioCampania, ultimo };
}

/** «2026-10-21» → «21/10/2026». */
export function fechaConAnio(fecha: Fecha): string {
  return `${diaYMes(fecha)}/${fecha.slice(0, 4)}`;
}

/** Con qué rango arranca: el mes del último día con datos, hasta ese día (nunca antes del primer día de la campaña). */
export function rangoInicial(limites: LimitesDelRango): RangoDeFechas {
  const inicioDelMes = `${limites.ultimo.slice(0, 8)}01`;
  const desde = inicioDelMes > limites.primero ? inicioDelMes : limites.primero;
  return { desde, hasta: limites.ultimo < desde ? desde : limites.ultimo };
}

/** «del 01/05/2026 al 31/05/2026». */
export function textoDelRango(rango: RangoDeFechas): string {
  return `del ${fechaConAnio(rango.desde)} al ${fechaConAnio(rango.hasta)}`;
}

/**
 * Lo que escribió la persona en los dos campos de fecha (vacío si no hay fecha completa) contra los límites. Cada
 * rechazo dice qué pasa y qué hacer: nunca se calcula con un rango dudoso ni se corrige sin avisar.
 */
export function validarRango(desde: string, hasta: string, limites: LimitesDelRango): ResultadoDeRango {
  if (!esDiaIso(desde) || !esDiaIso(hasta)) {
    return { ok: false, problema: "falta", texto: "Elegí desde qué día y hasta qué día querés ver el reporte." };
  }
  if (desde > hasta) {
    return {
      ok: false,
      problema: "al-reves",
      texto: `La fecha «desde» (${fechaConAnio(desde)}) es posterior a «hasta» (${fechaConAnio(hasta)}). Cambiá una de las dos para ver el reporte.`,
    };
  }
  if (desde < limites.primero || hasta > limites.ultimo) {
    return {
      ok: false,
      problema: "fuera-de-la-campania",
      texto: `El rango tiene que estar dentro de la campaña, del ${fechaConAnio(limites.primero)} al ${fechaConAnio(limites.ultimo)}. Corregí las fechas para ver el reporte.`,
    };
  }
  return { ok: true, rango: { desde, hasta } };
}

/** Los días de trabajo de la campaña (sin domingos, igual que en las semanas y los meses) que caen dentro del rango. */
export function diasDelRango(calendario: Calendario, rango: RangoDeFechas): Fecha[] {
  return calendario.diasHabiles.filter((d) => d >= rango.desde && d <= rango.hasta);
}
