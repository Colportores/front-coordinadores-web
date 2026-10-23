"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { AccionNoDisponible } from "@/components/AccionNoDisponible";
import { formatMonto } from "@/features/cuentas/formato";
import { validarAlquiler } from "@/features/cuentas/modelo";
import { cn } from "@/lib/utils";

const CLASE_BOTON =
  "inline-flex min-h-8 cursor-pointer items-center justify-center rounded-control border px-3.5 text-chico font-semibold whitespace-nowrap focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none aria-disabled:cursor-not-allowed aria-disabled:opacity-60";

/** El alquiler de la campaña se edita acá y cambia para todos los inscriptos (C7). Si falla, queda abierto con lo escrito. */
function EditorDeAlquiler({
  alquiler,
  guardando,
  errorDeGuardado,
  alGuardar,
  alCancelar,
}: {
  alquiler: number;
  guardando: boolean;
  errorDeGuardado: string | null;
  alGuardar: (monto: number) => void;
  alCancelar: () => void;
}) {
  const [texto, setTexto] = useState(String(alquiler));
  const [error, setError] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    entrada.current?.focus();
    entrada.current?.select();
  }, []);

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (guardando) return;
    const lectura = validarAlquiler(texto);
    if (lectura.monto === null) {
      setError(lectura.error);
      entrada.current?.focus();
      return;
    }
    setError(null);
    alGuardar(lectura.monto);
  }

  const mensaje = error ?? errorDeGuardado;
  return (
    <form onSubmit={enviar} noValidate aria-label="Editar el alquiler de la campaña" className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-chico text-tinta-2">
          Alquiler por colportor ($U)
          <input
            ref={entrada}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby="alquiler-ayuda"
            className="min-h-[34px] w-28 rounded-control border border-grafico-neutro bg-superficie px-2.5 font-mono text-cuerpo text-tinta focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none aria-[invalid=true]:border-peligro"
          />
        </label>
        <button type="submit" aria-disabled={guardando} className={cn(CLASE_BOTON, "border-marca bg-marca text-superficie")}>
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          aria-disabled={guardando}
          onClick={() => {
            if (!guardando) alCancelar();
          }}
          className={cn(CLASE_BOTON, "border-borde bg-superficie text-tinta-2")}
        >
          Cancelar
        </button>
      </div>
      <p id="alquiler-ayuda" className="text-mini text-tinta-suave">
        Cambia para todos los colportores de la campaña.
      </p>
      {mensaje && (
        <p role="alert" className="text-mini text-peligro">
          {mensaje}
        </p>
      )}
    </form>
  );
}

/** Título de la selección, cuántos colportores abarca, el alquiler de la campaña con «Editar» y el paso a validar tickets. */
export function EncabezadoDeCuentas({
  titulo,
  subtitulo,
  alquiler,
  editando,
  guardando,
  errorDeGuardado,
  alEditar,
  alGuardarAlquiler,
  alCancelarEdicion,
}: {
  titulo: string;
  subtitulo: string;
  alquiler: number;
  editando: boolean;
  guardando: boolean;
  errorDeGuardado: string | null;
  alEditar: () => void;
  alGuardarAlquiler: (monto: number) => void;
  alCancelarEdicion: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-col gap-[3px]">
        <h2 className="font-serif text-[22px] font-semibold [overflow-wrap:anywhere]">{titulo}</h2>
        <p className="text-chico text-tinta-suave">{subtitulo}</p>
      </div>
      <div className="flex flex-none flex-wrap items-center justify-end gap-2.5">
        {editando ? (
          <EditorDeAlquiler
            alquiler={alquiler}
            guardando={guardando}
            errorDeGuardado={errorDeGuardado}
            alGuardar={alGuardarAlquiler}
            alCancelar={alCancelarEdicion}
          />
        ) : (
          <>
            <span className="text-chico text-tinta-2">
              Alquiler de la campaña: <b className="font-mono font-medium">{formatMonto(alquiler)}</b> por colportor
            </span>
            <button
              type="button"
              data-foco="editar-alquiler"
              aria-disabled={guardando}
              onClick={() => {
                if (!guardando) alEditar();
              }}
              className={cn(CLASE_BOTON, "border-borde bg-superficie text-tinta-2")}
            >
              Editar
            </button>
          </>
        )}
        <AccionNoDisponible className="inline-flex min-h-8 items-center text-chico font-semibold whitespace-nowrap text-marca-media">
          Validar tickets →
        </AccionNoDisponible>
      </div>
    </div>
  );
}
