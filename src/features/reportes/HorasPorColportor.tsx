import type { HorasColportor } from "@/datos/reportes/contrato";
import { formatearHoras } from "@/features/reportes/formato";

/** Clase de la barra según qué tan cerca está del máximo de la semana. */
function claseBarra(horas: number, maximo: number, horasBajas?: boolean): string {
  if (horasBajas) return "bg-peligro";
  const proporcion = maximo > 0 ? horas / maximo : 0;
  if (proporcion >= 0.95) return "bg-marca";
  if (proporcion >= 0.85) return "bg-marca-media";
  return "bg-acento";
}

function resumenAccesible(colportores: HorasColportor[]): string {
  const partes = colportores.map((c) => {
    const sufijo = c.horasBajas ? " (por debajo del mínimo esperado)" : "";
    return `${c.nombre}: ${formatearHoras(c.horas)}${sufijo}`;
  });
  return `Horas trabajadas por colportor esta semana. ${partes.join("; ")}.`;
}

/** Tarjeta "Horas por colportor · esta semana": barras horizontales, más larga = más horas. */
export function HorasPorColportor({ colportores }: { colportores: HorasColportor[] }) {
  const maximo = Math.max(0, ...colportores.map((c) => c.horas));

  return (
    <div className="flex flex-col gap-3 rounded-tarjeta border border-borde bg-superficie px-[18px] py-4">
      <span className="font-serif text-titulo font-semibold text-tinta">Horas por colportor · esta semana</span>
      {colportores.length === 0 ? (
        <p className="text-chico text-tinta-suave">Sin datos de horas para el período.</p>
      ) : (
        <div role="img" aria-label={resumenAccesible(colportores)} className="flex flex-col gap-2.5">
          {colportores.map((c) => {
            const ancho = maximo > 0 ? (c.horas / maximo) * 100 : 0;
            const claseTexto = c.horasBajas ? "text-peligro" : "text-tinta";
            return (
              <div key={c.id} aria-hidden="true" className="flex flex-col gap-1">
                <div className="flex justify-between text-chico">
                  <span className={`font-semibold ${claseTexto}`}>{c.nombre}</span>
                  <span className={`font-mono ${claseTexto}`}>{formatearHoras(c.horas)}</span>
                </div>
                <div className="h-[7px] rounded-md bg-superficie-suave">
                  <div
                    className={`h-[7px] rounded-md ${claseBarra(c.horas, maximo, c.horasBajas)}`}
                    style={{ width: `${ancho}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
