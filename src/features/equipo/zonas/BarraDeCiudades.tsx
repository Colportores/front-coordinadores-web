"use client";

import { useEffect, useRef, useState } from "react";

import { normalizarBusqueda } from "@/datos/equipo/busqueda";
import type { CiudadDeCampania } from "@/datos/equipo/zonas";
import { cn } from "@/lib/utils";

/**
 * Desde cuántas ciudades la barra suma el campo para buscar entre ellas (#186). Hasta ahí se ven todas de un vistazo y el campo
 * sobra; con más, ubicar una a ojo deja de ser razonable (los evaluadores preguntaron por 150).
 */
export const CIUDADES_PARA_BUSCAR = 8;

export const ETIQUETA_BUSCAR_CIUDAD = "Buscar entre las ciudades de la campaña";

/** Lo que se anuncia (y se ve) cuando lo escrito no coincide con ninguna ciudad: dice qué hacer. */
export function textoSinCoincidencias(texto: string): string {
  return `Ninguna ciudad de la campaña coincide con «${texto.trim()}». Revisá lo escrito o borralo para ver todas.`;
}

function textoCantidadZonas(cantidad: number): string {
  if (cantidad === 0) return "sin zonas";
  return cantidad === 1 ? "1 zona" : `${cantidad} zonas`;
}

/** A-Z en castellano sin mirar tildes ni mayúsculas; mismo nombre, por id, para que el orden no salte entre cargas. */
function compararCiudades(a: CiudadDeCampania, b: CiudadDeCampania): number {
  return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Las ciudades en el orden de la barra: A-Z (decisión P4 de #186, 18/11), no el que manda la fuente. */
export function ordenarCiudades(ciudades: readonly CiudadDeCampania[]): CiudadDeCampania[] {
  return [...ciudades].sort(compararCiudades);
}

/**
 * Búsqueda blanda: sin distinguir mayúsculas ni tildes, con coincidencia parcial en cualquier parte del nombre. Primero las que
 * empiezan con lo escrito y después las que solo lo contienen, cada grupo A-Z (decisión P4 de #186). Vacío: todas, A-Z.
 */
export function ciudadesQueCoinciden(ciudades: readonly CiudadDeCampania[], texto: string): CiudadDeCampania[] {
  const ordenadas = ordenarCiudades(ciudades);
  const buscado = normalizarBusqueda(texto);
  if (buscado === "") return ordenadas;
  const empiezan: CiudadDeCampania[] = [];
  const contienen: CiudadDeCampania[] = [];
  for (const c of ordenadas) {
    const nombre = normalizarBusqueda(c.nombre);
    if (nombre.startsWith(buscado)) empiezan.push(c);
    else if (nombre.includes(buscado)) contienen.push(c);
  }
  return [...empiezan, ...contienen];
}

interface Props {
  ciudades: readonly CiudadDeCampania[];
  /** La ciudad elegida: siempre se ve, también cuando lo escrito no coincide con ella. */
  ciudadId: string;
  /** Se está guardando algo o agregando una ciudad: la vista no cambia de lugar. */
  deshabilitado: boolean;
  onElegir: (id: string) => void;
}

/**
 * «Ciudades de la campaña» (vista 24): un botón por ciudad. Con muchas ciudades suma un campo para buscar entre ellas (búsqueda
 * blanda) y la fila de botones queda en un alto fijo con scroll, para no empujar el mapa y la lista de zonas (#186).
 */
export function BarraDeCiudades({ ciudades, ciudadId, deshabilitado, onElegir }: Props) {
  const [texto, setTexto] = useState("");
  const botones = useRef<HTMLDivElement>(null);
  const conBuscador = ciudades.length > CIUDADES_PARA_BUSCAR;
  const buscando = conBuscador && texto.trim() !== "";

  const coinciden = ciudadesQueCoinciden(ciudades, buscando ? texto : "");
  // Buscando, la ciudad elegida va primera aunque no coincida: no se pierde de vista ni el foco que le pasa «+ Agregar ciudad».
  const elegida = ciudades.find((c) => c.id === ciudadId);
  const visibles = buscando && elegida ? [elegida, ...coinciden.filter((c) => c.id !== elegida.id)] : coinciden;

  // Con el alto fijo, la elegida puede quedar fuera de lo que se ve (p. ej. recién agregada al final): se trae a la vista.
  useEffect(() => {
    botones.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [ciudadId, ciudades.length]);

  return (
    <nav aria-label="Ciudades de la campaña" className="flex min-w-0 flex-1 flex-col gap-2">
      {conBuscador ? (
        <div className="flex flex-col gap-1">
          <input
            type="search"
            value={texto}
            aria-label={ETIQUETA_BUSCAR_CIUDAD}
            placeholder="Buscar ciudad…"
            autoComplete="off"
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && texto !== "") {
                // Ese Esc borra lo escrito y nada más (no cierra la tarjeta de una casa abierta en el mapa).
                e.stopPropagation();
                setTexto("");
              } else if (e.key === "Enter" && !deshabilitado) {
                // Con lo escrito a la vista, Enter elige la primera ciudad que coincide: se llega sin tocar el mouse.
                const primera = coinciden[0];
                if (primera && buscando) onElegir(primera.id);
              }
            }}
            className="min-h-9 max-w-[320px] rounded-control border border-grafico-neutro bg-superficie px-3 text-nav text-tinta outline-none focus-visible:ring-2 focus-visible:ring-acento"
          />
          {/* Un solo `role=status` por vista: el recuento se anuncia con `aria-live`. */}
          <p aria-live="polite" className="text-mini text-tinta-suave">
            {buscando ? `${coinciden.length} de ${ciudades.length} ciudades` : `${ciudades.length} ciudades`}
          </p>
        </div>
      ) : null}

      {buscando && coinciden.length === 0 ? (
        <p className="rounded-control bg-fondo px-3 py-2 text-cuerpo break-words wrap-anywhere text-tinta-suave">{textoSinCoincidencias(texto)}</p>
      ) : null}

      <div
        ref={botones}
        data-testid="botones-de-ciudades"
        className={cn("flex flex-wrap gap-2", conBuscador && "max-h-[132px] overflow-y-auto pr-1")}
      >
        {visibles.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-current={c.id === ciudadId ? "true" : undefined}
            data-foco={c.id === ciudadId ? "ciudad-elegida" : undefined}
            disabled={deshabilitado}
            onClick={() => onElegir(c.id)}
            className={cn(
              "flex max-w-full cursor-pointer flex-col items-start rounded-control border px-3.5 py-1.5 text-left focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60",
              c.id === ciudadId ? "border-marca bg-marca-clara text-marca" : "border-borde bg-superficie text-tinta-2 hover:bg-fondo",
            )}
          >
            <span className="max-w-full text-nav font-semibold break-words wrap-anywhere">{c.nombre}</span>
            <span className="text-mini text-tinta-suave">{textoCantidadZonas(c.zonas.length)}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
