"use client";

import type { DatosHoras } from "@/datos/reportes/contrato";

import { ReporteHoras } from "./ReporteHoras";

/**
 * La vista 32 para el sitio de prueba (GitHub Pages, export estático): sin servidor no hay server actions, así que el
 * «Informe PDF» no se puede armar y la vista usa su aviso por defecto (`informeNoDisponible`). Lo demás es lo mismo: los
 * datos son los simulados y todo se calcula en el navegador.
 */
export function ReporteHorasLocal({ datos }: { datos: DatosHoras }) {
  return <ReporteHoras datos={datos} />;
}
