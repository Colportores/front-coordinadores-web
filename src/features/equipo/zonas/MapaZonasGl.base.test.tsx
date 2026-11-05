import { act, fireEvent, render, screen } from "@testing-library/react";
import { removeProtocol } from "maplibre-gl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DATOS_ZONAS_SIMULADO } from "@/datos/equipo/zonas/simulado";
import { ESPERA_DEL_MAPA_MS, MapaZonasGl } from "@/features/equipo/zonas/MapaZonasGl";
import { ESPERA_MAXIMA_MS } from "@/features/equipo/zonas/mapa-base/useMapaBase";
import type { DibujoEnMapa, PropsMapaZonas } from "@/features/equipo/zonas/tipos";

/**
 * El mapa de fondo de la vista 24 (issue #140): con Supabase, el estilo y el PMTiles de la ciudad salen del bucket `mapas`
 * (ADR-011); si no están o no se pueden traer, se ven las zonas sobre un fondo liso y un aviso que dice qué hacer.
 * MapLibre necesita WebGL: un doble deja ver lo que recibe y dispara sus eventos.
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
    { nivel: "ciudad", ambito_id: MONTEVIDEO, nombre: "Montevideo", partes: [{ archivo: "paquetes/ciudad/mvd.123.pmtiles" }] },
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

describe("mapa de fondo con Supabase", () => {
  it("una ciudad real, sin calles en los datos, se ve con el estilo y los tiles de su paquete, las zonas encima y la atribución", async () => {
    bucket();
    montar();

    // Mientras llega el estilo no hay mapa vacío: dice que carga.
    expect(screen.getByText("Cargando el mapa…")).toBeInTheDocument();
    expect(screen.queryByTestId("mapa-gl")).not.toBeInTheDocument();

    expect(await screen.findByTestId("mapa-gl")).toBeInTheDocument();
    expect(estiloDelMapa().sources.protomaps.url).toBe(`pmtiles://${BUCKET}/paquetes/ciudad/mvd.123.pmtiles`);
    expect((doble.fuentes.zonas as { features: unknown[] }).features).toHaveLength(CIUDAD.zonas.length);
    expect((doble.fuentes.calles as { features: unknown[] }).features).toHaveLength(0);
    expect(screen.getByTestId("atribucion")).toBeInTheDocument();
    expect(document.querySelector("[data-aviso-del-mapa]")).toBeNull();
  });

  it("trae el catálogo y el estilo una sola vez aunque se cambie de ciudad", async () => {
    const { pedidos } = bucket();
    const { de } = montar();
    await screen.findByTestId("mapa-gl");

    de({ ciudad: { ...CIUDAD, id: "otra-campania-ciudad" } });
    await screen.findByTestId("mapa-gl");
    expect(hayCalles()).toBe(true);

    expect(pedidos).toEqual([`${BUCKET}/catalogo.json`, `${BUCKET}/estilo/colportores.json`]);
  });

  it("si la ciudad no tiene mapa publicado, dibuja las zonas sobre fondo liso y lo dice, sin alarma", async () => {
    bucket({ catalogo: { ...CATALOGO, paquetes: [] } });
    montar();

    await screen.findByTestId("mapa-gl");
    expect(hayCalles()).toBe(false);
    expect((doble.fuentes.zonas as { features: unknown[] }).features).toHaveLength(CIUDAD.zonas.length);
    const aviso = document.querySelector("[data-aviso-del-mapa=sin-paquete]");
    expect(aviso).toHaveTextContent(`Todavía no hay mapa de calles de ${CIUDAD.nombre}`);
    expect(aviso).not.toHaveAttribute("role");
    expect(screen.queryByTestId("atribucion")).not.toBeInTheDocument();
  });

  it("si el bucket no responde, deja el fondo liso con las zonas y un aviso con «Reintentar» que vuelve a pedirlo", async () => {
    const { pedidos } = bucket({ fallas: 1 });
    montar();

    await screen.findByTestId("mapa-gl");
    expect(hayCalles()).toBe(false);
    expect((doble.fuentes.zonas as { features: unknown[] }).features).toHaveLength(CIUDAD.zonas.length);
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos traer las calles del mapa");

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await vi.waitFor(() => expect(hayCalles()).toBe(true));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(pedidos.filter((p) => p.endsWith("catalogo.json"))).toHaveLength(2);
  });

  it("un catálogo con otra forma, o sin estilo, cuenta como falla (no rompe el mapa)", async () => {
    bucket({ catalogo: { paquetes: "no" } });
    montar();

    await screen.findByTestId("mapa-gl");
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos traer las calles");
  });

  it("si el bucket no contesta en el plazo, corta el pedido y lo trata como falla", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, { signal }: { signal: AbortSignal }) =>
          new Promise((_, rechazar) => signal.addEventListener("abort", () => rechazar(new Error("cortado")))),
      ),
    );
    montar();
    expect(screen.getByText("Cargando el mapa…")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ESPERA_MAXIMA_MS + 1);
    });
    expect(screen.getByTestId("mapa-gl")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos traer las calles");
  });

  it("sin Supabase (sitio de prueba) usa el fondo liso con las calles simuladas y no pide nada", () => {
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const falso = vi.fn();
    vi.stubGlobal("fetch", falso);
    montar({ ciudad: DATOS_ZONAS_SIMULADO.ciudades[0] });

    expect(screen.getByTestId("mapa-gl")).toBeInTheDocument();
    expect(hayCalles()).toBe(false);
    expect((doble.fuentes.calles as { features: unknown[] }).features.length).toBeGreaterThan(0);
    expect(document.querySelector("[data-aviso-del-mapa]")).toBeNull();
    expect(falso).not.toHaveBeenCalled();
  });

  it("la forma que se está dibujando no se pierde cuando el fondo falla", async () => {
    bucket({ fallas: 1 });
    const dibujo: DibujoEnMapa = {
      ...SIN_DIBUJO,
      poligono: { type: "Polygon", coordinates: [[[-56.2, -34.9], [-56.19, -34.9], [-56.19, -34.89], [-56.2, -34.9]]] },
    };
    montar({ dibujo });

    await screen.findByRole("alert");
    expect((doble.fuentes["dibujo-poligono"] as { features: unknown[] }).features).toHaveLength(1);
  });
});

describe("cuando el mapa no se puede dibujar", () => {
  it("sin WebGL ocupa el lugar del mapa con un aviso que dice qué hacer", async () => {
    bucket();
    montar();
    await screen.findByTestId("mapa-gl");

    act(() => eventos().onError({ error: new Error("Failed to initialize WebGL") }));

    expect(screen.queryByTestId("mapa-gl")).not.toBeInTheDocument();
    const aviso = screen.getByRole("alert");
    expect(aviso).toHaveTextContent("Este navegador no puede dibujar el mapa (le falta WebGL)");
    expect(aviso).toHaveTextContent("recargá la página");
  });

  it("un error de los tiles de las calles avisa con «Reintentar», deja las zonas y el reintento arma el mapa de nuevo", async () => {
    const { pedidos } = bucket();
    montar();
    await screen.findByTestId("mapa-gl");
    const montajes = doble.montajes;

    act(() => eventos().onError({ error: new Error("Failed to fetch"), sourceId: "protomaps" }));

    expect(screen.getByTestId("mapa-gl")).toBeInTheDocument();
    expect((doble.fuentes.zonas as { features: unknown[] }).features).toHaveLength(CIUDAD.zonas.length);
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos traer las calles del mapa");

    // El protocolo recuerda los pedidos que fallaron: «Reintentar» lo reinicia para que el archivo se pida de nuevo.
    vi.mocked(removeProtocol).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(removeProtocol).toHaveBeenCalledWith("pmtiles");
    await vi.waitFor(() => expect(doble.montajes).toBeGreaterThan(montajes));
    await vi.waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(pedidos.filter((p) => p.endsWith("catalogo.json"))).toHaveLength(1);
  });

  it("los otros errores de MapLibre (una tipografía, un ícono) no ponen ningún aviso", async () => {
    bucket();
    montar();
    await screen.findByTestId("mapa-gl");

    act(() => eventos().onError({ error: new Error("Could not load glyphs") }));
    act(() => eventos().onError({ error: undefined }));

    expect(document.querySelector("[data-aviso-del-mapa]")).toBeNull();
  });

  it("si el mapa no termina de cargar (el worker no se sirvió, la red es lenta) avisa a los 20 s y el aviso se va si después carga", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    bucket();
    montar();
    await vi.waitFor(() => expect(screen.getByTestId("mapa-gl")).toBeInTheDocument());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ESPERA_DEL_MAPA_MS - 1000);
    });
    expect(document.querySelector("[data-aviso-del-mapa]")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    const aviso = document.querySelector("[data-aviso-del-mapa=lento]");
    expect(aviso).toHaveTextContent("El mapa tarda más de lo normal en dibujarse");
    expect(aviso).toHaveTextContent("recargá la página");

    act(() => eventos().onLoad({ target: {} }));
    expect(document.querySelector("[data-aviso-del-mapa]")).toBeNull();
  });

  it("si el mapa carga a tiempo, el plazo no avisa nada", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    bucket();
    montar();
    await vi.waitFor(() => expect(screen.getByTestId("mapa-gl")).toBeInTheDocument());

    act(() => eventos().onLoad({ target: {} }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ESPERA_DEL_MAPA_MS * 2);
    });

    expect(document.querySelector("[data-aviso-del-mapa]")).toBeNull();
  });

  it("volver a entrar a la vista (desmontar y montar) pide de nuevo y no hereda un pedido cancelado", async () => {
    const { pedidos } = bucket();
    const primera = montar();
    primera.unmount();

    montar();
    expect(await screen.findByTestId("mapa-gl")).toBeInTheDocument();
    expect(hayCalles()).toBe(true);
    expect(pedidos.filter((p) => p.endsWith("catalogo.json")).length).toBeGreaterThanOrEqual(1);
  });
});
