"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

const CLASE_FOCO = "focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none";
const CLASE_BOTON = cn(
  "inline-flex min-h-10 cursor-pointer items-center justify-center rounded-control border px-4 text-nav font-semibold",
  CLASE_FOCO,
);

/** Con Enter sostenido en «Añadir», las repeticiones de la tecla caen en el botón que tiene el foco: no lo aprietan. */
function sinRepeticion(evento: KeyboardEvent<HTMLButtonElement>) {
  if (evento.repeat) evento.preventDefault();
}

/**
 * Confirmación antes de añadir como colportor una cuenta de coordinación o de administración (vista 23, decisión de Cristian
 * del 11/11). No hay artboard: sigue el patrón de los diálogos del panel (`DialogoDeAlquiler`). Es un `alertdialog`: corta la
 * acción y pide una respuesta. El foco arranca en «Cancelar» (lo seguro), Esc cancela y Tab no sale del diálogo. Añadir de
 * verdad sigue con el aviso de «Deshacer» de siempre, así que acá no hay nada que guardar ni estado de espera.
 */
export function DialogoCuentaConRol({
  titulo,
  texto,
  alCancelar,
  alConfirmar,
}: {
  titulo: string;
  texto: string;
  alCancelar: () => void;
  alConfirmar: () => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const cancelar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelar.current?.focus();
  }, []);

  function alTeclear(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key === "Escape") {
      evento.preventDefault();
      evento.stopPropagation();
      alCancelar();
      return;
    }
    if (evento.key !== "Tab" || !caja.current) return;
    const enfocables = [...caja.current.querySelectorAll<HTMLElement>("button:not([disabled])")];
    const primero = enfocables[0];
    const ultimo = enfocables.at(-1);
    if (!primero || !ultimo) return;
    // Un clic en el texto deja el foco en la caja (`tabIndex=-1`): de ahí Tab entra por el primero y Shift+Tab por el último.
    if (document.activeElement === caja.current) {
      evento.preventDefault();
      (evento.shiftKey ? ultimo : primero).focus();
    } else if (evento.shiftKey && document.activeElement === primero) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primero.focus();
    }
  }

  return (
    // El fondo no es un control: solo recibe las teclas (Esc y el ciclo de Tab) de lo que está dentro del diálogo.
    <div
      role="presentation"
      className="fixed inset-0 z-50 grid place-items-center bg-tinta/45 p-4"
      onKeyDown={alTeclear}
      onMouseDown={(evento) => {
        // Un clic en el fondo no cierra ni manda el foco al <body>: Esc tiene que seguir cancelando.
        if (evento.target === evento.currentTarget) {
          evento.preventDefault();
          caja.current?.focus();
        }
      }}
    >
      <div
        ref={caja}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="titulo-cuenta-con-rol"
        aria-describedby="texto-cuenta-con-rol"
        className="flex max-h-full w-full max-w-[480px] flex-col gap-3.5 overflow-auto rounded-[12px] bg-superficie px-[26px] py-6 shadow-[0_24px_60px_rgba(14,26,43,.3)] focus:outline-none"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-[3px] grid size-6 flex-none place-items-center rounded-full bg-alerta text-nav font-bold text-superficie"
          >
            !
          </span>
          <h2 id="titulo-cuenta-con-rol" className="font-serif text-[21px] font-semibold text-balance text-tinta [overflow-wrap:anywhere]">
            {titulo}
          </h2>
        </div>
        <p id="texto-cuenta-con-rol" className="text-[13.5px] leading-normal text-pretty text-tinta-2 [overflow-wrap:anywhere]">
          {texto}
        </p>
        <div className="mt-1 flex flex-wrap justify-end gap-2.5">
          <button
            ref={cancelar}
            type="button"
            onClick={alCancelar}
            onKeyDown={sinRepeticion}
            className={cn(CLASE_BOTON, "border-grafico-neutro bg-superficie text-tinta-2")}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={alConfirmar}
            onKeyDown={sinRepeticion}
            className={cn(CLASE_BOTON, "border-marca bg-marca text-superficie")}
          >
            Añadir igual
          </button>
        </div>
      </div>
    </div>
  );
}
