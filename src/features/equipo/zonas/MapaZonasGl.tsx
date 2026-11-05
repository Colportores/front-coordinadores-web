"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type { Feature, FeatureCollection, LineString, Polygon } from "geojson";
import { setWorkerUrl, type StyleSpecification } from "maplibre-gl";
import { useEffect, useMemo, useState } from "react";
import Map, {
  AttributionControl,
  Layer,
  Marker,
  NavigationControl,
  Source,
  type ErrorEvent,
  type MapMouseEvent,
} from "react-map-gl/maplibre";

import type { Punto, ZonaDeCiudad } from "@/datos/equipo/zonas";
import { distanciaM, puntoADistancia, vertices } from "@/datos/equipo/zonas/geometria";
import { CAPA_DE_GRUPOS, CapaDeCasas } from "@/features/equipo/zonas/casas/CapaDeCasas";
import { useCasasEnMapa } from "@/features/equipo/zonas/casas/useCasasEnMapa";
import { AvisoDelMapaBase, type AvisoBase } from "@/features/equipo/zonas/mapa-base/AvisoDelMapaBase";
import { FUENTE_DE_TILES } from "@/features/equipo/zonas/mapa-base/catalogo";
import { olvidarArchivosPmtiles, registrarPmtiles } from "@/features/equipo/zonas/mapa-base/pmtiles";
import { useMapaBase } from "@/features/equipo/zonas/mapa-base/useMapaBase";
import type { PropsMapaZonas } from "@/features/equipo/zonas/tipos";

// Bajo Turbopack MapLibre no deduce la URL de su worker: se sirve desde public/maplibre (scripts/copiar-worker-maplibre.mjs).
// El sitio de prueba (GitHub Pages) cuelga de un subdirectorio: NEXT_PUBLIC_BASE_PATH lo trae next.config.ts.
setWorkerUrl(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/maplibre/maplibre-gl-worker.mjs`);
// Los tiles de las calles son archivos PMTiles del bucket de mapas (ADR-011): `pmtiles://<url>` en el estilo.
registrarPmtiles();

/** Cuánto se espera a que el mapa termine de cargar antes de avisar que algo lo está frenando (el worker, la red). */
export const ESPERA_DEL_MAPA_MS = 20_000;

const RADIO_MIN_M = 1;
const RADIO_MAX_M = 3000;

/** Color de un token de `globals.css`: MapLibre necesita el valor, no la clase de Tailwind. */
function token(nombre: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
}

const coordenadas = (puntos: Punto[]) => puntos.map((p): [number, number] => [p.lon, p.lat]);

function linea(puntos: Punto[]): Feature<LineString> {
  return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coordenadas(puntos) } };
}

function coleccion(features: Feature[]): FeatureCollection {
  return { type: "FeatureCollection", features };
}

function centroide(zona: ZonaDeCiudad): Punto {
  const vs = vertices(zona.poligonoGeojson);
  return {
    lon: vs.reduce((suma, v) => suma + v.lon, 0) / vs.length,
    lat: vs.reduce((suma, v) => suma + v.lat, 0) / vs.length,
  };
}

const punto = (e: MapMouseEvent): Punto => ({ lon: e.lngLat.lng, lat: e.lngLat.lat });

/** Lo que se cierra solo con Esc: si el foco está adentro, ese Esc no es de la tarjeta de la casa. */
const DE_OTRA_COSA = '[role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"], [aria-modal="true"], [aria-expanded="true"]';

/**
 * Mapa de la vista 24. Con `dibujo` dibuja la forma en curso; sin él, el clic elige zonas.
 * Base: con Supabase, el estilo y el PMTiles de la ciudad del bucket `mapas` (ADR-011); sin él (sitio de prueba), o si la
 * ciudad no tiene mapa publicado o el bucket no responde, un fondo liso con las zonas y, en los datos simulados, sus calles.
 * Si el navegador no puede dibujar o el mapa no termina de cargar, lo dice en vez de dejar un recuadro vacío.
 */
