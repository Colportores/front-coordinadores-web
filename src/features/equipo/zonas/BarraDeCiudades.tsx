"use client";

import { useEffect, useRef, useState } from "react";

import { BuscadorDeCiudades, SinCoincidenciasDeCiudades } from "@/components/BuscadorDeCiudades";
import type { CiudadDeCampania } from "@/datos/equipo/zonas";
import {
  CIUDADES_PARA_BUSCAR,
  coincidenciasPorNombre,
  ETIQUETA_BUSCAR_CIUDAD,
  hayBuscadorDeCiudades,
  ordenarPorNombre,
  textoSinCoincidencias,
} from "@/lib/buscar-ciudades";
import { cn } from "@/lib/utils";

export { CIUDADES_PARA_BUSCAR, ETIQUETA_BUSCAR_CIUDAD, textoSinCoincidencias };

function textoCantidadZonas(cantidad: number): string {
  if (cantidad === 0) return "sin zonas";
  return cantidad === 1 ? "1 zona" : `${cantidad} zonas`;
}

/** Las ciudades A-Z. Solo se usa para ordenar los resultados de una búsqueda: sin texto la barra respeta el orden de la fuente (P1 de la QA de #186, 18/11). */
export function ordenarCiudades(ciudades: readonly CiudadDeCampania[]): CiudadDeCampania[] {
  return ordenarPorNombre(ciudades, (c) => c.id);
}

/** La búsqueda blanda compartida con las columnas de las demás pestañas (#195): `@/lib/buscar-ciudades`. */
export function ciudadesQueCoinciden(ciudades: readonly CiudadDeCampania[], texto: string): CiudadDeCampania[] {
  return coincidenciasPorNombre(ciudades, texto, (c) => c.id);
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
  const conBuscador = hayBuscadorDeCiudades(ciudades.length);
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
    // Sin buscador el nav toma su ancho natural: «+ Agregar ciudad» queda pegado a la última ciudad, como en el canvas 24. Con
    // buscador ocupa la fila, para que el botón no salte de lugar mientras lo escrito achica la lista.
    <nav aria-label="Ciudades de la campaña" className={cn("flex min-w-0 flex-col gap-2", conBuscador && "flex-1")}>
      {conBuscador ? (
        <BuscadorDeCiudades
          texto={texto}
          alCambiar={setTexto}
          total={ciudades.length}
          coinciden={coinciden.length}
          buscando={buscando}
          alElegirPrimera={() => {
            if (!deshabilitado && coinciden[0]) onElegir(coinciden[0].id);
          }}
          className="max-w-[320px]"
        />
      ) : null}

      {buscando && coinciden.length === 0 ? (
        <SinCoincidenciasDeCiudades texto={texto} />
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
