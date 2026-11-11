import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DATOS_ZONAS_SIMULADO } from "@/datos/equipo/zonas/simulado";
import { puntoADistancia } from "@/datos/equipo/zonas/geometria";
import { colorDeBorde } from "@/datos/equipo/zonas/paleta";
import { AYUDA_CENTRO_MOVIBLE, MapaZonasGl, TEXTO_CENTRO_MOVIBLE } from "@/features/equipo/zonas/MapaZonasGl";
import type { DibujoEnMapa, PropsMapaZonas } from "@/features/equipo/zonas/tipos";

/** MapLibre necesita WebGL: en jsdom se reemplaza por un doble que deja ver lo que recibe. */
const doble = vi.hoisted(() => ({
  mapa: null as null | Record<string, unknown>,
  marcadores: [] as Record<string, unknown>[],
  fuentes: {} as Record<string, unknown>,
  capas: [] as string[],
}));

vi.mock("maplibre-gl", () => ({ setWorkerUrl: vi.fn(), addProtocol: vi.fn(), removeProtocol: vi.fn() }));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
vi.mock("react-map-gl/maplibre", () => ({
  default: (props: Record<string, unknown> & { children: ReactNode }) => {
    doble.mapa = props;
    return <div data-testid="mapa-gl">{props.children}</div>;
  },
  NavigationControl: () => <div data-testid="zoom" />,
  AttributionControl: () => <div data-testid="atribucion" />,
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

    it("deja acercar hasta el zoom 19 de lib-mapa, el mismo del celular, para leer los números de puerta", () => {
      montar();
      expect(doble.mapa?.maxZoom).toBe(19);
    });

    it("dibuja el borde de cada zona con su color oscurecido hasta 3:1 (el relleno sigue con el color de la zona)", () => {
      montar({ zonas: [{ ...CIUDAD.zonas[0], color: "#13407A" }, { ...CIUDAD.zonas[1], color: "#A98330" }] });
      const props = (doble.fuentes.zonas as { features: { properties: { color: string; borde: string } }[] }).features.map((f) => f.properties);
      expect(props[0]).toMatchObject({ color: "#13407A", borde: "#13407A" });
      expect(props[1].color).toBe("#A98330");
      expect(props[1].borde).toBe(colorDeBorde("#A98330"));
      expect(props[1].borde).not.toBe("#A98330");
    });

    it("una ciudad sin calles ni zonas se dibuja igual", () => {
      montar({ ciudad: { ...CIUDAD, calles: undefined }, zonas: [] });
      expect((doble.fuentes.calles as { features: unknown[] }).features).toHaveLength(0);
      expect((doble.fuentes.zonas as { features: unknown[] }).features).toHaveLength(0);
    });
  });

  describe("al volver a renderizar", () => {
    it("conserva la misma referencia de estilo y de datos, para que MapLibre no recargue el estilo en cada clic", () => {
      const props: PropsMapaZonas = {
        ciudad: CIUDAD,
        zonas: CIUDAD.zonas,
        zonaElegidaId: null,
        dibujo: null,
        onZonaClick: vi.fn(),
        onMapaClick: vi.fn(),
        onMapaMove: vi.fn(),
        onRadio: vi.fn(),
      };
      const { rerender } = render(<MapaZonasGl {...props} />);
      const estilo = doble.mapa?.mapStyle;
      const zonas = doble.fuentes.zonas;

      rerender(<MapaZonasGl {...props} onMapaClick={vi.fn()} />);

      expect(doble.mapa?.mapStyle).toBe(estilo);
      expect(doble.fuentes.zonas).toBe(zonas);
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

  describe("el centro de la zona radial se mueve (#179)", () => {
    const centro = { lon: -56.25, lat: -34.87 };
    const radial: DibujoEnMapa = { ...SIN_DIBUJO, centro, radioM: 400, rotuloCentro: { nombre: "Casabó", detalle: "400 m" } };
    type Arrastre = (e: { lngLat: { lng: number; lat: number } }) => void;
    const marcadorDelCentro = () => doble.marcadores.find((m) => m.longitude === centro.lon && m.latitude === centro.lat);

    it("el centro es un marcador que se arrastra: avisa cada paso y, al soltarlo, dónde quedó", () => {
      const onCentro = vi.fn();
      montar({ dibujo: radial, onCentro });
      const marcador = marcadorDelCentro();

      expect(marcador?.draggable).toBe(true);
      expect(marcador?.anchor).toBe("center");
      act(() => (marcador?.onDrag as Arrastre)({ lngLat: { lng: -56.24, lat: -34.86 } }));
      expect(onCentro).toHaveBeenLastCalledWith({ lon: -56.24, lat: -34.86 }, false);
      act(() => (marcador?.onDragEnd as Arrastre)({ lngLat: { lng: -56.23, lat: -34.85 } }));
      expect(onCentro).toHaveBeenLastCalledWith({ lon: -56.23, lat: -34.85 }, true);
      expect(onCentro).toHaveBeenCalledTimes(2);
    });

    it("el punto es un botón con nombre y con la ayuda de cómo moverlo; el rótulo de la zona sigue a la vista", () => {
      montar({ dibujo: radial, onCentro: vi.fn() });
      const punto = screen.getByRole("button", { name: TEXTO_CENTRO_MOVIBLE });

      expect(punto).toHaveAccessibleDescription(AYUDA_CENTRO_MOVIBLE);
      expect(AYUDA_CENTRO_MOVIBLE).toMatch(/flechas del teclado/);
      expect(screen.getByText("Casabó")).toBeInTheDocument();
      expect(screen.getByText("400 m")).toBeInTheDocument();
    });

    it.each([
      ["ArrowRight", false, 10, 0],
      ["ArrowUp", false, 10, Math.PI / 2],
      ["ArrowLeft", false, 10, Math.PI],
      ["ArrowDown", false, 10, -Math.PI / 2],
      ["ArrowRight", true, 100, 0],
      ["ArrowDown", true, 100, -Math.PI / 2],
    ] as const)("con el foco en el punto, %s (Mayús: %s) lo corre %i m", (tecla, mayus, metros, angulo) => {
      const onCentro = vi.fn();
      montar({ dibujo: radial, onCentro });
      const punto = screen.getByRole("button", { name: TEXTO_CENTRO_MOVIBLE });

      const seguido = fireEvent.keyDown(punto, { key: tecla, shiftKey: mayus });

      const esperado = puntoADistancia(centro, metros, angulo);
      expect(onCentro).toHaveBeenCalledTimes(1);
      expect(onCentro.mock.calls[0][0].lon).toBeCloseTo(esperado.lon, 9);
      expect(onCentro.mock.calls[0][0].lat).toBeCloseTo(esperado.lat, 9);
      expect(onCentro.mock.calls[0][1]).toBe(true);
      // La flecha es del punto: ni desplaza la página ni llega al mapa (que la usaría para moverse).
      expect(seguido).toBe(false);
    });

    it("la flecha no sube hasta el contenedor del mapa, y las demás teclas (o con Ctrl) no mueven nada", () => {
      const onCentro = vi.fn();
      montar({ dibujo: radial, onCentro });
      const punto = screen.getByRole("button", { name: TEXTO_CENTRO_MOVIBLE });
      const enElMapa = vi.fn();
      screen.getByTestId("mapa-gl").addEventListener("keydown", enElMapa);

      fireEvent.keyDown(punto, { key: "ArrowLeft" });
      expect(enElMapa).not.toHaveBeenCalled();
      expect(onCentro).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(punto, { key: "Enter" });
      fireEvent.keyDown(punto, { key: "a" });
      fireEvent.keyDown(punto, { key: "ArrowLeft", ctrlKey: true });
      expect(onCentro).toHaveBeenCalledTimes(1);
      expect(enElMapa).toHaveBeenCalledTimes(3);
    });

    it("varias flechas seguidas parten cada una del centro que haya en ese momento", () => {
      const onCentro = vi.fn();
      const props = montar({ dibujo: radial, onCentro });
      const corrido = puntoADistancia(centro, 10);
      fireEvent.keyDown(screen.getByRole("button", { name: TEXTO_CENTRO_MOVIBLE }), { key: "ArrowRight" });

      // La vista contesta con el centro nuevo, como hace `ZonasCampania`.
      render(<MapaZonasGl {...props} dibujo={{ ...radial, centro: corrido }} />);
      const puntos = screen.getAllByRole("button", { name: TEXTO_CENTRO_MOVIBLE });
      fireEvent.keyDown(puntos[puntos.length - 1], { key: "ArrowRight" });

      const esperado = puntoADistancia(corrido, 10);
      expect(onCentro.mock.calls[1][0].lon).toBeCloseTo(esperado.lon, 9);
    });

    it("un clic sobre el centro o sobre el asa del radio no pasa al mapa: no corre el centro al píxel tocado", () => {
      montar({ dibujo: radial, onCentro: vi.fn() });
      const asa = doble.marcadores.find((m) => m.draggable && m !== marcadorDelCentro());

      for (const marcador of [marcadorDelCentro(), asa]) {
        const originalEvent = { stopPropagation: vi.fn() };
        (marcador?.onClick as (e: { originalEvent: typeof originalEvent }) => void)({ originalEvent });
        expect(originalEvent.stopPropagation).toHaveBeenCalledTimes(1);
      }
    });

    it("sin `onCentro` el centro queda fijo, como antes: ni se arrastra ni es un botón", () => {
      montar({ dibujo: radial });

      expect(marcadorDelCentro()?.draggable).toBe(false);
      expect(marcadorDelCentro()?.onDrag).toBeUndefined();
      expect(screen.queryByRole("button", { name: TEXTO_CENTRO_MOVIBLE })).not.toBeInTheDocument();
      expect(screen.getByText("Casabó")).toBeInTheDocument();
    });

    it("una zona por esquinas no tiene centro que mover", () => {
      montar({
        dibujo: { ...SIN_DIBUJO, esquinas: [{ lon: -56.25, lat: -34.87, calleA: "Pororó", calleB: "Heredia" }] },
        onCentro: vi.fn(),
      });

      expect(screen.queryByRole("button", { name: TEXTO_CENTRO_MOVIBLE })).not.toBeInTheDocument();
      expect(doble.marcadores.some((m) => m.draggable)).toBe(false);
    });
  });

  describe("quitar una esquina puntual (#182)", () => {
    const ESQUINAS = [
      { lon: -56.26, lat: -34.87, calleA: "Pororó", calleB: "Heredia" },
      { lon: -56.25, lat: -34.87, calleA: "Pororó", calleB: "Bogotá" },
      { lon: -56.25, lat: -34.86, calleA: "Rusia", calleB: "Bogotá" },
    ];
    const conEsquinas = (esquinas = ESQUINAS): DibujoEnMapa => ({ ...SIN_DIBUJO, esquinas });

    it("cada esquina lleva su «×» con nombre propio, de 44 px, al costado del número", () => {
      montar({ dibujo: conEsquinas(), onQuitarEsquina: vi.fn() });

      for (const numero of [1, 2, 3]) {
        const boton = screen.getByRole("button", { name: `Quitar la esquina ${numero}` });
        expect(boton).toHaveClass("size-11");
        expect(boton).toHaveAttribute("title", `Quitar la esquina ${numero}`);
      }
      // El número sigue sin atajar el clic: tocarlo es tocar la esquina (así se cierra la forma en la 1).
      expect(screen.getByText("1")).toHaveClass("pointer-events-none");
    });

    it("la «×» avisa qué esquina se quita y el clic no llega al mapa", () => {
      const props = montar({ dibujo: conEsquinas(), onQuitarEsquina: vi.fn() });
      const enElMapa = vi.fn();
      screen.getByTestId("mapa-gl").addEventListener("click", enElMapa);

      fireEvent.click(screen.getByRole("button", { name: "Quitar la esquina 2" }));

      expect(props.onQuitarEsquina).toHaveBeenCalledTimes(1);
      expect(props.onQuitarEsquina).toHaveBeenCalledWith(1);
      expect(enElMapa).not.toHaveBeenCalled();
      expect(props.onMapaClick).not.toHaveBeenCalled();
    });

    it("sin `onQuitarEsquina` (mientras guarda) las esquinas no llevan «×»", () => {
      montar({ dibujo: conEsquinas() });

      expect(screen.queryByRole("button", { name: /Quitar la esquina/ })).not.toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("al irse la esquina, el foco pasa a la «×» que quedó con su número, y al mapa si no queda ninguna", () => {
      const onQuitarEsquina = vi.fn();
      const base = { ciudad: CIUDAD, zonas: CIUDAD.zonas, zonaElegidaId: null, onZonaClick: vi.fn(), onMapaClick: vi.fn(), onMapaMove: vi.fn(), onRadio: vi.fn(), onQuitarEsquina };
      const { rerender } = render(<MapaZonasGl {...base} dibujo={conEsquinas()} />);

      const ultima = screen.getByRole("button", { name: "Quitar la esquina 3" });
      ultima.focus();
      fireEvent.click(ultima);
      rerender(<MapaZonasGl {...base} dibujo={conEsquinas(ESQUINAS.slice(0, 2))} />);

      expect(screen.getByRole("button", { name: "Quitar la esquina 2" })).toHaveFocus();

      fireEvent.click(screen.getByRole("button", { name: "Quitar la esquina 2" }));
      rerender(<MapaZonasGl {...base} dibujo={conEsquinas(ESQUINAS.slice(0, 1))} />);
      expect(screen.getByRole("button", { name: "Quitar la esquina 1" })).toHaveFocus();

      fireEvent.click(screen.getByRole("button", { name: "Quitar la esquina 1" }));
      rerender(<MapaZonasGl {...base} dibujo={conEsquinas([])} />);
      expect(screen.getByTestId("mapa-gl").parentElement).toHaveFocus();
    });

    it("una «×» tocada sin foco (táctil) no se lleva el foco de donde esté", () => {
      const base = { ciudad: CIUDAD, zonas: CIUDAD.zonas, zonaElegidaId: null, onZonaClick: vi.fn(), onMapaClick: vi.fn(), onMapaMove: vi.fn(), onRadio: vi.fn(), onQuitarEsquina: vi.fn() };
      const { rerender } = render(<MapaZonasGl {...base} dibujo={conEsquinas()} />);

      fireEvent.click(screen.getByRole("button", { name: "Quitar la esquina 1" }));
      rerender(<MapaZonasGl {...base} dibujo={conEsquinas(ESQUINAS.slice(1))} />);

      expect(document.body).toHaveFocus();
    });
  });
});
