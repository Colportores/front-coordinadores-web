"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { useEnLinea } from "@/lib/en-linea";
import { mensajeSinConexion } from "@/lib/mensajes";
import { cn } from "@/lib/utils";

import { formatearCantidad } from "../vista-34/modelo";
import { validarLimite } from "./modelo";

const BOTON =
  "inline-flex min-h-10 cursor-pointer items-center justify-center rounded-control border px-4 text-nav font-semibold whitespace-nowrap focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none aria-disabled:cursor-not-allowed aria-disabled:opacity-60";

type Error = { texto: string; deCampo: boolean };

/**
 * Editar el límite de deuda de la campaña (42A·02): un solo límite para todos los colportores, que avisa cuando un pedido lo pasa
 * y no lo bloquea. Debajo del campo, lo que pasaría con los pedidos por autorizar con el valor escrito. El foco arranca en el
 * campo; Esc cancela y Tab no sale del diálogo. Mientras guarda no se puede cerrar; si no se pudo guardar, el diálogo sigue
 * abierto con lo escrito, dice qué pasó y «Guardar» vuelve a poder usarse. Un valor igual al de hoy cierra sin guardar nada.
 */
export function DialogoDelLimite({
  limiteActual,
  campaniaNombre,
  notaPara,
  alGuardar,
  alCerrar,
}: {
  limiteActual: number | null;
  campaniaNombre: string | null;
  /** Qué pasa con los pedidos por autorizar si el límite fuera este. */
  notaPara: (limite: number) => string;
  /** Guarda el límite; si sale bien la vista cierra el diálogo. */
  alGuardar: (limite: number) => Promise<{ ok: true } | { ok: false; mensaje: string }>;
  alCerrar: () => void;
}) {
  const [texto, setTexto] = useState(limiteActual === null ? "" : formatearCantidad(limiteActual));
  const [error, setError] = useState<Error | null>(null);
  const [enviando, setEnviando] = useState(false);
  const enLinea = useEnLinea();
  const id = useId();
  const campo = useRef<HTMLInputElement>(null);
  const cancelar = useRef<HTMLButtonElement>(null);
  const guardar = useRef<HTMLButtonElement>(null);
  const enCamino = useRef(false);

  useEffect(() => {
    campo.current?.focus();
    campo.current?.select();
  }, []);

  const valido = validarLimite(texto);
  const nota = valido.ok ? notaPara(valido.limite) : null;

  const guardarLimite = async () => {
    if (enCamino.current || !enLinea) return;
    const dicho = validarLimite(texto);
    if (!dicho.ok) {
      setError({ texto: dicho.error, deCampo: true });
      campo.current?.focus();
      return;
    }
    if (dicho.limite === limiteActual) {
      alCerrar();
      return;
    }
    enCamino.current = true;
    setError(null);
    setEnviando(true);
    try {
      const resultado = await alGuardar(dicho.limite);
      if (!resultado.ok) {
        setError({ texto: resultado.mensaje, deCampo: false });
        campo.current?.focus();
      }
    } finally {
      enCamino.current = false;
      setEnviando(false);
    }
  };

  const cerrar = () => {
    if (enCamino.current) return;
    alCerrar();
  };

  function alTeclear(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key === "Escape") {
      evento.preventDefault();
      evento.stopPropagation();
      cerrar();
    } else if (evento.key === "Tab") {
      const primero = campo.current;
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

  const idError = `${id}-error`;
  const idNota = `${id}-nota`;
  const idAyuda = `${id}-ayuda`;
  return (
    // El fondo no es un control: solo recibe las teclas (Esc y el ciclo de Tab) de lo que está dentro del diálogo.
    <div role="presentation" className="fixed inset-0 z-50 grid place-items-center bg-tinta/40 p-4" onKeyDown={alTeclear}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        aria-describedby={`${id}-texto`}
        className="flex max-h-full w-full max-w-lg flex-col gap-3.5 overflow-auto rounded-tarjeta border border-borde bg-superficie px-[22px] py-5 shadow-lg"
      >
        <h2 id={`${id}-titulo`} className="font-serif text-[21px] font-semibold text-balance text-tinta">
          Límite de deuda de la campaña
        </h2>
        <p id={`${id}-texto`} className="text-nav text-pretty text-tinta-2">
          Un solo límite para todos los colportores de {campaniaNombre ?? "la campaña"}. Avisa cuando un pedido lo pasa; no lo bloquea.
        </p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-campo`} className="font-mono text-[10px] tracking-[.14em] text-tinta-suave">
            LÍMITE POR COLPORTOR
          </label>
          <input
            ref={campo}
            id={`${id}-campo`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={texto}
            readOnly={enviando}
            aria-invalid={error?.deCampo ? true : undefined}
            aria-describedby={[idAyuda, error ? idError : null, nota ? idNota : null].filter(Boolean).join(" ")}
            onChange={(e) => {
              setTexto(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void guardarLimite();
              }
            }}
            className={cn(
              "min-h-10 w-full rounded-control border bg-superficie px-3 py-2 text-[14px] text-tinta focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none",
              error?.deCampo ? "border-peligro" : "border-borde",
            )}
          />
          <span id={idAyuda} className="text-chico text-tinta-suave">
            En pesos, sin centavos. Por ejemplo: 35.000.
          </span>
          {error && (
            <span id={idError} role="alert" className="text-cuerpo text-peligro">
              {error.texto}
            </span>
          )}
        </div>
        {nota && (
          <span id={idNota} role="note" className="text-cuerpo text-pretty text-tinta-suave">
            {nota}
          </span>
        )}
        {!enLinea && (
          <span role="note" className="text-cuerpo text-peligro">
            {mensajeSinConexion("guardar el límite")}
          </span>
        )}
        <div className="flex flex-wrap justify-end gap-2.5">
          <button
            ref={cancelar}
            type="button"
            aria-disabled={enviando}
            onClick={cerrar}
            className={cn(BOTON, "border-grafico-neutro bg-superficie text-tinta-2")}
          >
            Cancelar
          </button>
          <button
            ref={guardar}
            type="button"
            aria-disabled={enviando || !enLinea}
            onClick={() => void guardarLimite()}
            className={cn(BOTON, "border-marca bg-marca text-superficie")}
          >
            {enviando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