export function MapaZonasGl({
  ciudad,
  zonas,
  zonaElegidaId,
  dibujo,
  casas,
  onZonaClick,
  onMapaClick,
  onMapaMove,
  onRadio,
}: PropsMapaZonas) {
  const { base, reintentar } = useMapaBase(ciudad.catalogoId);
  // Cada vez que se rearma el mapa (otra ciudad, otro fondo, «Reintentar») es otro `Map`, con sus propios avisos.
  const [reinicio, setReinicio] = useState(0);
  const claveDelMapa = `${ciudad.id}:${base.fase === "listo" ? "bucket" : "liso"}:${reinicio}`;
  const [sinWebgl, setSinWebgl] = useState<string | null>(null);
  const [sinTiles, setSinTiles] = useState<string | null>(null);
  const [cargado, setCargado] = useState<string | null>(null);
  const [lento, setLento] = useState<string | null>(null);
  const esperando = base.fase !== "cargando";
  // El mapa que no llega a `load` (el worker no se sirvió, los tiles no bajan) no avisa nada por sí solo.
  useEffect(() => {
    if (!esperando) return;
    const plazo = setTimeout(() => setLento(claveDelMapa), ESPERA_DEL_MAPA_MS);
    return () => clearTimeout(plazo);
  }, [esperando, claveDelMapa]);

  // vis.gl compara `mapStyle` por referencia: un objeto nuevo en cada render dispararía `setStyle` en cada clic o movimiento.
  const colores = useMemo(
    () => ({
      fondo: token("--superficie-suave"),
      calle: token("--superficie"),
      trazoDibujo: token("--marca-media"),
      conflicto: token("--peligro"),
    }),
    [],
  );
  const estilo = useMemo<StyleSpecification>(
    () => ({
      version: 8,
      sources: {},
      layers: [{ id: "fondo", type: "background", paint: { "background-color": colores.fondo } }],
    }),
    [colores],
  );

  // Cada capa recibe el mismo objeto mientras sus datos no cambian: MapLibre no recalcula lo que no se movió.
  const calles = ciudad.calles;
  const callesGeojson = useMemo(() => coleccion((calles ?? []).map((c) => linea(c.trazo))), [calles]);
  const zonasGeojson = useMemo(
    () =>
      coleccion(
        zonas.map(
          (z): Feature<Polygon> => ({
            type: "Feature",
            properties: { id: z.id, color: z.color, elegida: z.id === zonaElegidaId },
            geometry: z.poligonoGeojson,
          }),
        ),
      ),
    [zonas, zonaElegidaId],
  );
  const poligono = dibujo?.poligono ?? null;
  const poligonoGeojson = useMemo(
    () => coleccion(poligono ? [{ type: "Feature", properties: {}, geometry: poligono }] : []),
    [poligono],
  );
  const lineaDibujo = dibujo?.linea ?? null;
  const caminoGeojson = useMemo(
    () => coleccion(lineaDibujo && lineaDibujo.length > 1 ? [linea(lineaDibujo)] : []),
    [lineaDibujo],
  );
  const tramoConflicto = dibujo?.conflicto ?? null;
  const conflictoGeojson = useMemo(
    () => coleccion(tramoConflicto && tramoConflicto.length > 1 ? [linea(tramoConflicto)] : []),
    [tramoConflicto],
  );

  const casasEnMapa = useCasasEnMapa(casas?.casas, casas?.onAgrupadas);
  const casaElegida = casas?.elegidaId ?? null;
  const cerrarTarjeta = casas?.onElegir;
  // Esc cierra la tarjeta de la casa elegida, salvo que ese Esc sea de otra cosa (un diálogo, un menú o una lista abierta).
  useEffect(() => {
    if (casaElegida === null || !cerrarTarjeta) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (e.target instanceof Element && e.target.closest(DE_OTRA_COSA)) return;
      cerrarTarjeta(null);
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [casaElegida, cerrarTarjeta]);

  function alFallar(e: ErrorEvent) {
    if (/webgl/i.test(e.error?.message ?? "")) setSinWebgl(claveDelMapa);
    // Un error de la fuente de tiles (el archivo no está, la red cayó): sin calles, pero las zonas siguen.
    else if ((e as { sourceId?: string }).sourceId?.startsWith(FUENTE_DE_TILES)) setSinTiles(claveDelMapa);
  }

  function reintentarMapa() {
    // El protocolo de PMTiles guarda también los pedidos que fallaron: sin esto, el reintento no vuelve a pedir el archivo.
    olvidarArchivosPmtiles();
    setReinicio((n) => n + 1);
    reintentar();
  }

  function alCargar(e: Parameters<typeof casasEnMapa.leerCaja>[0]) {
    setCargado(claveDelMapa);
    if (casas) casasEnMapa.leerCaja(e);
  }

  function alHacerClic(e: MapMouseEvent) {
    if (!dibujo) {
      const elegida = e.features?.[0];
      // Una burbuja del agrupado: acercar es la forma de ver el estado de cada casa.
      if (elegida?.layer?.id === CAPA_DE_GRUPOS) {
        e.target.easeTo({ center: e.lngLat, zoom: e.target.getZoom() + 2 });
        return;
      }
      const id = elegida?.properties?.id;
      if (typeof id === "string") onZonaClick(id);
      else cerrarTarjeta?.(null);
      return;
    }
    onMapaClick(punto(e));
  }

  const asaRadio = dibujo?.centro && dibujo.radioM ? puntoADistancia(dibujo.centro, dibujo.radioM) : null;

  // Qué se le dice al coordinador, de lo más grave a lo menos: una sola cosa a la vez.
  const aviso: AvisoBase | null =
    base.fase === "falla" || sinTiles === claveDelMapa
      ? { tipo: "sin-calles", onReintentar: reintentarMapa }
      : lento === claveDelMapa && cargado !== claveDelMapa
        ? { tipo: "lento" }
        : base.fase === "sin-paquete"
          ? { tipo: "sin-paquete", ciudad: ciudad.nombre }
          : null;

  if (base.fase === "cargando") {
    return (
      <div aria-live="polite" className="grid h-full place-items-center bg-superficie-mapa text-chico text-tinta-suave">
        Cargando el mapa…
      </div>
    );
  }
  if (sinWebgl === claveDelMapa) return <AvisoDelMapaBase aviso={{ tipo: "sin-webgl" }} />;

  return (
    <Map
      key={claveDelMapa}
      initialViewState={{ longitude: ciudad.centro.lon, latitude: ciudad.centro.lat, zoom: ciudad.zoom }}
      mapStyle={base.fase === "listo" ? base.estilo : estilo}
      style={{ width: "100%", height: "100%" }}
      attributionControl={false}
      interactiveLayerIds={dibujo ? [] : casasEnMapa.agrupar ? [CAPA_DE_GRUPOS, "zonas-relleno"] : ["zonas-relleno"]}
      cursor={dibujo ? "crosshair" : undefined}
      onClick={alHacerClic}
      onLoad={alCargar}
      onError={alFallar}
      onMoveEnd={casas ? casasEnMapa.leerCaja : undefined}
      onIdle={casas ? casasEnMapa.leerGrupos : undefined}
      onMouseMove={(e) => dibujo && onMapaMove(punto(e))}
      doubleClickZoom={!dibujo}
    >
      <NavigationControl showCompass={false} position="bottom-right" />
      {base.fase === "listo" ? <AttributionControl position="bottom-right" /> : null}

      <Source id="calles" type="geojson" data={callesGeojson}>
        <Layer id="calles-linea" type="line" paint={{ "line-color": colores.calle, "line-width": 6 }} />
      </Source>

      <Source id="zonas" type="geojson" data={zonasGeojson}>
        <Layer
          id="zonas-relleno"
          type="fill"
          paint={{ "fill-color": ["get", "color"], "fill-opacity": ["case", ["get", "elegida"], 0.4, 0.22] }}
        />
        <Layer
          id="zonas-borde"
          type="line"
          paint={{ "line-color": ["get", "color"], "line-width": ["case", ["get", "elegida"], 3, 2] }}
        />
      </Source>

      {casas ? <CapaDeCasas casas={casas} zonas={zonas} tocables={!dibujo} estado={casasEnMapa} /> : null}

      <Source id="dibujo-poligono" type="geojson" data={poligonoGeojson}>
        <Layer id="dibujo-relleno" type="fill" paint={{ "fill-color": colores.trazoDibujo, "fill-opacity": 0.18 }} />
        <Layer id="dibujo-borde" type="line" paint={{ "line-color": colores.trazoDibujo, "line-width": 3 }} />
      </Source>
      <Source id="dibujo-camino" type="geojson" data={caminoGeojson}>
        <Layer id="dibujo-camino-linea" type="line" paint={{ "line-color": colores.trazoDibujo, "line-width": 3 }} />
      </Source>
      <Source id="dibujo-conflicto" type="geojson" data={conflictoGeojson}>
        <Layer id="dibujo-conflicto-linea" type="line" paint={{ "line-color": colores.conflicto, "line-width": 5 }} />
      </Source>

      {(ciudad.calles ?? []).map((c) => (
        <Marker key={c.nombre} longitude={c.trazo[0].lon} latitude={c.trazo[0].lat} anchor="center">
          <span className="pointer-events-none text-etiqueta font-medium tracking-[.06em] text-tinta-tenue uppercase">
            {c.nombre}
          </span>
        </Marker>
      ))}

      {zonas.map((z) => {
        const c = centroide(z);
        return (
          <Marker key={z.id} longitude={c.lon} latitude={c.lat} anchor="center">
            <span className="pointer-events-none flex max-w-40 flex-col items-center rounded-control bg-superficie/90 px-2 py-0.5 text-mini font-semibold text-tinta shadow-sm">
              <span className="max-w-full truncate">{z.nombre}</span>
              {z.colportores.length === 0 ? (
                <span className="font-normal text-tinta-suave">sin colportor</span>
              ) : null}
            </span>
          </Marker>
        );
      })}

      {dibujo?.esquinas.map((e, i) => (
        <Marker key={`${e.lon},${e.lat}`} longitude={e.lon} latitude={e.lat} anchor="center">
          <span className="pointer-events-none grid size-5 place-items-center rounded-full border-2 border-superficie bg-marca-media text-etiqueta font-bold text-superficie">
            {i + 1}
          </span>
        </Marker>
      ))}

      {dibujo?.centro ? (
        <Marker longitude={dibujo.centro.lon} latitude={dibujo.centro.lat} anchor="center">
          <span className="pointer-events-none flex flex-col items-center gap-0.5">
            <span className="block size-3 rounded-full border-2 border-superficie bg-marca-media" />
            {dibujo.rotuloCentro ? (
              <span className="flex max-w-40 flex-col items-center rounded-control bg-superficie/90 px-2 py-0.5 text-mini font-semibold text-tinta shadow-sm">
                <span className="max-w-full truncate">{dibujo.rotuloCentro.nombre}</span>
                <span className="font-normal text-tinta-suave">{dibujo.rotuloCentro.detalle}</span>
              </span>
            ) : null}
          </span>
        </Marker>
      ) : null}
      {dibujo?.centro && asaRadio ? (
        <Marker
          longitude={asaRadio.lon}
          latitude={asaRadio.lat}
          anchor="center"
          draggable
          onDrag={(e) => {
            const metros = distanciaM(dibujo.centro as Punto, { lon: e.lngLat.lng, lat: e.lngLat.lat });
            onRadio(Math.min(RADIO_MAX_M, Math.max(RADIO_MIN_M, Math.round(metros / 10) * 10)));
          }}
        >
          <span
            title="Arrastrá para cambiar el radio"
            className="block size-4 cursor-ew-resize rounded-full border-2 border-marca-media bg-superficie shadow"
          />
        </Marker>
      ) : null}

      {dibujo?.etiqueta ? (
        <Marker longitude={dibujo.etiqueta.punto.lon} latitude={dibujo.etiqueta.punto.lat} anchor="bottom-left" offset={[8, -8]}>
          <span className="pointer-events-none rounded-control bg-tinta px-[9px] py-[5px] text-chico whitespace-nowrap text-superficie">
            {dibujo.etiqueta.texto}
          </span>
        </Marker>
      ) : null}
      {dibujo?.comparte ? (
        <Marker longitude={dibujo.comparte.punto.lon} latitude={dibujo.comparte.punto.lat} anchor="left" offset={[10, 0]}>
          <span className="pointer-events-none rounded-pastilla bg-superficie px-2 py-[3px] text-mini whitespace-nowrap text-tinta-2 shadow">
            {dibujo.comparte.texto}
          </span>
        </Marker>
      ) : null}

      {aviso ? <AvisoDelMapaBase aviso={aviso} /> : null}
    </Map>
  );
}
