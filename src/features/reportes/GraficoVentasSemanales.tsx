import type { VentaSemanal } from "@/datos/reportes/contrato";
import { formatearMilesUY } from "@/features/reportes/formato";

/** Clase de color de una barra según qué tan cerca está del máximo de la serie. */
function claseBarra(monto: number, maximo: number, semanaActual?: boolean): string {
  if (semanaActual) return "bg-alerta-punto";
  const proporcion = maximo > 0 ? monto / maximo : 0;
  if (proporcion >= 0.95) return "bg-marca";
  if (proporcion >= 0.75) return "bg-marca-media";
  if (proporcion >= 0.55) return "bg-acento";
  return "bg-grafico-neutro";
}

function resumenAccesible(semanas: VentaSemanal[]): string {
  const partes = semanas.map((s) => {
    const sufijo = s.semanaActual ? " (semana en curso, datos parciales)" : "";
    return `${s.semana}: ${formatearMilesUY(s.montoMiles)}${sufijo}`;
  });
  return `Ventas por semana en la región, en miles de pesos uruguayos, campaña completa. ${partes.join("; ")}.`;
}

/** Tarjeta "Ventas por semana · región": barras replicando el diseño (sin librería de gráficos). */
export function GraficoVentasSemanales({ semanas }: { semanas: VentaSemanal[] }) {
  const maximo = Math.max(0, ...semanas.map((s) => s.montoMiles));

  return (
    <div className="rounded-tarjeta border border-borde bg-superficie px-[18px] py-4">
      <div className="mb-3.5 flex items-baseline justify-between">
        <span className="font-serif text-titulo font-semibold text-tinta">Ventas por semana · región</span>
        <span className="text-mini text-tinta-tenue">$U miles · campaña completa</span>
      </div>
      {semanas.length === 0 ? (
        <p className="text-chico text-tinta-suave">Sin datos de ventas para el período.</p>
      ) : (
        <div role="img" aria-label={resumenAccesible(semanas)} className="flex h-[120px] items-end gap-2.5">
          {semanas.map((s) => (
            <div
              key={s.semana}
              aria-hidden="true"
              className="flex h-full flex-1 flex-col items-center justify-end gap-1"
            >
              <div
                className={`w-full rounded-t-[3px] ${claseBarra(s.montoMiles, maximo, s.semanaActual)}`}
                style={{ height: `${maximo > 0 ? (s.montoMiles / maximo) * 100 : 0}%` }}
              />
              <span className={`text-mini ${s.semanaActual ? "font-semibold text-alerta" : "text-tinta-tenue"}`}>
                {s.semana}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
