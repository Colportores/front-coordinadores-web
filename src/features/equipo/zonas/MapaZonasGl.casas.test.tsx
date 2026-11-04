import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CasaDeCiudad, EstadoDeCasa } from "@/datos/equipo/zonas";
import { DATOS_ZONAS_SIMULADO } from "@/datos/equipo/zonas/simulado";
import { MapaZonasGl } from "@/features/equipo/zonas/MapaZonasGl";
import type { CasasEnMapa, DibujoEnMapa, PropsMapaZonas } from "@/features/equipo/zonas/tipos";

/** Los puntos de las casas sobre el mapa (diseño 24P·01, 03 y 04). MapLibre necesita WebGL: un doble deja ver lo que recibe. */
const doble = vi.hoisted(() => ({
  mapa: null as null | Record<string, unknown>,
  fuentes: {} as Record<string, Record<string, unknown>>,
  capas: {} as Record<string, Record<string, unknown>>,
}));

vi.mock("maplibre-gl", () => ({ setWorkerUrl: vi.fn() }));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
vi.mock("react-map-gl/maplibre", () => ({
  default: (props: Record<string, unknown> & { children: ReactNode }) => {
    doble.mapa = props;
    return <div data-testid="mapa-gl">{props.children}</div>;
  },
  NavigationControl: () => null,
  Source: ({ id, children, ...resto }: { id: string; children: ReactNode } & Record<string, unknown>) => {
    doble.fuentes[id] = resto;
    return <div data-testid={`fuente-${id}`}>{children}</div>;
  },
  Layer: ({ id, ...resto }: { id: string } & Record<string, unknown>) => {
    doble.capas[id] = resto;
    return null;
  },
  Marker: (props: { longitude: number; latitude: number; children: ReactNode; style?: Record<string, string> }) => (
    <div data-testid="marcador" data-lon={props.longitude} data-lat={props.latitude} style={props.style}>
      {props.children}
    </div>
  ),
}));

const CIUDAD = DATOS_ZONAS_SIMULADO.ciudades[0];
const ZONAS = CIUDAD.zonas;

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

const casa = (n: number, estado: EstadoDeCasa = "SIN_VISITA", sobre: Partial<CasaDeCiudad> = {}): CasaDeCiudad => ({
  id: `c${n}`,
  lon: -56.26 + n * 0.0001,
  lat: -34.87,
  tipo: "CASA",
  estado,
  zonaIds: [ZONAS[0].id],
  ...sobre,
});
const muchas = (cantidad: number) => Array.from({ length: cantidad }, (_, i) => casa(i));

function montar(casas: Partial<CasasEnMapa> & { casas: CasaDeCiudad[] }, sobre: Partial<PropsMapaZonas> = {}) {
  const enMapa: CasasEnMapa = { elegidaId: null, onElegir: vi.fn(), onAgrupadas: vi.fn(), ...casas };
  const props: PropsMapaZonas = {
    ciudad: CIUDAD,
    zonas: ZONAS,
    zonaElegidaId: null,
    dibujo: null,
    casas: enMapa,
    onZonaClick: vi.fn(),
    onMapaClick: vi.fn(),
    onMapaMove: vi.fn(),
    onRadio: vi.fn(),
    ...sobre,
  };
  const r = render(<MapaZonasGl {...props} />);
  return { props, enMapa, ...r };
}

/** Un mapa de MapLibre de mentira: lo que está a la vista y las burbujas que dejó el cluster. */
function mapaFalso(caja = { oeste: -57, sur: -35, este: -56, norte: -34 }, grupos: unknown[] = []) {
  return {
    getBounds: () => ({ getWest: () => caja.oeste, getSouth: () => caja.sur, getEast: () => caja.este, getNorth: () => caja.norte }),
    querySourceFeatures: vi.fn(() => grupos),
    easeTo: vi.fn(),
    getZoom: () => 13,
  };
}
const avisar = (evento: string, target: ReturnType<typeof mapaFalso>) => act(() => (doble.mapa?.[evento] as (e: unknown) => void)({ target }));

afterEach(() => {
  doble.mapa = null;
  doble.fuentes = {};
  doble.capas = {};
});

