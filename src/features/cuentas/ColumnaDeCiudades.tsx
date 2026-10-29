"use client";

import { BotonAlternar } from "@/features/inicio/ListaDeCiudades";
import { claveDe, detalleDePendientes, type ElementoDeLista, type Seleccion } from "@/features/cuentas/modelo";
import { cn } from "@/lib/utils";

const CLASE_FOCO = "focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none";
const CLASE_ELEGIDA = "bg-marca-clara shadow-[inset_3px_0_0_var(--marca-media)]";

/**
 * La lista de ciudades agrupada por departamento: es el filtro de la pestaña y dice cuántos tickets esperan validación en
 * cada una. Se contrae a una barra con la sigla de cada ciudad, que sigue siendo el filtro.
 */
export function ColumnaDeCiudades({
  elementos,
  seleccionada,
  contraida,
  alElegir,
  alAlternar,
}: {
  elementos: ElementoDeLista[];
  seleccionada: Seleccion;
  contraida: boolean;
  alElegir: (seleccion: Seleccion) => void;
  alAlternar: () => void;
}) {
  const clave = claveDe(seleccionada);

  if (contraida) {
    return (
      <section
        id="columna-ciudades"
        aria-label="Ciudades"
        className="flex min-h-0 flex-col items-center gap-1.5 overflow-auto border-r border-borde bg-superficie py-3"
      >
        <BotonAlternar
          etiqueta="Expandir ciudades"
          simbolo="»"
          foco="alternar-ciudades"
          expandido={false}
          controla="columna-ciudades"
          onClick={alAlternar}
          className="mb-1.5"
        />
        {elementos.map((elemento) => {
          if (elemento.tipo === "grupo") return <span key={elemento.clave} aria-hidden className="my-1.5 h-px w-7 bg-borde" />;
          const detalle = detalleDePendientes(elemento.pendientes);
          return (
            <button
              key={elemento.clave}
              type="button"
              title={elemento.nombre}
              aria-label={detalle ? `${elemento.nombre}: ${detalle}` : elemento.nombre}
              aria-pressed={elemento.clave === clave}
              onClick={() => alElegir(elemento.seleccion)}
              className={cn(
                "flex min-h-11 w-[52px] shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-control",
                CLASE_FOCO,
                elemento.clave === clave ? CLASE_ELEGIDA : "hover:bg-superficie-calida",
              )}
            >
              <span aria-hidden className="text-[11.5px] font-semibold">
                {elemento.sigla}
              </span>
              {elemento.pendientes > 0 && (
                <span aria-hidden className="font-mono text-etiqueta text-alerta">
                  {elemento.pendientes}
                </span>
              )}
            </button>
          );
        })}
      </section>
    );
  }

  return (
    <section id="columna-ciudades" aria-labelledby="titulo-ciudades" className="flex min-h-0 min-w-0 flex-col border-r border-borde bg-superficie">
      <div className="flex items-center justify-between py-3 pr-3 pl-[18px]">
        <h2 id="titulo-ciudades" className="font-serif text-titulo font-semibold">
          Ciudades
        </h2>
        <BotonAlternar
          etiqueta="Contraer ciudades"
          simbolo="«"
          foco="alternar-ciudades"
          expandido
          controla="columna-ciudades"
          onClick={alAlternar}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto px-2.5 pb-3.5">
        {elementos.map((elemento) =>
          elemento.tipo === "grupo" ? (
            <p key={elemento.clave} className="px-2 pt-3.5 pb-1.5 font-mono text-etiqueta tracking-[0.14em] text-tinta-suave">
              {elemento.etiqueta}
            </p>
          ) : (
            <button
              key={elemento.clave}
              type="button"
              aria-pressed={elemento.clave === clave}
              onClick={() => alElegir(elemento.seleccion)}
              className={cn(
                "flex min-h-9 cursor-pointer items-center justify-between gap-2 rounded-control px-3 py-[9px] text-left",
                CLASE_FOCO,
                elemento.clave === clave ? CLASE_ELEGIDA : "hover:bg-superficie-calida",
              )}
            >
              <span className="min-w-0 text-nav font-semibold [overflow-wrap:anywhere]">{elemento.nombre}</span>
              <span className="shrink-0 font-mono text-[10.5px] text-tinta-suave">{detalleDePendientes(elemento.pendientes)}</span>
            </button>
          ),
        )}
      </div>
    </section>
  );
}
