"use client";

import dynamic from "next/dynamic";

/**
 * El mapa (MapLibre GL con react-map-gl, ADR-015) solo se carga en el
 * navegador: necesita WebGL y pesa, así que no entra en el render del servidor.
 */
export const MapaZonas = dynamic(() => import("@/features/equipo/zonas/MapaZonasGl").then((m) => m.MapaZonasGl), {
  ssr: false,
  loading: () => (
    <div role="status" className="grid h-full place-items-center bg-superficie-mapa text-chico text-tinta-suave">
      Cargando el mapa…
    </div>
  ),
});
