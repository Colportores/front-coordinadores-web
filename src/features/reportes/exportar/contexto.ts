import type { Fecha } from "@/datos/reportes/contrato";
import { diaYMes } from "@/datos/reportes/fechas";

import type { Granularidad } from "../horas/calculo";

/** Lo que la exportación necesita saber además del reporte armado: cómo se agrupó y qué día es hoy. */
export interface ContextoDeExportacion {
  granularidad: Granularidad;
  /** El día de hoy en Montevideo (el mismo que usa el reporte). */
  hoy: Fecha;
}

export type FormatoDeExportacion = "pdf" | "csv";

export const ETIQUETA_DE_GRANULARIDAD: Record<Granularidad, string> = { dia: "Días", semana: "Semanas", mes: "Meses" };

/** «2026-10-21» → «21/10/2026». */
export function fechaCompleta(fecha: Fecha): string {
  return `${diaYMes(fecha)}/${fecha.slice(0, 4)}`;
}

/**
 * Nombre del archivo: lo que se está viendo y el día, sin tildes ni caracteres raros
 * (`reportes-rivera-semanas-2026-10-21.csv`). Un título que no deja nada usable cae en «reportes».
 */
export function nombreDeArchivo(titulo: string, granularidad: Granularidad, hoy: Fecha, extension: "csv" | "pdf"): string {
  const ambito = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  const grupo = { dia: "dias", semana: "semanas", mes: "meses" }[granularidad];
  return [ambito ? `reportes-${ambito}` : "reportes", grupo, hoy].join("-") + `.${extension}`;
}
