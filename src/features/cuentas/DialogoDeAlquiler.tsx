"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";

import type { DestinoDeAlquiler } from "@/datos/cuentas";
import type { TextosDeConfirmacion, TextosDeEleccion } from "@/features/cuentas/por-decidir";
import { cn } from "@/lib/utils";

const CLASE_FOCO = "focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none";
const CLASE_BOTON = cn(
  "inline-flex min-h-10 cursor-pointer items-center justify-center gap-2.5 rounded-control border px-4 text-nav font-semibold whitespace-nowrap",
  CLASE_FOCO,
);
const ENFOCABLES = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type PasoDeDecision = "elegir" | "confirmar";

/**
 * Decidir qué se hace con lo pagado «por decidir» (41A·02 a 41A·05, 41B·02): primero los tres destinos con una sola elección
 * («Seguir» se habilita al elegir), después la confirmación que dice qué pasa con la plata. Mientras guarda no se cierra ni se
 * vuelve; si falla, dice que no cambió nada y ofrece «Reintentar». Esc cierra (salvo guardando) y Tab no sale del diálogo.
 */
export function DialogoDeAlquiler({
  eleccion,
  confirmacion,
  paso,
  destino,
  error,
  guardando,
  alElegir,
  alSeguir,
  alVolver,
  alCancelar,
  alConfirmar,
}: {
  eleccion: TextosDeEleccion;
  /** Los textos de la confirmación del destino elegido (`null` mientras no se eligió). */
  confirmacion: TextosDeConfirmacion | null;
  paso: PasoDeDecision;
  destino: DestinoDeAlquiler | null;
  error: string | null;
  guardando: boolean;
  alElegir: (destino: DestinoDeAlquiler) => void;
  alSeguir: () => void;
  alVolver: () => void;
  alCancelar: () => void;
  alConfirmar: () => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const confirmando = paso === "confirmar" && confirmacion !== null;

  // Al abrir y al cambiar de paso, el foco va a lo primero que se usa: el destino elegido (o el primero), o «Volver».
  useEffect(() => {
    const raiz = caja.current;
    if (!raiz) return;
    const inicial = confirmando
      ? raiz.querySelector<HTMLElement>('[data-inicial="si"]')
      : (raiz.querySelector<HTMLElement>("input:checked") ?? raiz.querySelector<HTMLElement>("input[type=radio]"));
    inicial?.focus();
  }, [confirmando]);

  function alTeclear(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key === "Escape") {
      evento.preventDefault();
      evento.stopPropagation();
      if (!guardando) alCancelar();
      return;
    }
    if (evento.key !== "Tab" || !caja.current) return;
    const enfocables = [...caja.current.querySelectorAll<HTMLElement>(ENFOCABLES)];
    const primero = enfocables[0];
    const ultimo = enfocables.at(-1);
    if (!primero || !ultimo) return;
    if (evento.shiftKey && document.activeElement === primero) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primero.focus();
    }
  }

  const titulo = confirmando ? confirmacion.titulo : eleccion.titulo;
  const texto = confirmando ? confirmacion.texto : eleccion.texto;

  return (
    // El fondo no es un control: solo recibe las teclas (Esc y el ciclo de Tab) de lo que está dentro del diálogo.
    <div role="presentation" className="fixed inset-0 z-50 grid place-items-center bg-tinta/45 p-4" onKeyDown={alTeclear}>
      <div
        ref={caja}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-decidir-alquiler"
        aria-describedby="texto-decidir-alquiler"
        className="flex max-h-full w-full max-w-[480px] flex-col gap-3.5 overflow-auto rounded-[12px] bg-superficie px-[26px] py-6 shadow-[0_24px_60px_rgba(14,26,43,.3)]"
      >
        <h2 id="titulo-decidir-alquiler" className="font-serif text-[21px] font-semibold text-balance text-tinta [overflow-wrap:anywhere]">
          {titulo}
        </h2>
        <p id="texto-decidir-alquiler" className="text-[13.5px] leading-normal text-pretty text-tinta-2 [overflow-wrap:anywhere]">
          {texto}
        </p>

        {confirmando && error && (
          <div role="alert" className="flex items-start gap-3 rounded-[10px] border-[1.5px] border-peligro bg-superficie px-3.5 py-[11px]">
            <span aria-hidden className="grid size-5 flex-none place-items-center rounded-full bg-peligro text-[11px] font-bold text-superficie">
              !
            </span>
            <span className="flex-1 text-[13px] leading-[1.45] text-tinta">{error}</span>
          </div>
        )}

        {!confirmando && (
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="sr-only">Destino de todo el monto</legend>
            {eleccion.opciones.map((opcion) => (
              <label
                key={opcion.destino}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-tarjeta border bg-superficie px-3.5 py-2.5",
                  "has-[:checked]:border-2 has-[:checked]:border-marca has-[:checked]:bg-[#F2F6FB] has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-acento/50",
                  "border-borde",
                )}
              >
                <input
                  type="radio"
                  name="destino-alquiler"
                  value={opcion.destino}
                  checked={destino === opcion.destino}
                  onChange={() => alElegir(opcion.destino)}
                  className="size-4 flex-none cursor-pointer accent-marca focus-visible:outline-none"
                />
                <span className="flex min-w-0 flex-col gap-px">
                  <span className="text-[13.5px] font-semibold text-tinta">{opcion.titulo}</span>
                  <span className="text-chico leading-[1.4] text-tinta-suave">{opcion.detalle}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        <div className="mt-1 flex flex-wrap justify-end gap-2.5">
          {confirmando ? (
            <>
              {!guardando && (
                <button type="button" data-inicial="si" onClick={alVolver} className={cn(CLASE_BOTON, "border-grafico-neutro bg-superficie text-tinta-2")}>
                  Volver
                </button>
              )}
              <button
                type="button"
                aria-disabled={guardando}
                onClick={() => {
                  if (!guardando) alConfirmar();
                }}
                className={cn(
                  CLASE_BOTON,
                  "text-superficie aria-disabled:cursor-progress",
                  guardando ? "border-marca-media bg-marca-media" : "border-marca bg-marca",
                )}
              >
                {guardando && (
                  <span
                    aria-hidden
                    className="size-3.5 rounded-full border-2 border-superficie/35 border-t-superficie motion-safe:animate-spin"
                  />
                )}
                {guardando ? "Guardando…" : error ? "Reintentar" : confirmacion.boton}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={alCancelar} className={cn(CLASE_BOTON, "border-grafico-neutro bg-superficie text-tinta-2")}>
                Cancelar
              </button>
              <button
                type="button"
                aria-disabled={destino === null}
                onClick={() => {
                  if (destino !== null) alSeguir();
                }}
                className={cn(
                  CLASE_BOTON,
                  "text-superficie",
                  destino === null ? "cursor-not-allowed border-[#90A0B7] bg-[#90A0B7]" : "border-marca bg-marca",
                )}
              >
                Seguir
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
