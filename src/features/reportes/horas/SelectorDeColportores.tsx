"use client";

import { useId, useRef, useState } from "react";
import type { FocusEvent as EventoFoco, KeyboardEvent as EventoTeclado } from "react";

import { cn } from "@/lib/utils";

export interface OpcionDeColportor {
  id: string;
  nombre: string;
  ciudad: string;
}

export const TEXTO_UNO_AL_MENOS = "Tiene que quedar al menos un colportor. Para ver a todos, tocá «Todos».";
export const TEXTO_SIN_COINCIDENCIAS = "Ningún colportor se llama así. Probá con otra parte del nombre.";

/** Sin tildes ni mayúsculas, para buscar «nunez» y encontrar «Núñez». */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** «Todos (12)» o «3 de 12». */
export function resumenDeLaEleccion(elegidos: number, total: number): string {
  return elegidos === 0 || elegidos >= total ? `Todos (${total})` : `${elegidos} de ${total}`;
}

/**
 * Elegir uno o varios colportores del ámbito que se está mirando (issue #107, HU-REP-001: «colportor (multi-select)»).
 * `elegidos` vacío quiere decir todos: con todos marcados no hay filtro. No se puede dejar sin ninguno (sería «todos»
 * sin que se note): la última casilla marcada no se desmarca y se dice por qué. Con teclado: el botón abre y cierra,
 * Esc cierra y devuelve el foco al botón, y salir del panel con Tab lo cierra. Hay un buscador por nombre para las
 * listas largas.
 */
export function SelectorDeColportores({
  opciones,
  elegidos,
  alCambiar,
}: {
  opciones: OpcionDeColportor[];
  /** Los ids elegidos; vacío = todos. */
  elegidos: readonly string[];
  alCambiar: (ids: string[]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const idDelPanel = useId();

  const total = opciones.length;
  const marcados = new Set(elegidos.length === 0 ? opciones.map((o) => o.id) : elegidos);

  const cerrar = (devolverFoco: boolean) => {
    setAbierto(false);
    setAviso(null);
    setBusqueda("");
    if (devolverFoco) boton.current?.focus();
  };

  const alternar = (id: string) => {
    const siguiente = marcados.has(id) ? [...marcados].filter((x) => x !== id) : [...marcados, id];
    if (siguiente.length === 0) {
      setAviso(TEXTO_UNO_AL_MENOS);
      return;
    }
    setAviso(null);
    alCambiar(siguiente.length >= total ? [] : siguiente);
  };

  const alSalirDelFoco = (evento: EventoFoco<HTMLDivElement>) => {
    if (!abierto) return;
    const destino = evento.relatedTarget;
    if (destino instanceof Node && raiz.current?.contains(destino)) return;
    cerrar(false);
  };

  const alTeclear = (evento: EventoTeclado<HTMLDivElement>) => {
    if (evento.key === "Escape" && abierto) {
      evento.stopPropagation();
      cerrar(true);
    }
  };

  const buscado = normalizar(busqueda.trim());
  const visibles = buscado ? opciones.filter((o) => normalizar(o.nombre).includes(buscado)) : opciones;
  const ciudades = [...new Set(visibles.map((o) => o.ciudad))];
  const cuantosMarcados = marcados.size;

  return (
    <div ref={raiz} className="relative" onBlur={alSalirDelFoco} onKeyDown={alTeclear}>
      <button
        ref={boton}
        type="button"
        aria-expanded={abierto}
        aria-controls={idDelPanel}
        onClick={() => (abierto ? cerrar(false) : setAbierto(true))}
        className="inline-flex min-h-8 items-center gap-2 rounded-control border border-borde bg-superficie px-3 text-chico font-semibold text-tinta-2 hover:bg-marca-clara focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
      >
        <span>Colportores:</span>{" "}
        <span className="font-mono text-tinta">{resumenDeLaEleccion(elegidos.length, total)}</span>
        <span aria-hidden="true">▾</span>
      </button>

      {abierto && (
        <div
          id={idDelPanel}
          role="group"
          aria-label="Elegir colportores"
          className="absolute left-0 z-20 mt-1.5 flex w-80 max-w-[80vw] flex-col gap-2 rounded-tarjeta border border-borde bg-superficie p-3 shadow-lg"
        >
          <div className="flex items-end gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-etiqueta font-semibold tracking-etiqueta text-tinta-suave">BUSCAR COLPORTOR</span>
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="min-h-8 min-w-0 rounded-control border border-grafico-neutro bg-superficie px-2.5 text-chico text-tinta outline-none focus-visible:ring-2 focus-visible:ring-acento"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setAviso(null);
                alCambiar([]);
              }}
              className="inline-flex min-h-8 items-center rounded-control border border-grafico-neutro px-3 text-chico font-semibold text-marca hover:bg-marca-clara focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
            >
              Todos
            </button>
          </div>

          <p aria-live="polite" className={cn("text-mini", aviso ? "font-semibold text-peligro" : "text-tinta-suave")}>
            {aviso ?? `${cuantosMarcados} de ${total} elegidos`}
          </p>

          <div className="flex max-h-72 flex-col gap-2 overflow-auto">
            {visibles.length === 0 && <p className="py-2 text-chico text-tinta-suave">{TEXTO_SIN_COINCIDENCIAS}</p>}
            {ciudades.map((ciudad) => (
              <fieldset key={ciudad} className="flex min-w-0 flex-col">
                <legend className="px-0 py-1 text-etiqueta font-semibold tracking-etiqueta text-marca">{ciudad}</legend>
                {visibles
                  .filter((o) => o.ciudad === ciudad)
                  .map((o) => (
                    <label key={o.id} className="flex min-h-8 min-w-0 cursor-pointer items-center gap-2 rounded-control px-1 text-chico text-tinta hover:bg-marca-clara/50">
                      <input type="checkbox" checked={marcados.has(o.id)} onChange={() => alternar(o.id)} className="size-4 flex-none accent-marca" />
                      <span className="min-w-0 wrap-anywhere">{o.nombre}</span>
                    </label>
                  ))}
              </fieldset>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
