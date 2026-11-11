"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { formatoPesos, UMBRAL_DE_CAMBIO_GRANDE, type CambioGrande } from "./modelo";

export function textoDelDialogo(grandes: number, total: number): string {
  const umbral = Math.round(UMBRAL_DE_CAMBIO_GRANDE * 100);
  if (total === 1) return `El cambio supera el ${umbral} % respecto del precio anterior.`;
  return `${grandes} de los ${total} cambios superan el ${umbral} % respecto del precio anterior.`;
}

/**
 * La confirmación de un cambio grande (27A·03): antes de guardar se listan los precios que cambian más del 20 %, hacia arriba
 * o hacia abajo. El foco arranca en «Volver a editar», la acción segura; Esc también vuelve a editar y Tab no sale del diálogo.
 */
export function DialogoDeCambiosGrandes({
  grandes,
  total,
  enviando,
  alVolver,
  alGuardar,
}: {
  grandes: CambioGrande[];
  /** Cuántos cambios hay en total en la ciudad. */
  total: number;
  enviando: boolean;
  alVolver: () => void;
  alGuardar: () => void;
}) {
  const volver = useRef<HTMLButtonElement>(null);
  const guardar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    volver.current?.focus();
  }, []);

  function alTeclear(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key === "Escape") {
      evento.preventDefault();
      evento.stopPropagation();
      alVolver();
    } else if (evento.key === "Tab") {
      const primero = volver.current;
      const ultimo = guardar.current;
      if (!primero || !ultimo) return;
      if (evento.shiftKey && document.activeElement === primero) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primero.focus();
      }
    }
  }

  return (
    // El fondo no es un control: solo recibe las teclas (Esc y el ciclo de Tab) de lo que está dentro del diálogo.
    <div role="presentation" className="fixed inset-0 z-50 grid place-items-center bg-tinta/40 p-4" onKeyDown={alTeclear}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-cambios-grandes"
        aria-describedby="texto-cambios-grandes"
        className="flex max-h-full w-full max-w-lg flex-col gap-3 overflow-auto rounded-tarjeta border border-borde bg-superficie px-[22px] py-5 shadow-lg"
      >
        <h2 id="titulo-cambios-grandes" className="font-serif text-[19px] font-semibold text-tinta">
          Revisá los cambios grandes
        </h2>
        <p id="texto-cambios-grandes" className="text-nav text-tinta-2">
          {textoDelDialogo(grandes.length, total)}
        </p>
        <ul className="flex flex-col divide-y divide-borde-suave rounded-tarjeta border border-borde">
          {grandes.map((g) => (
            <li key={g.item.clave} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-3 py-2">
              <span className="min-w-0 text-cuerpo font-semibold wrap-anywhere text-tinta">{g.item.nombre}</span>
              <span className="text-cuerpo text-tinta-2">
                {formatoPesos(g.anterior)} → <strong className="font-semibold text-tinta">{formatoPesos(g.nuevo)}</strong>
              </span>
              <span className={cn("w-full text-chico", g.diferencia.sube ? "text-exito" : "text-peligro")}>{g.diferencia.texto}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap justify-end gap-2">
          <Button ref={volver} type="button" variant="outline" onClick={alVolver} className="text-nav font-semibold">
            Volver a editar
          </Button>
          <Button ref={guardar} type="button" onClick={alGuardar} disabled={enviando} className="text-nav font-semibold">
            Guardar igual
          </Button>
        </div>
      </div>
    </div>
  );
}
