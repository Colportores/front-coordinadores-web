import type { AvanceZona } from "@/datos/inicio";
import { cn } from "@/lib/utils";

/** Colores de salud del avance: al día (exito), en riesgo (alerta) o atrasada (peligro). */
function colorAvance(porcentajeMeta: number): { texto: string; barra: string } {
  if (porcentajeMeta >= 60) return { texto: "text-exito", barra: "bg-marca" };
  if (porcentajeMeta >= 40) return { texto: "text-alerta", barra: "bg-acento" };
  return { texto: "text-peligro", barra: "bg-peligro" };
}

/** Barras de avance de cada zona respecto de su meta de campaña. */
export function TarjetaAvancePorZona({ zonas }: { zonas: AvanceZona[] }) {
  return (
    <div className="rounded-tarjeta border border-borde bg-superficie px-[18px] py-4">
      <div className="mb-[14px] flex items-baseline justify-between">
        <span className="font-serif text-titulo font-semibold">Avance por zona</span>
        <span className="text-mini text-tinta-tenue">% de la meta de zona · campaña</span>
      </div>

      {zonas.length === 0 ? (
        <p className="text-chico text-tinta-suave">Todavía no hay zonas con avance registrado.</p>
      ) : (
        <div className="flex flex-col gap-[11px]">
          {zonas.map((zona) => {
            const color = colorAvance(zona.porcentajeMeta);
            const porcentaje = Math.min(100, Math.max(0, zona.porcentajeMeta));
            return (
              <div key={zona.id} className="flex flex-col gap-[3px]">
                <div className="flex justify-between text-chico">
                  <span className="font-semibold">{zona.zona}</span>
                  <span className={cn("text-mini font-semibold", color.texto)}>{porcentaje}%</span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`Avance de ${zona.zona}`}
                  aria-valuenow={porcentaje}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-[7px] rounded-sm bg-superficie-suave"
                >
                  <div className={cn("h-[7px] rounded-sm", color.barra)} style={{ width: `${porcentaje}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
