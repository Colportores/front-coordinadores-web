"use client";

import { cn } from "@/lib/utils";

import type { FormatoDeExportacion } from "./contexto";
import { MOTIVO_SIN_CONEXION, type EstadoDeExportacion, type ResultadoDeExportacion } from "./useExportacion";

const ID_DEL_MOTIVO = "exportar-motivo";

const NOMBRE: Record<FormatoDeExportacion, string> = { pdf: "Informe PDF", csv: "Datos CSV" };
const NOMBRE_OCUPADO: Record<FormatoDeExportacion, string> = { pdf: "Preparando informe…", csv: "Generando datos…" };

/**
 * «Informe PDF» y «Datos CSV» del encabezado de la vista 32 (HU-REP-005). Exportan lo que está en pantalla. Mientras
 * se genera uno, los dos quedan en `aria-disabled` (no `disabled`, para no perder el foco) y el clic no hace nada;
 * sin colportores que exportar, también, y el motivo se dice en el aviso de abajo. El «Informe PDF» además queda sin
 * acción cuando no se puede pedir al servidor (sin conexión, rango de fechas, colportores elegidos): `motivoPdf`.
 */
export function BotonesDeExportar({ estado }: { estado: EstadoDeExportacion }) {
  const { ocupado, vacio, motivoPdf, exportar } = estado;
  const boton = (formato: FormatoDeExportacion, clases: string) => {
    const esteOcupado = ocupado === formato;
    const sinMotivo = vacio || (formato === "pdf" && motivoPdf !== null);
    const sinAccion = ocupado !== null || sinMotivo;
    return (
      <button
        type="button"
        aria-disabled={sinAccion || undefined}
        aria-busy={esteOcupado || undefined}
        aria-describedby={sinMotivo ? ID_DEL_MOTIVO : undefined}
        onClick={() => {
          if (!sinAccion) exportar(formato);
        }}
        className={cn(
          "inline-flex min-h-8 items-center rounded-control px-3.5 text-chico font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento",
          sinAccion && "cursor-not-allowed opacity-60",
          esteOcupado && "cursor-progress",
          clases,
        )}
      >
        {esteOcupado ? NOMBRE_OCUPADO[formato] : NOMBRE[formato]}
      </button>
    );
  };

  return (
    <>
      {boton("pdf", "bg-marca text-superficie")}
      {boton("csv", "border border-grafico-neutro bg-superficie text-marca")}
    </>
  );
}

/** Lo que pasó con la exportación, dicho para que se sepa qué hacer: bajó, se abrió, falló o no hay nada que exportar. */
export function AvisoDeExportacion({ estado, rangoSinCorregir = false }: { estado: EstadoDeExportacion; rangoSinCorregir?: boolean }) {
  const { resultado, vacio, motivoPdf } = estado;
  const motivo = vacio
    ? rangoSinCorregir
      ? "Corregí las fechas del rango para poder exportar."
      : "No hay colportores para exportar en este reporte."
    : (motivoPdf ?? "");
  return (
    <div className="max-w-lg text-right text-mini wrap-anywhere">
      <p id={ID_DEL_MOTIVO} className={motivo ? "text-tinta-suave" : "sr-only"}>
        {motivo}
      </p>
      <p role="status" className="text-tinta-2">
        {resultado?.tipo === "listo" &&
          `Se descargó «${resultado.archivo}» con lo que ves en pantalla.`}
      </p>
      {resultado?.tipo === "error" && (
        <p role="alert" className="text-peligro">
          {textoDelError(resultado)}
        </p>
      )}
    </div>
  );
}

/** Qué falló y qué hacer: el texto del servidor si lo dio (ya viene escrito para la persona) o el de la vista. */
function textoDelError(resultado: Extract<ResultadoDeExportacion, { tipo: "error" }>): string {
  if (resultado.formato === "csv") return "No se pudo generar el archivo CSV. El reporte sigue en pantalla: probá de nuevo.";
  if (resultado.causa === "sin-conexion") return MOTIVO_SIN_CONEXION;
  return resultado.mensaje ?? "No se pudo preparar el informe PDF. El reporte sigue en pantalla: probá de nuevo.";
}
