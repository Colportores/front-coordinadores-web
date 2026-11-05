"use client";

import { useId, useRef, useState } from "react";

import {
  contarPorEstado,
  DESCRIPCION_ESTADO,
  ETIQUETA_ESTADO,
  ETIQUETA_SCHEMA,
  HISTORIAS,
  ORDEN_ESTADOS,
  type RegistroHu,
} from "@/dev/estado-hu";
import { CLASES_ESTADO, CLASES_SCHEMA } from "@/dev/estilos";
import { useModoDev } from "@/dev/ProveedorModoDev";
import { cn } from "@/lib/utils";
import { PESTANAS } from "@/shell/pestanas";

function FilaHu({ registro }: { registro: RegistroHu }) {
  const faltantes = registro.tablas.filter((t) => !t.existe);
  return (
    <li className="flex flex-col gap-1 border-t border-borde-suave py-2 first:border-t-0">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-mini font-medium text-tinta-2">{registro.id}</span>
        <span
          className={cn(
            "rounded-pastilla px-2 py-px text-etiqueta font-semibold",
            CLASES_ESTADO[registro.estado].pastilla,
          )}
        >
          {ETIQUETA_ESTADO[registro.estado]}
        </span>
      </div>
      <span className="text-chico text-tinta">{registro.titulo}</span>
      <span className="text-mini text-tinta-suave">
        Conexión: {registro.sprintConexion} · Schema en back:{" "}
        <b className={cn("font-semibold", CLASES_SCHEMA[registro.schemaEnBack])}>
          {ETIQUETA_SCHEMA[registro.schemaEnBack]}
        </b>
      </span>
      <span className="font-mono text-etiqueta text-tinta-suave">
        {registro.tablas.map((t, i) => (
          <span key={t.nombre}>
            {i > 0 && ", "}
            <span className={t.existe ? undefined : "text-peligro line-through"}>{t.nombre}</span>
          </span>
        ))}
        {faltantes.length > 0 && <span className="sr-only"> (tachadas: todavía sin migración)</span>}
      </span>
      {registro.motivo && <span className="text-mini text-peligro">{registro.motivo}</span>}
    </li>
  );
}

/** Botón flotante + panel con el estado de todas las HU del panel. Solo en modo dev. */
export function PanelEstadoHu() {
  const { activo, chipsVisibles, cambiarChipsVisibles } = useModoDev();
  const [abierto, setAbierto] = useState(false);
  const botonRef = useRef<HTMLButtonElement>(null);
  const idPanel = useId();
  const idInterruptor = useId();

  if (!activo) return null;

  const conteo = contarPorEstado();

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-2">
      {abierto && (
        <section
          id={idPanel}
          aria-label="Estado de HU"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setAbierto(false);
              // El panel desaparece: el foco vuelve al botón que lo abrió.
              botonRef.current?.focus();
            }
          }}
          className="flex max-h-[70vh] w-[380px] flex-col overflow-hidden rounded-tarjeta border border-borde bg-superficie shadow-lg"
        >
          <header className="flex flex-col gap-2 border-b border-borde px-4 py-3">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-titulo font-semibold text-marca">Estado de HU</h2>
              <span className="text-etiqueta font-semibold tracking-etiqueta text-tinta-suave">MODO DEV</span>
            </div>
            <ul className="grid grid-cols-4 gap-1.5" aria-label="Historias por estado">
              {ORDEN_ESTADOS.map((estado) => (
                <li
                  key={estado}
                  title={DESCRIPCION_ESTADO[estado]}
                  className={cn("flex flex-col rounded-md px-2 py-1", CLASES_ESTADO[estado].pastilla)}
                >
                  <span className="font-serif text-titulo leading-5 font-semibold">{conteo[estado]}</span>
                  <span className="text-etiqueta font-semibold">{ETIQUETA_ESTADO[estado]}</span>
                </li>
              ))}
            </ul>
            <label htmlFor={idInterruptor} className="flex items-center gap-2 text-chico text-tinta-2">
              <input
                id={idInterruptor}
                type="checkbox"
                checked={chipsVisibles}
                onChange={(e) => cambiarChipsVisibles(e.target.checked)}
                className="size-3.5 accent-marca"
              />
              Mostrar chips de HU en las pantallas
            </label>
          </header>
          <div className="overflow-y-auto px-4 py-2">
            {PESTANAS.map((pestana) => {
              const historias = HISTORIAS.filter((h) => h.pestana === pestana.id);
              return (
                <section key={pestana.id} aria-label={`HU de ${pestana.etiqueta}`} className="py-1.5">
                  <h3 className="text-etiqueta font-semibold tracking-etiqueta text-tinta-suave uppercase">
                    {pestana.etiqueta} · {historias.length} HU
                  </h3>
                  <ul>
                    {historias.map((h) => (
                      <FilaHu key={h.id} registro={h} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
          <footer className="flex flex-col gap-1 border-t border-borde bg-fondo px-4 py-2.5 text-etiqueta text-tinta-suave">
            {ORDEN_ESTADOS.map((estado) => (
              <span key={estado} className="flex items-center gap-1.5">
                <span aria-hidden className={cn("size-1.5 rounded-pastilla", CLASES_ESTADO[estado].punto)} />
                <span>
                  <b className="font-semibold text-tinta-2">{ETIQUETA_ESTADO[estado]}</b>: {DESCRIPCION_ESTADO[estado]}
                </span>
              </span>
            ))}
            <span>
              <b className="font-semibold text-tinta-2">Schema en back</b>: si las tablas que la HU necesita ya
              existen en las migraciones de backend-supabase (tachadas: faltan).
            </span>
          </footer>
        </section>
      )}
      <button
        ref={botonRef}
        type="button"
        aria-expanded={abierto}
        aria-controls={abierto ? idPanel : undefined}
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center gap-2 rounded-pastilla border border-borde bg-superficie px-3.5 py-2 text-chico font-semibold text-marca shadow-md hover:bg-marca-clara focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none"
      >
        <span aria-hidden className="size-2 rounded-pastilla bg-alerta-punto" />
        Estado de HU
        <span className="font-mono text-etiqueta text-tinta-suave">
          {conteo["validada-qa"] + conteo.implementada}/{HISTORIAS.length}
        </span>
      </button>
    </div>
  );
}
