"use client";

import type { FeatureCollection, Point } from "geojson";
import type { Map as MapaMapLibre } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CasaDeCiudad } from "@/datos/equipo/zonas";
import { type CajaDelMapa, decidirAgrupado } from "@/features/equipo/zonas/casas/estados";

/** Una burbuja del agrupado, con cuántas casas junta. */
export interface GrupoEnPantalla {
  id: number;
  lon: number;
  lat: number;
  cantidad: number;
}

/** Lo mínimo que se usa del mapa de MapLibre (en las pruebas, un doble). */
type MapaConCaja = Pick<MapaMapLibre, "getBounds">;
type MapaConFuentes = Pick<MapaMapLibre, "querySourceFeatures">;

export const FUENTE_AGRUPADA = "casas-agrupadas";

const SIN_CASAS: CasaDeCiudad[] = [];

function comoGeojson(casas: readonly CasaDeCiudad[]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: casas.map((c) => ({
      type: "Feature",
      properties: { id: c.id, estado: c.estado },
      geometry: { type: "Point", coordinates: [c.lon, c.lat] },
    })),
  };
}

const VACIA: FeatureCollection<Point> = { type: "FeatureCollection", features: [] };

/**
 * Qué casas se dibujan y cómo (diseño 24P·04, regla R2 del 04/11): de a una mientras haya hasta 200 a la vista; con más, el
 * cluster de MapLibre las agrupa (HU-UBI-003, como en el celular). Lo que está a la vista se lee del mapa al cargar y al
 * terminar cada movimiento; las burbujas del agrupado, cuando el mapa queda quieto. Avisa a la vista si agrupó.
 */
export function useCasasEnMapa(casas: readonly CasaDeCiudad[] | undefined, onAgrupadas: ((agrupadas: boolean) => void) | undefined) {
  const todas = casas ?? SIN_CASAS;
  const [caja, setCaja] = useState<CajaDelMapa | null>(null);
  const [grupos, setGrupos] = useState<GrupoEnPantalla[]>([]);
  const { agrupar, visibles } = useMemo(() => decidirAgrupado(todas, caja), [todas, caja]);
  const geojson = useMemo(() => (agrupar ? comoGeojson(todas) : VACIA), [agrupar, todas]);

  // El aviso lo recibe una referencia: cambiar la función de la vista no vuelve a avisar.
  const aviso = useRef(onAgrupadas);
  useEffect(() => {
    aviso.current = onAgrupadas;
  });
  useEffect(() => {
    aviso.current?.(agrupar);
    return () => aviso.current?.(false);
  }, [agrupar]);

  const leerCaja = useCallback((e: { target: MapaConCaja }) => {
    const b = e.target.getBounds();
    setCaja({ oeste: b.getWest(), sur: b.getSouth(), este: b.getEast(), norte: b.getNorth() });
  }, []);

  const leerGrupos = useCallback(
    (e: { target: MapaConFuentes }) => {
      if (!agrupar) {
        setGrupos((antes) => (antes.length === 0 ? antes : []));
        return;
      }
      const porId = new Map<number, GrupoEnPantalla>();
      for (const f of e.target.querySourceFeatures(FUENTE_AGRUPADA, { filter: ["has", "point_count"] })) {
        const id = f.properties?.cluster_id;
        const cantidad = f.properties?.point_count;
        if (typeof id !== "number" || typeof cantidad !== "number" || f.geometry.type !== "Point") continue;
        porId.set(id, { id, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], cantidad });
      }
      const nuevos = [...porId.values()].sort((a, b) => a.id - b.id);
      // Mismo contenido, misma lista: si no, cada «idle» volvería a dibujar.
      setGrupos((antes) => (antes.length === nuevos.length && antes.every((g, i) => g.id === nuevos[i].id && g.cantidad === nuevos[i].cantidad) ? antes : nuevos));
    },
    [agrupar],
  );

  return { agrupar, visibles, geojson, grupos: agrupar ? grupos : [], leerCaja, leerGrupos };
}
