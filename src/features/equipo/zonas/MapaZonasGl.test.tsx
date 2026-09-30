import { act, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DATOS_ZONAS_SIMULADO } from "@/datos/equipo/zonas/simulado";
import { puntoADistancia } from "@/datos/equipo/zonas/geometria";
import { MapaZonasGl } from "@/features/equipo/zonas/MapaZonasGl";
import type { DibujoEnMapa, PropsMapaZonas } from "@/features/equipo/zonas/tipos";

/** MapLibre necesita WebGL: en jsdom se reemplaza por un doble que deja ver lo que recibe. */
const doble = vi.hoisted(() => ({
  mapa: null as null | Record<string, unknown>,
  marcadores: [] as Record<string, unknown>[],
  fuentes: {} as Record<string, unknown>,
  capas: [] as string[],
}));

vi.mock("maplibre-gl", () => ({ setWorkerUrl: vi.fn() }));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
vi.mock("react-map-gl/maplibre", () => ({
  default: (props: Record<string, unknown> & { children: ReactNode }) => {
    doble.mapa = props;
    return <div data-testid="mapa-gl">{props.children}</div>;
  },
  NavigationControl: () => <div data-testid="zoom" />,
  Source: ({ id, data, children }: { id: string; data: { features: unknown[] }; children: ReactNode }) => {
    doble.fuentes[id] = data;
    return <div data-testid={`fuente-${id}`}>{children}</div>;
  },
  Layer: ({ id }: { id: string }) => {
    doble.capas.push(id);
    return null;
  },
  Marker: (props: Record<string, unknown> & { children: ReactNode }) => {
    doble.marcadores.push(props);
    return <div data-testid="marcador">{props.children}</div>;
  },
}));

const CIUDAD = DATOS_ZONAS_SIMULADO.ciudades[0];

const SIN_DIBUJO: DibujoEnMapa = {
  poligono: null,
  linea: [],
  esquinas: [],
  centro: null,
  radioM: null,
  rotuloCentro: null,
  conflicto: null,
  etiqueta: null,
  comparte: null,
};

function montar(sobre: Partial<PropsMapaZonas> = {}) {
  const props: PropsMapaZonas = {
    ciudad: CIUDAD,
    zonas: CIUDAD.zonas,
    zonaElegidaId: null,
    dibujo: null,
    onZonaClick: vi.fn(),
    onMapaClick: vi.fn(),
    onMapaMove: vi.fn(),
    onRadio: vi.fn(),
    ...sobre,
  };
  render(<MapaZonasGl {...props} />);
  return props;
}

const eventoClic = (features?: { properties: Record<string, unknown> }[]) => ({
  lngLat: { lng: -56.25, lat: -34.87 },
  features,
});

afterEach(() => {
  doble.mapa = null;
  doble.marcadores = [];
  doble.fuentes = {};
  doble.capas = [];
});

