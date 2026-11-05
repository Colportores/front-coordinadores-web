"use client";

import { cn } from "@/lib/utils";

import type { Ambito, ItemRiel, ModeloLista, NodoLista } from "./modelo";

const BOTON_ALTERNAR =
  "grid min-h-8 min-w-8 place-items-center rounded-control border border-borde bg-superficie text-nav text-marca-media hover:bg-marca-clara focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento";

function Nodo({ nodo, alElegir }: { nodo: NodoLista; alElegir: (ambito: Ambito) => void }) {
  return (
    <li>
      <button
        type="button"
        data-foco={nodo.clave}
        aria-current={nodo.seleccionado ? "true" : undefined}
        title={nodo.nombre}
        aria-label={nodo.detalle ? `${nodo.nombre}, ${nodo.detalle}` : nodo.nombre}
        onClick={() => alElegir(nodo.ambito)}
        className={cn(
          "flex min-h-9 w-full min-w-0 items-center justify-between gap-2 rounded-control px-3 py-[9px] text-left hover:bg-marca-clara focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-acento",
          nodo.seleccionado && "bg-marca-clara shadow-[inset_3px_0_0_var(--marca-media)]",
        )}
      >
        <span className="min-w-0 truncate text-nav font-semibold text-tinta">{nodo.nombre}</span>
        <span aria-hidden="true" className="flex-none font-mono text-[10.5px] text-tinta-suave">
          {nodo.detalle}
        </span>
      </button>
    </li>
  );
}

/** La lista de ciudades de la vista 34, por departamento, con los avisos de stock de cada una. */
export function ListaDeCiudades({
  lista,
  alElegir,
  alContraer,
}: {
  lista: ModeloLista;
  alElegir: (ambito: Ambito) => void;
  alContraer: () => void;
}) {
  return (
    <nav aria-label="Ciudades" className="flex min-h-0 min-w-0 flex-col border-r border-borde bg-superficie">
      <div className="flex items-center justify-between py-3 pr-3 pl-[18px]">
        <h2 className="font-serif text-titulo font-semibold text-tinta">Ciudades</h2>
        <button
          type="button"
          data-foco="alternar"
          title="Contraer ciudades"
          aria-label="Contraer ciudades"
          aria-expanded="true"
          onClick={alContraer}
          className={BOTON_ALTERNAR}
        >
          <span aria-hidden="true">«</span>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2.5 pb-3.5">
        <ul className="flex flex-col gap-0.5">
          <Nodo nodo={lista.todas} alElegir={alElegir} />
        </ul>
        {lista.grupos.map((grupo) => (
          <section key={grupo.clave} aria-label={grupo.titulo ?? undefined}>
            {grupo.titulo && (
              <h3 className="px-2 pt-3.5 pb-1.5 font-mono text-etiqueta font-normal tracking-etiqueta text-tinta-suave">
                {grupo.titulo}
              </h3>
            )}
            <ul className={cn("flex flex-col gap-0.5", !grupo.titulo && "pt-3.5")}>
              {grupo.nodos.map((nodo) => (
                <Nodo key={nodo.clave} nodo={nodo} alElegir={alElegir} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </nav>
  );
}

/** La lista contraída: solo las abreviaturas de cada ciudad. */
export function RielDeCiudades({
  items,
  alElegir,
  alExpandir,
}: {
  items: ItemRiel[];
  alElegir: (ambito: Ambito) => void;
  alExpandir: () => void;
}) {
  return (
    <nav aria-label="Ciudades" className="flex min-h-0 flex-col items-center gap-1.5 overflow-auto border-r border-borde bg-superficie py-3">
      <button
        type="button"
        data-foco="alternar"
        title="Expandir ciudades"
        aria-label="Expandir ciudades"
        aria-expanded="false"
        onClick={alExpandir}
        className={cn(BOTON_ALTERNAR, "mb-1.5")}
      >
        <span aria-hidden="true">»</span>
      </button>
      <ul className="flex flex-col items-center gap-1.5">
        {items.map((item) => (
          <li key={item.clave}>
            <button
              type="button"
              data-foco={item.clave}
              title={item.nombre}
              aria-label={item.nombre}
              aria-current={item.seleccionado ? "true" : undefined}
              onClick={() => alElegir(item.ambito)}
              className={cn(
                "grid min-h-10 w-[52px] place-items-center rounded-control text-[11.5px] font-semibold text-tinta hover:bg-marca-clara focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-acento",
                item.seleccionado && "bg-marca-clara shadow-[inset_3px_0_0_var(--marca-media)]",
              )}
            >
              <span aria-hidden="true">{item.abreviatura}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
