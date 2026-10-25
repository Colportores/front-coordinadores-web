"use client";

import type { KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

import { EtiquetaDeEstado } from "./EtiquetaDeEstado";
import type { Fila, Pestana } from "./modelo";

export interface PestanaConConteo {
  id: Pestana;
  rotulo: string;
  n: number;
}

/**
 * Las pestañas por estado y, abajo, la lista de lo que hay en esa pestaña. La fila elegida se abre en el detalle. Las
 * pestañas se mueven con las flechas (Inicio y Fin van a la primera y a la última).
 */
export function BandejaDePedidos({
  pestanas,
  pestanaActiva,
  alElegirPestana,
  filas,
  claveAbierta,
  alElegirFila,
  textoVacio,
  nombreDeLaLista,
}: {
  pestanas: PestanaConConteo[];
  pestanaActiva: Pestana;
  alElegirPestana: (pestana: Pestana, conFoco: boolean) => void;
  filas: Fila[];
  claveAbierta: string | null;
  alElegirFila: (clave: string) => void;
  textoVacio: string;
  nombreDeLaLista: string;
}) {
  const moverPestana = (evento: KeyboardEvent, indice: number) => {
    const paso = evento.key === "ArrowRight" ? 1 : evento.key === "ArrowLeft" ? -1 : 0;
    if (!paso && evento.key !== "Home" && evento.key !== "End") return;
    evento.preventDefault();
    const destino = evento.key === "Home" ? 0 : evento.key === "End" ? pestanas.length - 1 : (indice + paso + pestanas.length) % pestanas.length;
    alElegirPestana(pestanas[destino].id, true);
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-3.5">
      <div role="tablist" aria-label="Estado de los pedidos" className="flex flex-wrap gap-1.5">
        {pestanas.map((p, indice) => {
          const activa = p.id === pestanaActiva;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              id={`pestana-pedidos-${p.id}`}
              aria-selected={activa}
              aria-controls="panel-pedidos"
              tabIndex={activa ? 0 : -1}
              data-foco={`pestana-${p.id}`}
              onClick={() => alElegirPestana(p.id, false)}
              onKeyDown={(e) => moverPestana(e, indice)}
              className={cn(
                "inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-pastilla border px-3.5 text-chico font-semibold whitespace-nowrap focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none",
                activa ? "border-marca bg-marca text-superficie" : "border-borde bg-superficie text-tinta-2",
              )}
            >
              {p.rotulo}
              <span className="font-mono text-mini font-medium">{p.n}</span>
            </button>
          );
        })}
      </div>

      <div
        id="panel-pedidos"
        role="tabpanel"
        aria-labelledby={`pestana-pedidos-${pestanaActiva}`}
        className="min-h-0 flex-1 overflow-auto rounded-tarjeta border border-borde bg-superficie"
      >
        {filas.length === 0 ? (
          <p role="status" className="px-[18px] py-6 text-center text-chico text-tinta-suave">
            {textoVacio}
          </p>
        ) : (
          <ul aria-label={nombreDeLaLista} className="m-0 list-none p-0">
            {filas.map((fila) => {
              const abierta = fila.clave === claveAbierta;
              return (
                <li key={fila.clave} className="border-b border-borde-suave">
                  <button
                    type="button"
                    data-foco={`fila:${fila.clave}`}
                    aria-current={abierta ? "true" : undefined}
                    aria-label={`${fila.numero}, ${fila.quien}, ${fila.que}, ${fila.monto}, ${fila.cuando}, ${fila.etiqueta.texto}`}
                    onClick={() => alElegirFila(fila.clave)}
                    className={cn(
                      "grid min-h-14 w-full cursor-pointer grid-cols-[64px_minmax(0,1fr)_auto_auto] items-center gap-3 px-4 text-left text-cuerpo hover:bg-marca-clara focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-acento",
                      abierta && "bg-marca-clara shadow-[inset_3px_0_0_var(--marca-media)]",
                    )}
                  >
                    <span aria-hidden="true" className="font-mono text-[11.5px] text-tinta-suave">
                      {fila.numero}
                    </span>
                    <span aria-hidden="true" className="flex min-w-0 flex-col">
                      <span className="truncate font-semibold" title={fila.quien}>
                        {fila.quien}
                      </span>
                      <span className="truncate text-mini text-tinta-suave" title={fila.que}>
                        {fila.que}
                      </span>
                    </span>
                    <span aria-hidden="true" className="flex flex-col items-end">
                      <span className="font-mono whitespace-nowrap">{fila.monto}</span>
                      <span className="text-mini whitespace-nowrap text-tinta-suave">{fila.cuando}</span>
                    </span>
                    <span aria-hidden="true" className="justify-self-end">
                      <EtiquetaDeEstado etiqueta={fila.etiqueta} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
