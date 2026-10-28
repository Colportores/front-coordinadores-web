"use client";

import { cn } from "@/lib/utils";

import type { FormatoDeExportacion } from "./contexto";
import type { EstadoDeExportacion } from "./useExportacion";

const ID_DEL_MOTIVO = "exportar-motivo";

const NOMBRE: Record<FormatoDeExportacion, string> = { pdf: "Informe PDF", csv: "Datos CSV" };
const NOMBRE_OCUPADO: Record<FormatoDeExportacion, string> = { pdf: "Preparando informe…", csv: "Generando datos…" };

/**
 * «Informe PDF» y «Datos CSV» del encabezado de la vista 32 (HU-REP-005). Exportan lo que está en pantalla. Mientras
 * se genera uno, los dos quedan en `aria-disabled` (no `disabled`, para no perder el foco) y el clic no hace nada;
 * sin colportores que exportar, también, y el motivo se dice en el aviso de abajo.
 */
export function BotonesDeExportar({ estado }: { estado: EstadoDeExportacion }) {
  const { ocupado, vacio, exportar } = estado;
  const sinAccion = ocupado !== null || vacio;
  const boton = (formato: FormatoDeExportacion, clases: string) => {
    const esteOcupado = ocupado === formato;
    return (
      <button
        type="button"
        aria-disabled={sinAccion || undefined}
        aria-busy={esteOcupado || undefined}
        aria-describedby={vacio ? ID_DEL_MOTIVO : undefined}
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
  const { resultado, vacio } = estado;
  return (
    <div className="max-w-lg text-right text-mini wrap-anywhere">
      <p id={ID_DEL_MOTIVO} className={vacio ? "text-tinta-suave" : "sr-only"}>
        {vacio
          ? rangoSinCorregir
            ? "Corregí las fechas del rango para poder exportar."
            : "No hay colportores para exportar en este reporte."
          : ""}
      </p>
      <p role="status" className="text-tinta-2">
        {resultado?.tipo === "listo" &&
          (resultado.formato === "csv"
            ? `Se descargó «${resultado.archivo}» con lo que ves en pantalla.`
            : "Se abrió el informe para imprimir. Elegí «Guardar como PDF» como destino para quedarte con el archivo.")}
      </p>
      {resultado?.tipo === "error" && (
        <p role="alert" className="text-peligro">
          {resultado.formato === "csv"
            ? "No se pudo generar el archivo CSV. El reporte sigue en pantalla: probá de nuevo."
            : "No se pudo preparar el informe PDF. El reporte sigue en pantalla: probá de nuevo."}
        </p>
      )}
    </div>
  );
}
