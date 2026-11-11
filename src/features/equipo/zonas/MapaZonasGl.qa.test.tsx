import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DATOS_ZONAS_SIMULADO } from "@/datos/equipo/zonas/simulado";
import { MapaZonasGl } from "@/features/equipo/zonas/MapaZonasGl";
import type { DibujoEnMapa, PropsMapaZonas } from "@/features/equipo/zonas/tipos";

/**
 * QA del mapa de fondo de la vista 24 (issue #140, PR #141): casos límite que no cubren los tests del implementador
 * (reintentos encadenados, foco, forma en curso, cambio de ciudad). Mismo doble de MapLibre que `MapaZonasGl.base.test.tsx`.
 */
const doble = vi.hoisted(() => ({
  mapa: null as null | Record<string, unknown>,
  montajes: 0,
  fuentes: {} as Record<string, unknown>,
}));

vi.mock("maplibre-gl", () => ({ setWorkerUrl: vi.fn(), addProtocol: vi.fn(), removeProtocol: vi.fn() }));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
// Cuenta los `Map` que se crean (cambiar la `key` desmonta el anterior y monta otro): un ref estable solo corre al montar.
const contarMontaje = (el: HTMLDivElement | null) => {
  if (el) doble.montajes += 1;
};

vi.mock("react-map-gl/maplibre", () => ({
  default: (props: Record<string, unknown> & { children: ReactNode }) => {
    doble.mapa = props;
    return (
      <div data-testid="mapa-gl" ref={contarMontaje}>
        {props.children}
      </div>
    );
  },
  NavigationControl: () => null,
  AttributionControl: () => <div data-testid="atribucion" />,
  Source: ({ id, data, children }: { id: string; data: { features: unknown[] }; children: ReactNode }) => {
    doble.fuentes[id] = data;
    return <div>{children}</div>;
  },
  Layer: () => null,
  Marker: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const SUPABASE = "https://abc.supabase.co";
const BUCKET = `${SUPABASE}/storage/v1/object/public/mapas`;
const MONTEVIDEO = "01a117a9-0619-7d34-bbfc-058f61d81448";
const CIUDAD = { ...DATOS_ZONAS_SIMULADO.ciudades[0], calles: undefined, catalogoId: MONTEVIDEO };

const CATALOGO = {
  version: 1,
  estilo: { url: "estilo/colportores.json" },
  paquetes: [
    {
      id: "ciudad-montevideo",
      nivel: "ciudad",
      ambito_id: MONTEVIDEO,
      nombre: "Montevideo",
      version: "1".repeat(64),
      partes: [{ archivo: "paquetes/ciudad/mvd.123.pmtiles", tamano_bytes: 1024, sha256: "a".repeat(64) }],
    },
  ],
};
const ESTILO = {
  version: 8,
  sources: { protomaps: { type: "vector", attribution: "© OpenStreetMap", url: "pmtiles://REEMPLAZAR" } },
  layers: [{ id: "calles", type: "line", source: "protomaps", "source-layer": "roads" }],
};

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

const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status });

/** Responde el catálogo y el estilo del bucket; `fallas` hace caer los primeros pedidos del catálogo. */
function bucket(opciones: { catalogo?: unknown; fallas?: number } = {}) {
  let fallas = opciones.fallas ?? 0;
  const pedidos: string[] = [];
  const falso = vi.fn(async (url: string) => {
    pedidos.push(url);
    if (url === `${BUCKET}/catalogo.json`) return fallas-- > 0 ? json({}, 500) : json(opciones.catalogo ?? CATALOGO);
    if (url === `${BUCKET}/estilo/colportores.json`) return json(ESTILO);
    return json({}, 404);
  });
  vi.stubGlobal("fetch", falso);
  return { pedidos, falso };
}

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
  const vista = render(<MapaZonasGl {...props} />);
  return { props, ...vista, de: (nuevas: Partial<PropsMapaZonas>) => vista.rerender(<MapaZonasGl {...props} {...nuevas} />) };
}

const estiloDelMapa = () => doble.mapa?.mapStyle as { sources: Record<string, { url?: string }> };
const eventos = () => doble.mapa as { onError(e: unknown): void; onLoad(e: unknown): void };
const hayCalles = () => "protomaps" in estiloDelMapa().sources;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_prueba");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  doble.mapa = null;
  doble.montajes = 0;
  doble.fuentes = {};
});


const largo = (u: string) => u.endsWith("catalogo.json");

