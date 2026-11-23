"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";

import { MOTIVOS_DE_ANULACION } from "@/datos/cuentas/contrato";
import type { MotivoDeAnulacion, TicketDeCuentas } from "@/datos/cuentas";
import {
  AVISO_DEL_CAMPO_OTRO,
  ERROR_DEL_CAMPO_OTRO,
  MAX_DETALLE_DE_OTRO,
  MOTIVO_OTRO,
  PLACEHOLDER_DEL_CAMPO_OTRO,
  ROTULO_DEL_CAMPO_OTRO,
  TEXTO_ANULANDO,
  TEXTO_CONFIRMAR,
  textoDeConfirmacion,
  textoDeMotivo,
  textoDelMotivo,
  TITULO_DE_CONFIRMACION,
  TITULO_NO_SE_ANULO,
  tituloDelMotivo,
} from "@/features/cuentas/anular-cobro";
import { trozosConMontos } from "@/features/cuentas/formato";
import { motivoCompleto, type Anulando } from "@/features/cuentas/useAnularCobro";
import { cn } from "@/lib/utils";

const CLASE_FOCO = "focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none";
const CLASE_BOTON = cn(
  "inline-flex min-h-10 cursor-pointer items-center justify-center gap-2.5 rounded-control border px-4 text-nav font-semibold whitespace-nowrap",
  CLASE_FOCO,
);
const ENFOCABLES = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Anular un cobro (vista 39): primero el motivo (los cuatro del teléfono; con «Otro», el texto es obligatorio), después la
 * segunda confirmación que dice qué cambia. Mientras anula no se cierra ni se vuelve; si falla, dice que no cambió nada y ofrece
 * «Reintentar»; si el plazo venció mientras confirmaba, solo «Cerrar». Esc cierra (salvo anulando) y Tab no sale del diálogo.
 */
