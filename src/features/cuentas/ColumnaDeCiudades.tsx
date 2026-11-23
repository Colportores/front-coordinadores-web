"use client";

import { useRef } from "react";

import { BuscadorDeCiudades, SinCoincidenciasDeCiudades } from "@/components/BuscadorDeCiudades";
import { BotonAlternar } from "@/features/inicio/ListaDeCiudades";
import { claveDe, detalleDePendientes, type ElementoDeLista, type Seleccion } from "@/features/cuentas/modelo";
import { useMantenerVisible } from "@/lib/mantener-visible";
import { useBuscarEnColumna } from "@/lib/use-buscar-en-columna";
import { cn } from "@/lib/utils";

type Renglon = Extract<ElementoDeLista, { tipo: "ciudad" }>;

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
  const desplazable = useRef<HTMLDivElement>(null);
  const renglones = elementos.filter((e): e is Renglon => e.tipo === "ciudad");
  const busqueda = useBuscarEnColumna(renglones, (e) => e.seleccion.tipo === "ciudad", clave);
  useMantenerVisible(desplazable, `${contraida}:${clave}:${busqueda.buscando}`);

  if (contraida) {
    return (
      <section
        ref={desplazable}
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
          const detalle = detalleDePendientes(elemento.pendientes, elemento.porDecidir);
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
              {elemento.pendientes + elemento.porDecidir > 0 && (
                <span aria-hidden className="font-mono text-etiqueta text-alerta">
                  {elemento.pendientes + elemento.porDecidir}
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
      {busqueda.conBuscador && (
        <div className="px-2.5 pb-2">
          <BuscadorDeCiudades
            texto={busqueda.texto}
            alCambiar={busqueda.setTexto}
            total={busqueda.total}
            coinciden={busqueda.coinciden.length}
            buscando={busqueda.buscando}
            alElegirPrimera={() => {
              if (busqueda.coinciden[0]) alElegir(busqueda.coinciden[0].seleccion);
            }}
          />
        </div>
      )}
      <div ref={desplazable} className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto px-2.5 pb-3.5">
        {busqueda.buscando ? (
          <>
            {busqueda.visibles.map((elemento) => (
              <FilaDeCiudad key={elemento.clave} elemento={elemento} elegida={elemento.clave === clave} alElegir={alElegir} />
            ))}
            {busqueda.coinciden.length === 0 && <SinCoincidenciasDeCiudades texto={busqueda.texto} />}
          </>
        ) : (
          elementos.map((elemento) =>
            elemento.tipo === "grupo" ? (
              <p key={elemento.clave} className="px-2 pt-3.5 pb-1.5 font-mono text-etiqueta tracking-[0.14em] text-tinta-suave">
                {elemento.etiqueta}
              </p>
            ) : (
              <FilaDeCiudad key={elemento.clave} elemento={elemento} elegida={elemento.clave === clave} alElegir={alElegir} />
            ),
          )
        )}
      </div>
    </section>
  );
}

/** Un renglón de la columna expandida: la ciudad (o «Todas», o «Todo el departamento») con sus tickets por validar. */
function FilaDeCiudad({ elemento, elegida, alElegir }: { elemento: Renglon; elegida: boolean; alElegir: (seleccion: Seleccion) => void }) {
  return (
    <button
      type="button"
      aria-pressed={elegida}
      onClick={() => alElegir(elemento.seleccion)}
      className={cn(
        "flex min-h-9 cursor-pointer flex-wrap items-center justify-between gap-x-2 gap-y-0.5 rounded-control px-3 py-[9px] text-left",
        CLASE_FOCO,
        elegida ? CLASE_ELEGIDA : "hover:bg-superficie-calida",
      )}
    >
      <span className="min-w-0 text-nav font-semibold [overflow-wrap:anywhere]">{elemento.nombre}</span>
      <span className="shrink-0 font-mono text-[10.5px] text-tinta-suave">{detalleDePendientes(elemento.pendientes, elemento.porDecidir)}</span>
    </button>
  );
}
