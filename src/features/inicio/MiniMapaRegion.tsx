import type { PuntoMapaRegion } from "@/datos/inicio";

/** Colores de los marcadores de zona, en el orden en que llegan los puntos. */
const COLORES_PUNTO = ["bg-marca", "bg-marca-media", "bg-acento", "bg-peligro"] as const;

/**
 * Mini mapa de la región: placeholder (sin librería de mapas, como en el diseño).
 * Solo marca la posición aproximada de cada zona.
 */
export function MiniMapaRegion({ puntos }: { puntos: PuntoMapaRegion[] }) {
  return (
    <div>
      <div className="mb-2 text-etiqueta font-semibold tracking-etiqueta text-tinta-suave">MINI MAPA REGIÓN</div>
      <div
        role="img"
        aria-label="Mapa de la región con la ubicación aproximada de cada zona (placeholder)"
        className="relative h-[130px] rounded-md bg-superficie-mapa"
      >
        <span className="absolute inset-0 grid place-items-center font-mono text-mini text-tinta-tenue">
          [ mapa OSM · zonas región ]
        </span>
        {puntos.map((punto, indice) => (
          <span
            key={punto.id}
            title={punto.zona}
            className={`absolute size-[10px] rounded-full border-2 border-superficie ${COLORES_PUNTO[indice % COLORES_PUNTO.length]}`}
            style={{ left: `${punto.left}%`, top: `${punto.top}%` }}
          />
        ))}
      </div>
    </div>
  );
}
