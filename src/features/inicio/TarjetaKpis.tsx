import type { KpiRegion } from "@/datos/inicio";
import { cn } from "@/lib/utils";

/** Fila de las cuatro cifras principales del tablero (ventas, jornada, horas, tickets). */
export function TarjetaKpis({ kpis }: { kpis: KpiRegion[] }) {
  return (
    <div className="grid grid-cols-4 gap-[14px]">
      {kpis.map((kpi) => (
        <div key={kpi.id} className="rounded-tarjeta border border-borde bg-superficie px-[18px] py-4">
          <div className="text-etiqueta font-semibold tracking-etiqueta text-tinta-suave">
            {kpi.etiqueta.toUpperCase()}
          </div>
          <div
            className={cn(
              "font-serif text-cifra font-semibold",
              kpi.tono === "alerta" ? "text-alerta" : "text-marca",
            )}
          >
            {kpi.valor}
          </div>
          <div
            className={cn(
              "text-mini",
              kpi.tono === "alerta" && "text-alerta",
              kpi.tono === "positivo" && "text-exito",
              !kpi.tono && "text-tinta-suave",
            )}
          >
            {kpi.detalle}
          </div>
        </div>
      ))}
    </div>
  );
}
