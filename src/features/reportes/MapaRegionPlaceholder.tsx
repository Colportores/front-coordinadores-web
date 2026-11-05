import type { MarcadorMapaRegion } from "@/datos/reportes/contrato";

/**
 * Tarjeta "Mapa de la región": placeholder, como en el diseño. Elegir la
 * librería de mapas la decide Cristian (HU-REP-004, bloqueada hasta V2).
 */
export function MapaRegionPlaceholder({ region, marcadores }: { region: string; marcadores: MarcadorMapaRegion[] }) {
  return (
    <div className="overflow-hidden rounded-tarjeta border border-borde bg-superficie">
      <div className="flex items-baseline justify-between px-4 pt-3.5 pb-2.5">
        <span className="font-serif text-titulo font-semibold text-tinta">Mapa de la región</span>
        <span className="text-mini text-tinta-tenue">sin PII</span>
      </div>
      <div className="relative h-[200px] bg-superficie-mapa bg-[repeating-linear-gradient(45deg,color-mix(in_srgb,var(--tinta)_3.5%,transparent)_0_10px,transparent_10px_26px)]">
        <span className="absolute inset-0 grid place-items-center font-mono text-mini text-tinta-tenue">
          [ mapa OSM · {region} ]
        </span>
        {marcadores.map((m) => (
          <div
            key={m.id}
            className="absolute grid size-[30px] place-items-center rounded-full border-[3px] border-superficie bg-marca-media text-mini font-semibold text-superficie shadow-md"
            style={{ left: `${m.left}%`, top: `${m.top}%` }}
          >
            {m.cantidad}
          </div>
        ))}
      </div>
    </div>
  );
}