describe("24P·01 · los puntos de a uno (hasta 200 a la vista)", () => {
  it("dibuja un punto por casa, con el nombre de su estado, y no usa el cluster", () => {
    const { enMapa } = montar({ casas: [casa(1, "RECHAZO"), casa(2, "ENTREGA_Y_COBRANZA_PENDIENTE"), casa(3)] });

    const puntos = within(screen.getByTestId("fuente-casas-agrupadas").parentElement as HTMLElement).getAllByRole("button");
    expect(puntos.map((p) => p.getAttribute("aria-label"))).toEqual(["Rechazó", "Entrega y pago", "Sin visita"]);
    expect((doble.fuentes["casas-agrupadas"].data as { features: unknown[] }).features).toEqual([]);
    expect(enMapa.onAgrupadas).toHaveBeenLastCalledWith(false);
  });

  it("los siete colores más «Sin visita» tienen cada uno su glifo", () => {
    const estados: EstadoDeCasa[] = ["SIN_VISITA", "SIN_CONTESTAR", "ENTREVISTA_PROGRAMADA", "ENTREVISTA_SIN_VENTA", "RECHAZO", "COBRANZA_PENDIENTE", "ENTREGA_Y_COBRANZA_PENDIENTE", "VENTA_COMPLETA"];
    montar({ casas: estados.map((e, i) => casa(i, e)) });

    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["", "–", "◷", "✓", "✕", "$", "⇢", "★"]);
  });

  it("200 casas a la vista van de a una; el clic del mapa sobre el fondo cierra la tarjeta", () => {
    const { enMapa } = montar({ casas: muchas(200), elegidaId: "c3" });

    expect(screen.getAllByRole("button")).toHaveLength(200);
    act(() => (doble.mapa?.onClick as (e: unknown) => void)({ lngLat: { lng: 0, lat: 0 }, features: [] }));
    expect(enMapa.onElegir).toHaveBeenCalledWith(null);
  });

  it("solo dibuja las que están dentro de lo que se ve", () => {
    montar({ casas: [casa(1), casa(2, "SIN_VISITA", { lon: -50 })] });
    avisar("onLoad", mapaFalso({ oeste: -57, sur: -35, este: -56, norte: -34 }));

    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});

describe("24P·03 · la casa elegida", () => {
  it("tocar un punto lo elige y tocarlo de nuevo cierra la tarjeta", () => {
    const { enMapa } = montar({ casas: [casa(1, "RECHAZO"), casa(2)] });

    fireEvent.click(screen.getByRole("button", { name: "Rechazó" }));
    expect(enMapa.onElegir).toHaveBeenLastCalledWith("c1");

    const { enMapa: otro } = montar({ casas: [casa(1, "RECHAZO")], elegidaId: "c1" });
    fireEvent.click(screen.getAllByRole("button", { name: "Rechazó" })[1]);
    expect(otro.onElegir).toHaveBeenLastCalledWith(null);
  });

  it("la tarjeta dice el estado, el tipo y la zona, y nada de montos, personas ni direcciones", () => {
    montar({ casas: [casa(1, "COBRANZA_PENDIENTE", { tipo: "NEGOCIO" })], elegidaId: "c1" });

    const tarjeta = screen.getByRole("group", { name: "Casa elegida" });
    expect(tarjeta).toHaveTextContent(`Cobranza pendienteNegocio · Zona ${ZONAS[0].nombre}`);
    expect(tarjeta.textContent).not.toMatch(/[0-9]{3,}|colportor|cliente|U\$U|UYU/i);
  });

  it("una casa en dos zonas superpuestas las nombra a las dos", () => {
    montar({ casas: [casa(1, "RECHAZO", { zonaIds: [ZONAS[0].id, ZONAS[1].id] })], elegidaId: "c1" });

    expect(screen.getByRole("group", { name: "Casa elegida" })).toHaveTextContent(`Casa · Zonas ${ZONAS[0].nombre} y ${ZONAS[1].nombre}`);
  });

  it("si la zona de la casa ya no está en la lista, la tarjeta no inventa un nombre", () => {
    montar({ casas: [casa(1, "RECHAZO", { zonaIds: ["zona-borrada"] })], elegidaId: "c1" });

    expect(screen.getByRole("group", { name: "Casa elegida" })).toHaveTextContent(/RechazóCasa$/);
  });

  it("Esc cierra la tarjeta, y solo mientras hay una abierta", () => {
    const { enMapa } = montar({ casas: [casa(1)], elegidaId: "c1" });

    fireEvent.keyDown(document, { key: "a" });
    expect(enMapa.onElegir).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(enMapa.onElegir).toHaveBeenCalledWith(null);
  });

  it("sin tarjeta abierta, Esc no hace nada", () => {
    const { enMapa } = montar({ casas: [casa(1)] });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(enMapa.onElegir).not.toHaveBeenCalled();
  });

  it("una casa elegida que ya no se ve (se destildó su estado) no deja tarjeta", () => {
    montar({ casas: [casa(2)], elegidaId: "c1" });

    expect(screen.queryByRole("group", { name: "Casa elegida" })).toBeNull();
  });

  it("mientras se dibuja una zona los puntos se ven pero no se tocan: el clic es de la forma", () => {
    const { enMapa } = montar({ casas: [casa(1)] }, { dibujo: SIN_DIBUJO });

    const punto = screen.getByRole("button", { name: "Sin visita" });
    expect(punto).toBeDisabled();
    fireEvent.click(punto);
    expect(enMapa.onElegir).not.toHaveBeenCalled();
  });
});

describe("24P·04 · más de 200 a la vista: casas agrupadas", () => {
  it("con 201 pasa los puntos al cluster de MapLibre, avisa que agrupó y no dibuja 201 botones", () => {
    const { enMapa } = montar({ casas: muchas(201) });

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    const fuente = doble.fuentes["casas-agrupadas"];
    expect(fuente).toMatchObject({ type: "geojson", cluster: true });
    expect((fuente.data as { features: unknown[] }).features).toHaveLength(201);
    expect(doble.capas["casas-agrupadas-grupo"]).toMatchObject({ type: "circle", filter: ["has", "point_count"] });
    expect(enMapa.onAgrupadas).toHaveBeenLastCalledWith(true);
  });

  it("si al destildar estados quedan 200 o menos, vuelven los puntos de a uno y el cluster queda vacío", () => {
    const { rerender, props } = montar({ casas: muchas(201) });
    rerender(<MapaZonasGl {...props} casas={{ ...(props.casas as CasasEnMapa), casas: muchas(150) }} />);

    expect((doble.fuentes["casas-agrupadas"].data as { features: unknown[] }).features).toEqual([]);
    expect(screen.getAllByRole("button")).toHaveLength(150);
  });

  it("al acercar y quedar menos de 201 a la vista, vuelven los puntos de a uno", () => {
    const { enMapa } = montar({ casas: muchas(300) });
    expect(enMapa.onAgrupadas).toHaveBeenLastCalledWith(true);

    // Las casas están una cada 0,0001° hacia el este: hasta -56,2450 quedan 151.
    avisar("onMoveEnd", mapaFalso({ oeste: -56.2601, sur: -35, este: -56.245, norte: -34 }));

    expect(screen.getAllByRole("button")).toHaveLength(151);
    expect(enMapa.onAgrupadas).toHaveBeenLastCalledWith(false);
  });

  it("pone la cantidad de cada burbuja que dejó el cluster, sin repetir las de dos teselas", () => {
    montar({ casas: muchas(300) });
    const burbuja = (id: number, cantidad: number) => ({ properties: { cluster_id: id, point_count: cantidad }, geometry: { type: "Point", coordinates: [-56.26, -34.87] } });

    avisar("onIdle", mapaFalso(undefined, [burbuja(1, 64), burbuja(2, 44), burbuja(1, 64), { properties: {}, geometry: { type: "Point", coordinates: [0, 0] } }]));

    expect(screen.getByRole("img", { name: "64 casas" })).toHaveTextContent("64");
    expect(screen.getByRole("img", { name: "44 casas" })).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });

  it("las burbujas no se vuelven a pintar si no cambiaron (un «idle» sin cambios no re-renderiza en bucle)", () => {
    montar({ casas: muchas(300) });
    const burbujas = [{ properties: { cluster_id: 1, point_count: 5 }, geometry: { type: "Point", coordinates: [-56.26, -34.87] } }];
    const mapa = mapaFalso(undefined, burbujas);

    avisar("onIdle", mapa);
    const antes = screen.getByRole("img", { name: "5 casas" });
    avisar("onIdle", mapa);

    expect(screen.getByRole("img", { name: "5 casas" })).toBe(antes);
  });

  it("tocar una burbuja acerca el mapa dos niveles; las burbujas se pueden tocar y los puntos de afuera, no", () => {
    montar({ casas: muchas(300) });
    expect(doble.mapa?.interactiveLayerIds).toEqual(["casas-agrupadas-grupo", "zonas-relleno"]);

    const mapa = mapaFalso();
    act(() =>
      (doble.mapa?.onClick as (e: unknown) => void)({
        target: mapa,
        lngLat: { lng: -56.26, lat: -34.87 },
        features: [{ layer: { id: "casas-agrupadas-grupo" }, properties: { cluster: true } }],
      }),
    );

    expect(mapa.easeTo).toHaveBeenCalledWith({ center: { lng: -56.26, lat: -34.87 }, zoom: 15 });
  });

  it("al desmontar (otra ciudad) avisa que ya no hay agrupado", () => {
    const { enMapa, unmount } = montar({ casas: muchas(300) });

    unmount();

    expect(enMapa.onAgrupadas).toHaveBeenLastCalledWith(false);
  });

  it("sin la prop casas el mapa no escucha eventos de más ni dibuja nada de casas", () => {
    const { unmount } = montar({ casas: [casa(1)] });
    expect(typeof doble.mapa?.onLoad).toBe("function");
    unmount();
    doble.fuentes = {};

    render(
      <MapaZonasGl
        ciudad={CIUDAD}
        zonas={ZONAS}
        zonaElegidaId={null}
        dibujo={null}
        onZonaClick={vi.fn()}
        onMapaClick={vi.fn()}
        onMapaMove={vi.fn()}
        onRadio={vi.fn()}
      />,
    );
    expect(doble.mapa?.onLoad).toBeUndefined();
    expect(doble.fuentes["casas-agrupadas"]).toBeUndefined();
    expect(doble.mapa?.interactiveLayerIds).toEqual(["zonas-relleno"]);
  });
});
