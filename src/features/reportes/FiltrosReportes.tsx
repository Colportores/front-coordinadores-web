import { AccionNoDisponible } from "@/components/AccionNoDisponible";

const OPCIONES = ["Campaña", "Mes", "Semana"] as const;

/**
 * Selector de rango del reporte (campaña / mes / semana). El diseño no define
 * qué cambia en los datos al elegir cada opción, así que queda como un grupo
 * de botones sin comportamiento (pendiente: ver docs/PESTANAS.md §6 y el
 * comentario dejado en el issue #8).
 */
export function FiltrosReportes() {
  return (
    <div role="group" aria-label="Rango del reporte" className="flex gap-2">
      {OPCIONES.map((opcion, indice) => {
        const activa = indice === 0;
        return (
          <AccionNoDisponible
            key={opcion}
            className={
              activa
                ? "rounded-pastilla bg-marca px-[14px] py-[7px] text-chico font-semibold text-superficie"
                : "rounded-pastilla border border-borde bg-superficie px-[14px] py-[7px] text-chico font-semibold text-tinta-2"
            }
          >
            {opcion}
          </AccionNoDisponible>
        );
      })}
    </div>
  );
}