describe("MapaZonasGl", () => {
  describe("sin dibujar", () => {
    it("pinta las zonas y las calles, y rotula cada zona; la que no tiene colportores lo dice", () => {
      montar();

      expect((doble.fuentes.zonas as { features: unknown[] }).features).toHaveLength(4);
      expect((doble.fuentes.calles as { features: unknown[] }).features).toHaveLength(13);
      expect(doble.capas).toEqual(expect.arrayContaining(["zonas-relleno", "zonas-borde", "calles-linea"]));
      for (const zona of CIUDAD.zonas) expect(screen.getByText(zona.nombre)).toBeInTheDocument();
      expect(screen.getAllByText("sin colportor")).toHaveLength(1);
      expect(screen.getByText("Pororó")).toBeInTheDocument();
      expect(screen.getByTestId("zoom")).toBeInTheDocument();
    });

    it("marca la zona elegida para que se dibuje resaltada", () => {
      montar({ zonaElegidaId: "zona-belvedere" });
      const props = (doble.fuentes.zonas as { features: { properties: { id: string; elegida: boolean } }[] }).features.map(
        (f) => [f.properties.id, f.properties.elegida],
      );
      expect(props).toContainEqual(["zona-belvedere", true]);
      expect(props).toContainEqual(["zona-la-teja", false]);
    });

    it("el clic sobre una zona la elige y el clic sobre el fondo no hace nada", () => {
      const props = montar();
      const onClick = doble.mapa?.onClick as (e: unknown) => void;
      expect(doble.mapa?.interactiveLayerIds).toEqual(["zonas-relleno"]);

      act(() => onClick(eventoClic([{ properties: { id: "zona-la-teja" } }])));
      act(() => onClick(eventoClic([])));

      expect(props.onZonaClick).toHaveBeenCalledTimes(1);
      expect(props.onZonaClick).toHaveBeenCalledWith("zona-la-teja");
      expect(props.onMapaClick).not.toHaveBeenCalled();
    });

    it("abre centrado en la ciudad y con el zoom de la ciudad", () => {
      montar();
      expect(doble.mapa?.initialViewState).toEqual({ longitude: CIUDAD.centro.lon, latitude: CIUDAD.centro.lat, zoom: CIUDAD.zoom });
      expect(doble.mapa?.cursor).toBeUndefined();
    });

    it("una ciudad sin calles ni zonas se dibuja igual", () => {
      montar({ ciudad: { ...CIUDAD, calles: undefined }, zonas: [] });
      expect((doble.fuentes.calles as { features: unknown[] }).features).toHaveLength(0);
      expect((doble.fuentes.zonas as { features: unknown[] }).features).toHaveLength(0);
    });
  });

  describe("dibujando", () => {
    it("el clic es de dibujo: entrega el punto y no elige zonas; el cursor es una mira", () => {
      const props = montar({ dibujo: SIN_DIBUJO });
      const onClick = doble.mapa?.onClick as (e: unknown) => void;
      expect(doble.mapa?.interactiveLayerIds).toEqual([]);
      expect(doble.mapa?.cursor).toBe("crosshair");
      expect(doble.mapa?.doubleClickZoom).toBe(false);

      act(() => onClick(eventoClic([{ properties: { id: "zona-la-teja" } }])));

      expect(props.onMapaClick).toHaveBeenCalledWith({ lon: -56.25, lat: -34.87 });
      expect(props.onZonaClick).not.toHaveBeenCalled();
    });

    it("avisa el movimiento del puntero solo mientras dibuja", () => {
      const props = montar({ dibujo: SIN_DIBUJO });
      const onMouseMove = doble.mapa?.onMouseMove as (e: unknown) => void;

      act(() => onMouseMove(eventoClic()));

      expect(props.onMapaMove).toHaveBeenCalledWith({ lon: -56.25, lat: -34.87 });
    });

    it("numera las esquinas y muestra las etiquetas del puntero y de la calle compartida", () => {
      montar({
        dibujo: {
          ...SIN_DIBUJO,
          esquinas: [
            { lon: -56.26, lat: -34.87, calleA: "Pororó", calleB: "Heredia" },
            { lon: -56.25, lat: -34.87, calleA: "Pororó", calleB: "Bogotá" },
          ],
          linea: [
            { lon: -56.26, lat: -34.87 },
            { lon: -56.25, lat: -34.87 },
          ],
          etiqueta: { punto: { lon: -56.25, lat: -34.87 }, texto: "Pororó y Heredia · clic para agregar" },
          comparte: { punto: { lon: -56.25, lat: -34.86 }, texto: "Comparte la calle Heredia con Belvedere" },
        },
      });

      const marcadores = screen.getAllByTestId("marcador");
      expect(within(marcadores[marcadores.length - 4]).getByText("1")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByText("Pororó y Heredia · clic para agregar")).toBeInTheDocument();
      expect(screen.getByText("Comparte la calle Heredia con Belvedere")).toBeInTheDocument();
      expect((doble.fuentes["dibujo-camino"] as { features: unknown[] }).features).toHaveLength(1);
    });

    it("marca en rojo el tramo en conflicto y pinta el polígono calculado", () => {
      montar({
        dibujo: {
          ...SIN_DIBUJO,
          poligono: CIUDAD.zonas[0].poligonoGeojson,
          conflicto: [
            { lon: -56.26, lat: -34.87 },
            { lon: -56.25, lat: -34.87 },
          ],
        },
      });

      expect((doble.fuentes["dibujo-conflicto"] as { features: unknown[] }).features).toHaveLength(1);
      expect((doble.fuentes["dibujo-poligono"] as { features: unknown[] }).features).toHaveLength(1);
    });

    it("sin forma dibujada las capas de dibujo quedan vacías", () => {
      montar({ dibujo: SIN_DIBUJO });
      for (const id of ["dibujo-camino", "dibujo-conflicto", "dibujo-poligono"]) {
        expect((doble.fuentes[id] as { features: unknown[] }).features).toHaveLength(0);
      }
    });

    it("una zona radial muestra el centro con su rótulo y un asa en el borde para arrastrar el radio", () => {
      const centro = { lon: -56.25, lat: -34.87 };
      const props = montar({ dibujo: { ...SIN_DIBUJO, centro, radioM: 400, rotuloCentro: { nombre: "Casabó", detalle: "400 m" } } });

      expect(screen.getByText("Casabó")).toBeInTheDocument();
      expect(screen.getByText("400 m")).toBeInTheDocument();
      const asa = doble.marcadores.find((m) => m.draggable);
      const este = puntoADistancia(centro, 400);
      expect(asa).toMatchObject({ longitude: este.lon, latitude: este.lat });

      const onDrag = asa?.onDrag as (e: { lngLat: { lng: number; lat: number } }) => void;
      const arrastrado = puntoADistancia(centro, 743);
      act(() => onDrag({ lngLat: { lng: arrastrado.lon, lat: arrastrado.lat } }));
      expect(props.onRadio).toHaveBeenLastCalledWith(740);
    });

    it("el radio arrastrado se acota entre 1 y 3000 m", () => {
      const centro = { lon: -56.25, lat: -34.87 };
      const props = montar({ dibujo: { ...SIN_DIBUJO, centro, radioM: 400 } });
      const onDrag = doble.marcadores.find((m) => m.draggable)?.onDrag as (e: { lngLat: { lng: number; lat: number } }) => void;

      const lejos = puntoADistancia(centro, 9000);
      act(() => onDrag({ lngLat: { lng: lejos.lon, lat: lejos.lat } }));
      expect(props.onRadio).toHaveBeenLastCalledWith(3000);

      act(() => onDrag({ lngLat: { lng: centro.lon, lat: centro.lat } }));
      expect(props.onRadio).toHaveBeenLastCalledWith(1);
    });

    it("sin centro elegido no hay asa de radio", () => {
      montar({ dibujo: SIN_DIBUJO });
      expect(doble.marcadores.some((m) => m.draggable)).toBe(false);
    });
  });
});