export function DialogoDeAnularCobro({
  ticket,
  nombre,
  estado,
  anulando,
  alElegir,
  alEscribir,
  alSeguir,
  alVolver,
  alCancelar,
  alConfirmar,
}: {
  ticket: TicketDeCuentas;
  nombre: string;
  estado: Anulando;
  /** Hay una anulación en camino (39A·05). */
  anulando: boolean;
  alElegir: (motivo: MotivoDeAnulacion) => void;
  alEscribir: (texto: string) => void;
  alSeguir: () => void;
  alVolver: () => void;
  alCancelar: () => void;
  alConfirmar: () => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const { paso, motivo, detalle, error } = estado;
  const confirmando = paso === "confirmar";
  const noSeAnulo = paso === "no-se-anulo";
  const conOtro = motivo === MOTIVO_OTRO;
  const completo = motivoCompleto(estado);

  // Al abrir y al cambiar de paso, el foco va a lo primero que se usa: el motivo elegido (o el primero), «Volver» o «Cerrar».
  useEffect(() => {
    const raiz = caja.current;
    if (!raiz) return;
    const inicial =
      confirmando || noSeAnulo
        ? raiz.querySelector<HTMLElement>('[data-inicial="si"]')
        : (raiz.querySelector<HTMLElement>("input[type=radio]:checked") ?? raiz.querySelector<HTMLElement>("input[type=radio]"));
    inicial?.focus();
  }, [confirmando, noSeAnulo]);

  function alTeclear(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key === "Escape") {
      evento.preventDefault();
      evento.stopPropagation();
      if (!anulando) alCancelar();
      return;
    }
    if (evento.key !== "Tab" || !caja.current) return;
    const enfocables = [...caja.current.querySelectorAll<HTMLElement>(ENFOCABLES)];
    const primero = enfocables[0];
    const ultimo = enfocables.at(-1);
    if (!primero || !ultimo) return;
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

  const titulo = noSeAnulo ? TITULO_NO_SE_ANULO : confirmando ? TITULO_DE_CONFIRMACION : tituloDelMotivo(ticket);
  const texto = noSeAnulo ? null : confirmando ? textoDeConfirmacion(nombre, ticket) : textoDelMotivo(nombre, ticket);

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 grid place-items-center bg-tinta/45 p-4"
      onKeyDown={alTeclear}
      onMouseDown={(evento) => {
        // Un clic en el fondo no manda el foco al <body>: Esc tiene que seguir cerrando el diálogo.
        if (evento.target === evento.currentTarget) {
          evento.preventDefault();
          caja.current?.focus();
        }
      }}
    >
      <div
        ref={caja}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-anular-cobro"
        aria-describedby={texto ? "texto-anular-cobro" : undefined}
        className="flex max-h-full w-full max-w-[480px] flex-col gap-3.5 overflow-auto rounded-[12px] bg-superficie px-[26px] py-6 shadow-[0_24px_60px_rgba(14,26,43,.3)] focus:outline-none"
      >
        <h2 id="titulo-anular-cobro" className="font-serif text-[21px] font-semibold text-balance text-tinta [overflow-wrap:anywhere]">
          {/* El monto no se parte entre líneas («$U» / «4.800»). */}
          {trozosConMontos(titulo).map((trozo) =>
            trozo.monto ? (
              <span key={trozo.texto} className="whitespace-nowrap">
                {trozo.texto}
              </span>
            ) : (
              trozo.texto
            ),
          )}
        </h2>
        {texto && (
          <p id="texto-anular-cobro" className="text-[13.5px] leading-normal text-pretty text-tinta-2 [overflow-wrap:anywhere]">
            {texto}
          </p>
        )}

        {(confirmando || noSeAnulo) && error && (
          <div role="alert" className="flex items-start gap-3 rounded-[10px] border-[1.5px] border-peligro bg-superficie px-3.5 py-[11px]">
            <span aria-hidden className="grid size-5 flex-none place-items-center rounded-full bg-peligro text-[11px] font-bold text-superficie">
              !
            </span>
            <span className="flex-1 text-[13px] leading-[1.45] text-tinta [overflow-wrap:anywhere]">{error}</span>
          </div>
        )}

        {confirmando && motivo && (
          <dl className="m-0 flex flex-col">
            <div className="flex items-center justify-between gap-3.5 py-[9px] text-[13px]">
              <dt className="text-tinta-suave">Motivo</dt>
              <dd className="m-0 min-w-0 text-right font-semibold text-tinta [overflow-wrap:anywhere]">{textoDeMotivo(motivo, detalle)}</dd>
            </div>
          </dl>
        )}

        {!confirmando && !noSeAnulo && (
          <>
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="sr-only">Motivo de la anulación</legend>
              {MOTIVOS_DE_ANULACION.map((opcion) => (
                <label
                  key={opcion}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 rounded-tarjeta border border-borde bg-superficie px-3.5 py-2.5",
                    "has-[:checked]:border-2 has-[:checked]:border-marca has-[:checked]:bg-[#F2F6FB] has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-acento/50",
                  )}
                >
                  <input
                    type="radio"
                    name="motivo-de-anulacion"
                    value={opcion}
                    checked={motivo === opcion}
                    onChange={() => alElegir(opcion)}
                    className="size-4 flex-none cursor-pointer accent-marca focus-visible:outline-none"
                  />
                  <span className="text-[13.5px] font-semibold text-tinta">{opcion}</span>
                </label>
              ))}
            </fieldset>
            {conOtro && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="motivo-otro-anular-cobro" className="font-mono text-[10px] tracking-[0.14em] text-tinta-suave">
                  {ROTULO_DEL_CAMPO_OTRO}
                </label>
                <input
                  id="motivo-otro-anular-cobro"
                  type="text"
                  value={detalle}
                  maxLength={MAX_DETALLE_DE_OTRO}
                  placeholder={PLACEHOLDER_DEL_CAMPO_OTRO}
                  aria-required="true"
                  aria-invalid={!completo}
                  aria-describedby={completo ? "aviso-motivo-otro-anular-cobro" : "error-motivo-otro-anular-cobro aviso-motivo-otro-anular-cobro"}
                  onChange={(e) => alEscribir(e.target.value)}
                  className={cn(
                    "min-h-10 rounded-control border bg-superficie px-3 py-2.5 text-[14px] text-tinta placeholder:text-tinta-suave",
                    CLASE_FOCO,
                    completo ? "border-grafico-neutro" : "border-peligro",
                  )}
                />
                <span id="aviso-motivo-otro-anular-cobro" className="text-[12.5px] text-tinta-suave">
                  {AVISO_DEL_CAMPO_OTRO}
                </span>
                {!completo && (
                  <span id="error-motivo-otro-anular-cobro" role="alert" className="text-[12.5px] text-peligro">
                    {ERROR_DEL_CAMPO_OTRO}
                  </span>
                )}
              </div>
            )}
          </>
        )}

        <div className="mt-1 flex flex-wrap justify-end gap-2.5">
          {noSeAnulo ? (
            <button
              type="button"
              data-inicial="si"
              onClick={alCancelar}
              className={cn(CLASE_BOTON, "border-marca bg-marca text-superficie")}
            >
              Cerrar
            </button>
          ) : confirmando ? (
            <>
              {!anulando && (
                <button type="button" data-inicial="si" onClick={alVolver} className={cn(CLASE_BOTON, "border-grafico-neutro bg-superficie text-tinta-2")}>
                  Volver
                </button>
              )}
              <button
                type="button"
                aria-disabled={anulando}
                onClick={() => {
                  if (!anulando) alConfirmar();
                }}
                className={cn(CLASE_BOTON, "border-peligro bg-peligro text-superficie aria-disabled:cursor-progress aria-disabled:opacity-80")}
              >
                {anulando && (
                  <span
                    aria-hidden
                    className="size-3.5 rounded-full border-2 border-superficie/35 border-t-superficie motion-safe:animate-spin"
                  />
                )}
                {anulando ? TEXTO_ANULANDO : error ? "Reintentar" : TEXTO_CONFIRMAR}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={alCancelar} className={cn(CLASE_BOTON, "border-grafico-neutro bg-superficie text-tinta-2")}>
                Cancelar
              </button>
              <button
                type="button"
                aria-disabled={!completo}
                onClick={() => {
                  if (completo) alSeguir();
                }}
                className={cn(CLASE_BOTON, "text-superficie", completo ? "border-marca bg-marca" : "cursor-not-allowed border-[#90A0B7] bg-[#90A0B7]")}
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
