"use client";

import type { ExpressionSpecification } from "maplibre-gl";
import { type KeyboardEvent, useMemo, useRef, useState } from "react";
import { Layer, Marker, Source } from "react-map-gl/maplibre";

import type { CasaDeCiudad, ZonaDeCiudad } from "@/datos/equipo/zonas";
import { ESTADOS_VISUALES, estadoVisual, textoDeTipo } from "@/features/equipo/zonas/casas/estados";
import { cn } from "@/lib/utils";
import { PuntoDeCasa } from "@/features/equipo/zonas/casas/PuntoDeCasa";
import { FUENTE_AGRUPADA, type useCasasEnMapa } from "@/features/equipo/zonas/casas/useCasasEnMapa";
import type { CasasEnMapa } from "@/features/equipo/zonas/tipos";

export const CAPA_DE_GRUPOS = "casas-agrupadas-grupo";

const porEstado = (valor: (e: (typeof ESTADOS_VISUALES)[number]) => string): ExpressionSpecification =>
  ["match", ["get", "estado"], ...ESTADOS_VISUALES.flatMap((e) => [e.clave, valor(e)]), "#6B7688"] as unknown as ExpressionSpecification;

/** Con las casas agrupadas, las que quedan sueltas van como puntos de su color (sin glifo: ya no caben); al acercar, vuelven los símbolos. */
const COLOR_DE_PUNTO = porEstado((e) => (e.borde ? "#FFFFFF" : e.color));
const BORDE_DE_PUNTO = porEstado((e) => (e.borde ? e.color : "#FFFFFF"));

function zonasDe(casa: CasaDeCiudad, zonas: readonly ZonaDeCiudad[]): string {
  const nombres = casa.zonaIds.map((id) => zonas.find((z) => z.id === id)?.nombre).filter((n): n is string => n !== undefined);
  if (nombres.length === 0) return "";
  return ` · ${nombres.length > 1 ? "Zonas" : "Zona"} ${nombres.join(" y ")}`;
}

/** Orden fijo para recorrer los puntos con el teclado: de norte a sur y, a igual latitud, de oeste a este. */
function enOrdenDeLectura(casas: readonly CasaDeCiudad[]): CasaDeCiudad[] {
  return [...casas].sort((a, b) => b.lat - a.lat || a.lon - b.lon);
}

interface Props {
  casas: CasasEnMapa;
  zonas: readonly ZonaDeCiudad[];
  /** Mientras se dibuja una zona los puntos se ven pero no se tocan: el clic del mapa es de la forma. */
  tocables: boolean;
  estado: Pick<ReturnType<typeof useCasasEnMapa>, "agrupar" | "visibles" | "geojson" | "grupos">;
}

/**
 * Las casas dentro del mapa de la vista 24 (diseño 24P): cada una un punto con su símbolo y su nombre de estado, la tarjeta de
 * la elegida (estado, tipo y zona; sin montos ni personas) y, con más de 200 a la vista, el cluster de MapLibre con la cantidad
 * de cada burbuja. Con teclado, los puntos son una sola parada de tabulación (tabindex móvil): flechas para recorrerlos en orden
 * de lectura, Enter o Espacio para abrir la tarjeta y Esc para cerrarla, con el foco en el mismo punto.
 */