describe("QA #140: reintentos y estados", () => {
  it("falla, el reintento vuelve a fallar y el segundo reintento llega: ningún estado queda trabado", async () => {
    const { pedidos } = bucket({ fallas: 2 });
    montar();
    await screen.findByTestId("mapa-gl");
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos traer las calles");

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument());
    expect(hayCalles()).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await vi.waitFor(() => expect(hayCalles()).toBe(true));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(pedidos.filter(largo)).toHaveLength(3);
  });

  it("la forma que se está dibujando sigue en el mapa después de «Reintentar»", async () => {
    bucket({ fallas: 1 });
    const dibujo: DibujoEnMapa = {
      ...SIN_DIBUJO,
      poligono: { type: "Polygon", coordinates: [[[-56.2, -34.9], [-56.19, -34.9], [-56.19, -34.89], [-56.2, -34.9]]] },
    };
    montar({ dibujo });
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await vi.waitFor(() => expect(hayCalles()).toBe(true));

    expect((doble.fuentes["dibujo-poligono"] as { features: unknown[] }).features).toHaveLength(1);
    expect((doble.fuentes.zonas as { features: unknown[] }).features).toHaveLength(CIUDAD.zonas.length);
  });

  it("al cambiar de ciudad el aviso de «sin mapa» se actualiza a la ciudad nueva y se va si la nueva sí tiene mapa", async () => {
    bucket();
    const { de } = montar({ ciudad: { ...CIUDAD, nombre: "Sin Mapa", catalogoId: "otra" } });
    await screen.findByTestId("mapa-gl");
    expect(document.querySelector("[data-aviso-del-mapa=sin-paquete]")).toHaveTextContent("Todavía no hay mapa de calles de Sin Mapa");

    de({ ciudad: CIUDAD });
    await vi.waitFor(() => expect(hayCalles()).toBe(true));
    expect(document.querySelector("[data-aviso-del-mapa]")).toBeNull();
  });

  it("un aviso de calles caído no se arrastra a la ciudad siguiente", async () => {
    bucket();
    const { de } = montar();
    await screen.findByTestId("mapa-gl");
    act(() => eventos().onError({ error: new Error("Failed to fetch"), sourceId: "protomaps" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    de({ ciudad: { ...CIUDAD, id: "ciudad-2" } });
    await screen.findByTestId("mapa-gl");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sin WebGL y después otra ciudad: el mapa vuelve a intentarse", async () => {
    bucket();
    const { de } = montar();
    await screen.findByTestId("mapa-gl");
    act(() => eventos().onError({ error: new Error("Failed to initialize WebGL") }));
    expect(screen.queryByTestId("mapa-gl")).not.toBeInTheDocument();

    de({ ciudad: { ...CIUDAD, id: "ciudad-2" } });
    expect(await screen.findByTestId("mapa-gl")).toBeInTheDocument();
  });

  it("el error de una fuente de tiles de otra parte (protomaps-2) también cuenta como calles caídas", async () => {
    bucket();
    montar();
    await screen.findByTestId("mapa-gl");
    act(() => eventos().onError({ error: new Error("Failed to fetch"), sourceId: "protomaps-2" }));
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos traer las calles");
  });
});

describe("QA #140: accesibilidad de los avisos", () => {
  it("«Cargando el mapa…» y los avisos tienen contenido y el botón «Reintentar» es un botón con nombre", async () => {
    bucket({ fallas: 1 });
    montar();
    expect(screen.getByText("Cargando el mapa…")).toBeInTheDocument();
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Reintentar" })).toHaveAttribute("type", "button");
  });

  it("después de «Reintentar» el foco no cae al <body>, ni con el reintento fallido ni cuando por fin carga", async () => {
    bucket({ fallas: 2 });
    montar();
    await screen.findByRole("alert");

    // Primer reintento: vuelve a fallar. El botón se desmonta pero el foco queda en el contenedor del mapa.
    const primero = screen.getByRole("button", { name: "Reintentar" });
    primero.focus();
    fireEvent.click(primero);
    expect(document.activeElement).not.toBe(document.body);
    await screen.findByRole("alert");
    expect(document.activeElement).not.toBe(document.body);

    // Segundo reintento: carga.
    const segundo = screen.getByRole("button", { name: "Reintentar" });
    segundo.focus();
    fireEvent.click(segundo);
    await vi.waitFor(() => expect(hayCalles()).toBe(true));
    expect(document.activeElement).not.toBe(document.body);
  });

  it("los avisos que piden hacer algo («lento», «sin mapa») se anuncian a lectores de pantalla", async () => {
    bucket({ catalogo: { ...CATALOGO, paquetes: [] } });
    montar();
    await screen.findByTestId("mapa-gl");
    const aviso = document.querySelector("[data-aviso-del-mapa=sin-paquete]");
    expect(aviso?.getAttribute("role") === "alert" || aviso?.getAttribute("aria-live") === "polite").toBe(true);
  });
});
