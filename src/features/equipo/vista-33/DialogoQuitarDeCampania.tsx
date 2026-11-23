"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

import {
  TEXTO_CONFIRMAR_QUITAR,
  TEXTO_QUITANDO,
  textoSinConexionAlQuitar,
  textosDeConfirmacion,
  textosDeQuePasa,
} from "./quitar-de-campania";

const CLASE_FOCO = "focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none";
const CLASE_BOTON = cn(
  "inline-flex min-h-10 cursor-pointer items-center justify-center gap-2.5 rounded-control border px-4 text-nav font-semibold",
  CLASE_FOCO,
);
const CLASE_SECUNDARIO = "border-grafico-neutro bg-superficie text-tinta-2";

export type PasoDeQuitar = "que-pasa" | "confirmar";

/**
 * Por qué no se quitó. `red`: no llegó o no contestó (no cambió nada, se puede reintentar). `rechazo`: la base dijo que no;
 * reintentar no lo arregla, así que solo queda cerrar.
 */
export type FallaAlQuitar = { tipo: "red" } | { tipo: "rechazo"; mensaje: string };

/** Con Enter sostenido, las repeticiones de la tecla caen en el botón que tiene el foco: no lo aprietan de nuevo. */
function sinRepeticion(evento: KeyboardEvent<HTMLButtonElement>) {
  if (evento.repeat) evento.preventDefault();
}

/**
 * «Quitar de la campaña» con doble confirmación (HU-CAM-005): primero qué pasa («Seguir»), después la confirmación final con
 * el botón rojo (patrón de la vista 39). Es un `alertdialog`: el foco arranca en lo seguro («Cancelar», «Volver»), Esc cierra
 * salvo mientras quita, y Tab no sale del diálogo. Sin conexión el botón rojo no manda nada y el aviso dice qué hacer.
 */
export function DialogoQuitarDeCampania({
  nombre,
  campania,
  paso,
  quitando,
  falla,
  enLinea,
  alSeguir,
  alVolver,
  alCancelar,
  alConfirmar,
}: {
  nombre: string;
  campania: string;
  paso: PasoDeQuitar;
  quitando: boolean;
  falla: FallaAlQuitar | null;
  enLinea: boolean;
  alSeguir: () => void;
  alVolver: () => void;
  alCancelar: () => void;
  alConfirmar: () => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const rechazado = falla?.tipo === "rechazo";
  const { titulo, texto } = paso === "que-pasa" ? textosDeQuePasa(nombre, campania) : textosDeConfirmacion(nombre);
  const aviso = rechazado ? falla.mensaje : !quitando && (!enLinea || falla?.tipo === "red") ? textoSinConexionAlQuitar(nombre) : null;
  const bloqueado = quitando || !enLinea;

  // Al abrir y al cambiar de paso, el foco va a lo seguro de ese paso; si la base lo rechazó, a «Cerrar».
  useEffect(() => {
    caja.current?.querySelector<HTMLElement>('[data-inicial="si"]')?.focus();
  }, [paso, rechazado]);

  function alTeclear(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key === "Escape") {
      evento.preventDefault();
      evento.stopPropagation();
      if (!quitando) alCancelar();
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
        // Un clic en el fondo no cierra ni manda el foco al <body>: Esc tiene que seguir cerrando.
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
        aria-labelledby="titulo-quitar-de-campania"
        aria-describedby="texto-quitar-de-campania"
        aria-busy={quitando}
        className="flex max-h-full w-full max-w-[480px] flex-col gap-3.5 overflow-auto rounded-[12px] bg-superficie px-[26px] py-6 shadow-[0_24px_60px_rgba(14,26,43,.3)] focus:outline-none"
      >
        <h2 id="titulo-quitar-de-campania" className="font-serif text-[21px] font-semibold text-balance text-tinta [overflow-wrap:anywhere]">
          {titulo}
        </h2>
        <p id="texto-quitar-de-campania" className="text-[13.5px] leading-normal text-pretty text-tinta-2 [overflow-wrap:anywhere]">
          {texto}
        </p>

        {aviso && (
          <div role="alert" className="flex items-start gap-3 rounded-[10px] border-[1.5px] border-peligro bg-superficie px-3.5 py-[11px]">
            <span aria-hidden className="grid size-5 flex-none place-items-center rounded-full bg-peligro text-[11px] font-bold text-superficie">
              !
            </span>
            <span className="flex-1 text-[13px] leading-[1.45] text-tinta [overflow-wrap:anywhere]">{aviso}</span>
          </div>
        )}

        <div className="mt-1 flex flex-wrap justify-end gap-2.5">
          {rechazado ? (
            <button type="button" data-inicial="si" onClick={alCancelar} className={cn(CLASE_BOTON, CLASE_SECUNDARIO)}>
              Cerrar
            </button>
          ) : paso === "que-pasa" ? (
            <>
              <button type="button" data-inicial="si" onClick={alCancelar} className={cn(CLASE_BOTON, CLASE_SECUNDARIO)}>
                Cancelar
              </button>
              <button type="button" onClick={alSeguir} onKeyDown={sinRepeticion} className={cn(CLASE_BOTON, "border-marca bg-marca text-superficie")}>
                Seguir
              </button>
            </>
          ) : (
            <>
              {!quitando && (
                <button type="button" data-inicial="si" onClick={alVolver} className={cn(CLASE_BOTON, CLASE_SECUNDARIO)}>
                  Volver
                </button>
              )}
              <button
                type="button"
                aria-disabled={bloqueado}
                onClick={() => {
                  if (!bloqueado) alConfirmar();
                }}
                onKeyDown={sinRepeticion}
                className={cn(
                  CLASE_BOTON,
                  "text-superficie",
                  quitando
                    ? "cursor-progress border-peligro/70 bg-peligro/70"
                    : !enLinea
                      ? "cursor-not-allowed border-[#90A0B7] bg-[#90A0B7]"
                      : "border-peligro bg-peligro",
                )}
              >
                {quitando && (
                  <span aria-hidden className="size-3.5 rounded-full border-2 border-superficie/35 border-t-superficie motion-safe:animate-spin" />
                )}
                {quitando ? TEXTO_QUITANDO : falla?.tipo === "red" ? "Reintentar" : TEXTO_CONFIRMAR_QUITAR}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
