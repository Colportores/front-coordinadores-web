import { cn } from "@/lib/utils";

import type { Tendencia } from "./calculo";
import { TendenciaDeCifra } from "./TendenciaDeCifra";

export interface BarraDeCifra {
  rotulo: string;
  /** Alto relativo (0 a 1) respecto de la barra más alta. */
  proporcion: number;
  /** Sin datos: no se dibuja barra. */
  sinDatos: boolean;
  /** Período en curso: la barra va rayada. */
  enCurso: boolean;
}

/** Alto de la barra más alta, en píxeles (el diseño usa 54 dentro de un área de 56). */
const ALTO_MAXIMO = 54;
const ALTO_MINIMO = 2;

/**
 * Una cifra del período con su tendencia y el gráfico de barras (vista 32): «HORAS 180 ▲ 10%», contra qué se
 * compara y el total de la campaña. Lo que está en curso se ve rayado.
 */
export function TarjetaDeCifra({
  etiqueta,
  valor,
  tendencia,
  nota,
  campania,
  barras,
  resumenDelGrafico,
}: {
  etiqueta: string;
  valor: string;
  tendencia: Tendencia | null;
  nota: string;
  campania: string;
  barras: BarraDeCifra[];
  /** El gráfico dicho con palabras, para el lector de pantalla. */
  resumenDelGrafico: string;
}) {
  return (
    <section aria-label={etiqueta} className="flex min-w-0 flex-col gap-2 rounded-tarjeta border border-borde bg-superficie px-4 pt-[13px] pb-2.5">
      <div className="flex flex-col gap-px">
        <h3 className="text-etiqueta font-semibold tracking-etiqueta wrap-anywhere text-tinta-suave">{etiqueta}</h3>
        <p className="flex flex-wrap items-baseline gap-2">
          <span className="font-serif text-[26px] font-semibold text-marca">{valor}</span>
          <span className="font-mono text-nav font-medium whitespace-nowrap text-tinta">
            <TendenciaDeCifra tendencia={tendencia} />
          </span>
        </p>
        <p className="truncate text-mini text-tinta-suave" title={nota}>
          {nota}
        </p>
        {campania && <p className="font-mono text-[10.5px] text-tinta-2">{campania}</p>}
      </div>
      {/* El rango libre no tiene períodos que dibujar: sin barras, la tarjeta es solo la cifra. */}
      {barras.length > 0 && (
      <div role="img" aria-label={resumenDelGrafico} className="flex flex-col gap-2">
        <div aria-hidden="true" className="flex h-14 items-end gap-1 border-b border-grafico-neutro">
          {barras.map((barra, i) => (
            <span
              key={i}
              className={cn("flex-1 rounded-t-sm", !barra.enCurso && "bg-marca-media")}
              style={{
                height: barra.sinDatos ? 0 : Math.max(ALTO_MINIMO, Math.round(barra.proporcion * ALTO_MAXIMO)),
                background: barra.enCurso
                  ? "repeating-linear-gradient(45deg, var(--marca-media) 0 3px, var(--superficie) 3px 5px)"
                  : undefined,
              }}
            />
          ))}
        </div>
        <div aria-hidden="true" className="flex gap-1">
          {barras.map((barra, i) => (
            <span key={i} className="flex-1 overflow-hidden text-center font-mono text-[9px] whitespace-nowrap text-tinta-suave">
              {barra.rotulo}
            </span>
          ))}
        </div>
      </div>
      )}
    </section>
  );
}
