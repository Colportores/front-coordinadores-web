import type { Fecha } from "@/datos/reportes/contrato";
import { diaYMes } from "@/datos/reportes/fechas";

import type { ModoDeReporte } from "../horas/calculo";
import type { RangoDeFechas } from "../horas/rango";

/** Lo que la exportación necesita saber además del reporte armado: cómo se agrupó y qué día es hoy. */
export interface ContextoDeExportacion {
  granularidad: ModoDeReporte;
  /** Con el rango libre (`granularidad: "rango"`), las fechas que se están viendo. */
  rango?: RangoDeFechas | null;
  /** El día de hoy en Montevideo (el mismo que usa el reporte). */
  hoy: Fecha;
}

export type FormatoDeExportacion = "pdf" | "csv";

export const ETIQUETA_DE_GRANULARIDAD: Record<ModoDeReporte, string> = { dia: "Días", semana: "Semanas", mes: "Meses", rango: "Rango de fechas" };

/** «2026-10-21» → «21/10/2026». */
export function fechaCompleta(fecha: Fecha): string {
  return `${diaYMes(fecha)}/${fecha.slice(0, 4)}`;
}

/**
 * Nombre del archivo: lo que se está viendo y el día, sin tildes ni caracteres raros
 * (`reportes-rivera-semanas-2026-10-21.csv`). Un título que no deja nada usable cae en «reportes».
 */
export function nombreDeArchivo(
  titulo: string,
  granularidad: ModoDeReporte,
  hoy: Fecha,
  extension: "csv" | "pdf",
  rango: RangoDeFechas | null = null,
): string {
  const ambito = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  const grupo = { dia: "dias", semana: "semanas", mes: "meses", rango: "rango" }[granularidad];
  // El rango libre se nombra por sus fechas (el archivo cuenta lo que se ve, no el día en que se bajó).
  const cuando = granularidad === "rango" && rango ? `${rango.desde}-a-${rango.hasta}` : hoy;
  return [ambito ? `reportes-${ambito}` : "reportes", grupo, cuando].join("-") + `.${extension}`;
}