export function CapaDeCasas({ casas, zonas, tocables, estado }: Props) {
  const { agrupar, visibles, geojson, grupos } = estado;
  const elegida = agrupar ? undefined : visibles.find((c) => c.id === casas.elegidaId);
  const ordenados = useMemo(() => enOrdenDeLectura(visibles), [visibles]);
  const botones = useRef(new Map<string, HTMLButtonElement>());
  const [activoElegido, setActivoElegido] = useState<string | null>(null);
  // El punto que recibe el Tab: el último en el que se estuvo si sigue a la vista; si no, la casa elegida o el primero.
  const activoId = [activoElegido, elegida?.id].find((id) => id !== undefined && id !== null && ordenados.some((c) => c.id === id)) ?? ordenados[0]?.id;

  function alTeclear(e: KeyboardEvent<HTMLButtonElement>, id: string) {
    const aqui = ordenados.findIndex((c) => c.id === id);
    const destino =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? aqui + 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? aqui - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? ordenados.length - 1
              : null;
    if (destino === null) return;
    // Las flechas son de los puntos: sin esto el mapa también se desplazaría.
    e.preventDefault();
    e.stopPropagation();
    const siguiente = ordenados[Math.min(Math.max(destino, 0), ordenados.length - 1)];
    setActivoElegido(siguiente.id);
    botones.current.get(siguiente.id)?.focus();
  }
  return (
    <>
      <Source id={FUENTE_AGRUPADA} type="geojson" data={geojson} cluster clusterRadius={44} clusterMaxZoom={17}>
        <Layer
          id={CAPA_DE_GRUPOS}
          type="circle"
          filter={["has", "point_count"]}
          paint={{
            "circle-color": "#0E1A2B",
            "circle-radius": ["step", ["get", "point_count"], 16, 10, 18, 50, 22],
            "circle-stroke-color": "#FFFFFF",
            "circle-stroke-width": 2,
          }}
        />
        <Layer
          id="casas-agrupadas-suelta"
          type="circle"
          filter={["!", ["has", "point_count"]]}
          paint={{ "circle-color": COLOR_DE_PUNTO, "circle-radius": 6, "circle-stroke-color": BORDE_DE_PUNTO, "circle-stroke-width": 1.5 }}
        />
      </Source>

      {agrupar
        ? grupos.map((g) => (
            <Marker key={g.id} longitude={g.lon} latitude={g.lat} anchor="center" style={{ pointerEvents: "none" }}>
              <span role="img" aria-label={`${g.cantidad} casas`} className="grid size-9 place-items-center text-nav font-bold text-superficie">
                {g.cantidad}
              </span>
            </Marker>
          ))
        : ordenados.map((c) => (
            <Marker key={c.id} longitude={c.lon} latitude={c.lat} anchor="center">
              <button
                type="button"
                ref={(el) => {
                  if (el) botones.current.set(c.id, el);
                  else botones.current.delete(c.id);
                }}
                // Al dibujar, el punto no es un botón desactivado (no dejaría pasar el clic al mapa): es transparente al puntero y
                // sale del orden de tabulación; el clic cae en el mapa y pone el vértice o el centro encima de la casa.
                tabIndex={tocables && c.id === activoId ? 0 : -1}
                aria-disabled={!tocables || undefined}
                data-punto-de-casa=""
                aria-label={`${estadoVisual(c.estado).nombre}, ${textoDeTipo(c.tipo).toLowerCase()}`}
                aria-pressed={c.id === casas.elegidaId}
                onFocus={() => setActivoElegido(c.id)}
                onKeyDown={(e) => tocables && alTeclear(e, c.id)}
                onClick={(e) => {
                  if (!tocables) return;
                  e.stopPropagation();
                  casas.onElegir(c.id === casas.elegidaId ? null : c.id);
                }}
                className={cn("block rounded-full p-0", tocables ? "cursor-pointer" : "pointer-events-none")}
              >
                <PuntoDeCasa estado={c.estado} lado={16} sombra />
              </button>
            </Marker>
          ))}

      {elegida ? (
        <Marker longitude={elegida.lon} latitude={elegida.lat} anchor="bottom-left" offset={[10, -10]} style={{ zIndex: 5 }}>
          <div
            role="group"
            aria-label="Casa elegida"
            // Un clic en la tarjeta no es un clic en el mapa: no la cierra ni elige la zona que queda debajo.
            onClick={(e) => e.stopPropagation()}
            className="flex w-[250px] flex-col gap-1.5 rounded-lg border border-grafico-neutro bg-superficie px-3.5 py-3 shadow-lg"
          >
            <div className="flex items-center gap-2">
              <PuntoDeCasa estado={elegida.estado} lado={18} />
              <span className="text-nav font-semibold text-tinta">{estadoVisual(elegida.estado).nombre}</span>
            </div>
            <span className="text-cuerpo wrap-anywhere text-tinta-2">
              {textoDeTipo(elegida.tipo)}
              {zonasDe(elegida, zonas)}
            </span>
          </div>
        </Marker>
      ) : null}
    </>
  );
}
