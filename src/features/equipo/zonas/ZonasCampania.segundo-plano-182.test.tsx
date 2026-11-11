import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Esquina, Punto, VistaPreviaZona } from "@/datos/equipo/zonas";
import { DATOS_ZONAS_SIMULADO, fuenteZonasSimulada } from "@/datos/equipo/zonas/simulado";
import { ESPERAS } from "@/features/equipo/zonas/esperas";
import { TEXTO_CALCULANDO } from "@/features/equipo/zonas/PanelFormularioZona";
import { type AccionesZonas, ZonasCampania } from "@/features/equipo/zonas/ZonasCampania";
import type { PropsMapaZonas } from "@/features/equipo/zonas/tipos";

/**
 * Issue #182: la zona por esquinas se calcula en segundo plano. Las esquinas se marcan al momento y el borde por las
 * calles (y la vista previa) se pide recién cuando el coordinador deja de marcar, de a un cálculo por vez.
 */

const mapa = vi.hoisted(() => ({ props: null as PropsMapaZonas | null }));
vi.mock("@/features/equipo/zonas/MapaZonas", () => ({
  MapaZonas: (props: PropsMapaZonas) => {
    mapa.props = props;
    return <div data-testid="mapa" />;
  },
}));

const CAMPANIA = "campania-verano-2026";
const ESPERA_MS = 900;
const p = (lon: number, lat: number): Punto => ({ lon, lat });
const esquinaDe = (punto: Punto): Esquina => ({ ...punto, calleA: `Calle ${punto.lon}`, calleB: `Avenida ${punto.lat}` });
/** El tramo por las calles de la red de prueba: pasa por un punto intermedio, así se distingue de la línea recta. */
const porCalles = (a: Punto, b: Punto): Punto[] => [p(a.lon, a.lat), p((a.lon + b.lon) / 2 + 0.5, (a.lat + b.lat) / 2), p(b.lon, b.lat)];

const PREVIA: VistaPreviaZona = {
  poligonoGeojson: { type: "Polygon", coordinates: [[[0, 0], [4, 0], [4, 4], [0, 0]]] },
  ubicacionesIncluidas: 12,
  superposicion: null,
  comparteCalle: null,
};

function acciones(sobre: Partial<AccionesZonas> = {}): AccionesZonas {
  return {
    esquinaMasCercana: vi.fn(async (_c: string, punto: Punto) => esquinaDe(punto)),
    tramoPorCalles: vi.fn(async (_c: string, a: Punto, b: Punto) => porCalles(a, b)),
    vistaPreviaZona: vi.fn(async () => PREVIA),
    guardarZona: vi.fn((e) => fuenteZonasSimulada.guardarZona(e)),
    asignarZona: vi.fn(async () => ({ ok: true as const })),
    quitarZona: vi.fn(async () => ({ ok: true as const })),
    eliminarZona: vi.fn((id: string) => fuenteZonasSimulada.eliminarZona(CAMPANIA, id)),
    buscarCiudades: vi.fn((t: string) => fuenteZonasSimulada.buscarCiudades(CAMPANIA, t)),
    agregarCiudad: vi.fn((id: string) => fuenteZonasSimulada.agregarCiudad(CAMPANIA, id)),
    casasDeZonas: vi.fn(async () => []),
    ...sobre,
  };
}

async function empezarPorEsquinas() {
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "+ Nueva zona" })));
  await act(async () => fireEvent.click(screen.getByRole("radio", { name: /Por esquinas/ })));
  await act(async () => fireEvent.change(screen.getByRole("textbox", { name: "NOMBRE" }), { target: { value: "Santa Catalina" } }));
}

async function montarPorEsquinas(sobre: Partial<AccionesZonas> = {}) {
  const acc = acciones(sobre);
  render(<ZonasCampania datos={DATOS_ZONAS_SIMULADO} acciones={acc} />);
  await empezarPorEsquinas();
  return acc;
}

async function clicEnMapa(punto: Punto) {
  await act(async () => {
    mapa.props?.onMapaClick(punto);
  });
}

async function pasar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const posiciones = () => mapa.props?.dibujo?.esquinas.map(({ lon, lat }) => ({ lon, lat }));
/** La región que anuncia el cálculo: siempre montada, con el texto solo mientras calcula. */
const anuncio = () => document.querySelector<HTMLElement>("[data-calculando-zona]");
const enElMapa = () => document.querySelector<HTMLElement>("[data-calculando-en-mapa]");
const guardar = () => screen.getByRole("button", { name: "Guardar zona" });

const A = p(0, 0);
const B = p(4, 0);
const C = p(4, 4);
const D = p(0, 4);

beforeEach(() => {
  ESPERAS.bordeMs = ESPERA_MS;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  mapa.props = null;
});

describe("zonas por esquinas: la zona se calcula en segundo plano (#182)", () => {
  it("las esquinas se marcan seguidas, al momento, y el borde se pide una sola vez después de la última", async () => {
    const acc = await montarPorEsquinas();

    await clicEnMapa(A);
    expect(anuncio()).toHaveAttribute("aria-live", "polite");
    expect(anuncio()).toBeEmptyDOMElement();
    await clicEnMapa(B);
    await pasar(500);
    await clicEnMapa(C);
    await pasar(500);
    await clicEnMapa(D);

    // Las cuatro están marcadas y unidas por una línea recta provisoria; a la base todavía no se le pidió ningún tramo.
    expect(posiciones()).toEqual([A, B, C, D]);
    expect(screen.getByText("ESQUINAS · 4")).toBeInTheDocument();
    expect(mapa.props?.dibujo?.linea).toEqual([A, B, B, C, C, D]);
    expect(acc.tramoPorCalles).not.toHaveBeenCalled();
    expect(anuncio()).toHaveTextContent(TEXTO_CALCULANDO);
    expect(enElMapa()).toHaveTextContent(TEXTO_CALCULANDO);
    expect(enElMapa()).toHaveAttribute("aria-hidden", "true");

    await pasar(ESPERA_MS - 1);
    expect(acc.tramoPorCalles).not.toHaveBeenCalled();

    await pasar(1);

    expect(acc.tramoPorCalles).toHaveBeenCalledTimes(3);
    expect(mapa.props?.dibujo?.linea).toEqual([...porCalles(A, B), ...porCalles(B, C), ...porCalles(C, D)]);
    expect(anuncio()).toBeEmptyDOMElement();
    expect(enElMapa()).toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("una esquina cada cinco segundos: cada cálculo pide solo el tramo nuevo", async () => {
    const acc = await montarPorEsquinas();
    await clicEnMapa(A);
    await clicEnMapa(B);
    await pasar(5000);
    expect(acc.tramoPorCalles).toHaveBeenCalledTimes(1);

    await clicEnMapa(C);
    await pasar(5000);

    expect(acc.tramoPorCalles).toHaveBeenCalledTimes(2);
    expect(acc.tramoPorCalles).toHaveBeenLastCalledWith(expect.any(String), esquinaDe(B), esquinaDe(C));
  });

  it("al cerrar la forma calcula, muestra la zona y recién ahí habilita «Guardar zona»", async () => {
    const acc = await montarPorEsquinas();
    for (const punto of [A, B, C, A]) await clicEnMapa(punto);

    expect(guardar()).toBeDisabled();
    expect(anuncio()).toHaveTextContent(TEXTO_CALCULANDO);
    expect(acc.vistaPreviaZona).not.toHaveBeenCalled();

    await pasar(ESPERA_MS);

    expect(acc.tramoPorCalles).toHaveBeenCalledTimes(3);
    expect(acc.vistaPreviaZona).toHaveBeenCalledTimes(1);
    expect(mapa.props?.dibujo?.poligono).toEqual(PREVIA.poligonoGeojson);
    expect(screen.getByText("Incluye 12 ubicaciones.")).toBeInTheDocument();
    expect(anuncio()).toBeEmptyDOMElement();
    expect(guardar()).toBeEnabled();
  });

  it("una esquina marcada con un cálculo en vuelo no espera, la respuesta vieja no pisa nada y nunca hay dos cálculos a la vez", async () => {
    const pendientes: { desde: Punto; hasta: Punto; soltar: () => void }[] = [];
    const acc = await montarPorEsquinas({
      tramoPorCalles: vi.fn(
        (_c: string, a: Punto, b: Punto) =>
          new Promise<Punto[]>((listo) => {
            pendientes.push({ desde: a, hasta: b, soltar: () => listo(porCalles(a, b)) });
          }),
      ),
    });
    await clicEnMapa(A);
    await clicEnMapa(B);
    await pasar(ESPERA_MS);
    expect(pendientes).toHaveLength(1);

    // El primer cálculo sigue en vuelo: la esquina nueva se marca igual.
    await clicEnMapa(C);
    expect(posiciones()).toEqual([A, B, C]);
    await pasar(ESPERA_MS);
    // El cálculo de las tres esquinas espera al que está en vuelo.
    expect(pendientes).toHaveLength(1);
    expect(anuncio()).toHaveTextContent(TEXTO_CALCULANDO);

    await act(async () => pendientes[0].soltar());

    // El viejo terminó sin tocar el dibujo; el nuevo aprovecha el tramo que ya llegó y pide solo el que falta.
    expect(pendientes).toHaveLength(2);
    expect(pendientes[1]).toMatchObject({ desde: esquinaDe(B), hasta: esquinaDe(C) });
    expect(anuncio()).toHaveTextContent(TEXTO_CALCULANDO);

    await act(async () => pendientes[1].soltar());

    expect(acc.tramoPorCalles).toHaveBeenCalledTimes(2);
    expect(posiciones()).toEqual([A, B, C]);
    expect(mapa.props?.dibujo?.linea).toEqual([...porCalles(A, B), ...porCalles(B, C)]);
    expect(anuncio()).toBeEmptyDOMElement();
  });

  it("quitar una esquina también espera: dos «×» seguidas disparan un solo cálculo, con las que quedaron", async () => {
    const acc = await montarPorEsquinas();
    for (const punto of [A, B, C, D]) await clicEnMapa(punto);
    await pasar(ESPERA_MS);
    vi.mocked(acc.tramoPorCalles).mockClear();

    await act(async () => mapa.props?.onQuitarEsquina?.(1));
    await pasar(300);
    await act(async () => mapa.props?.onQuitarEsquina?.(1));

    expect(posiciones()).toEqual([A, D]);
    expect(acc.tramoPorCalles).not.toHaveBeenCalled();
    expect(anuncio()).toHaveTextContent(TEXTO_CALCULANDO);

    await pasar(ESPERA_MS);

    expect(acc.tramoPorCalles).toHaveBeenCalledTimes(1);
    expect(acc.tramoPorCalles).toHaveBeenCalledWith(expect.any(String), esquinaDe(A), esquinaDe(D));
    expect(anuncio()).toBeEmptyDOMElement();
  });

  it("si el cálculo se cae por la red, las esquinas quedan, el ícono de carga se apaga y «Reintentar» lo vuelve a pedir", async () => {
    let sinRed = true;
    const acc = await montarPorEsquinas({
      tramoPorCalles: vi.fn(async (_c: string, a: Punto, b: Punto) => {
        if (sinRed) throw new Error("sin red");
        return porCalles(a, b);
      }),
    });
    for (const punto of [A, B, C]) await clicEnMapa(punto);
    await pasar(ESPERA_MS);

    expect(screen.getByRole("alert")).toHaveTextContent("Necesitás conexión para calcular la zona. Revisá la conexión y probá de nuevo.");
    expect(posiciones()).toEqual([A, B, C]);
    expect(anuncio()).toBeEmptyDOMElement();

    // Con el aviso a la vista se puede seguir marcando.
    await clicEnMapa(D);
    expect(posiciones()).toEqual([A, B, C, D]);
    await pasar(ESPERA_MS);
    expect(screen.getByRole("alert")).toHaveTextContent("Necesitás conexión para calcular la zona.");

    sinRed = false;
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Reintentar" })));
    expect(anuncio()).toHaveTextContent(TEXTO_CALCULANDO);
    await pasar(ESPERA_MS);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mapa.props?.dibujo?.linea).toEqual([...porCalles(A, B), ...porCalles(B, C), ...porCalles(C, D)]);
    expect(anuncio()).toBeEmptyDOMElement();
    expect(acc.tramoPorCalles).toHaveBeenCalled();
  });

  it("si la vista previa se cae al cerrar, no queda calculando ni se puede guardar, y «Reintentar» la trae", async () => {
    const vistaPreviaZona = vi.fn<AccionesZonas["vistaPreviaZona"]>(async () => PREVIA);
    vistaPreviaZona.mockRejectedValueOnce(new Error("sin red"));
    await montarPorEsquinas({ vistaPreviaZona });
    for (const punto of [A, B, C, A]) await clicEnMapa(punto);
    await pasar(ESPERA_MS);

    expect(screen.getByRole("alert")).toHaveTextContent("Necesitás conexión para calcular la zona.");
    expect(anuncio()).toBeEmptyDOMElement();
    expect(guardar()).toBeDisabled();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Reintentar" })));
    await pasar(ESPERA_MS);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(guardar()).toBeEnabled();
  });

  it("cancelar con el cálculo en espera no pide nada, y al volver a entrar el dibujo empieza de cero", async () => {
    const acc = await montarPorEsquinas();
    for (const punto of [A, B, C]) await clicEnMapa(punto);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancelar" })));
    await pasar(ESPERA_MS * 2);

    expect(acc.tramoPorCalles).not.toHaveBeenCalled();

    await empezarPorEsquinas();
    expect(posiciones()).toEqual([]);
    expect(anuncio()).toBeEmptyDOMElement();
    await clicEnMapa(A);
    await clicEnMapa(D);
    await pasar(ESPERA_MS);

    expect(acc.tramoPorCalles).toHaveBeenCalledTimes(1);
    expect(mapa.props?.dibujo?.linea).toEqual(porCalles(A, D));
  });

  it("cancelar con un cálculo en vuelo descarta su respuesta: no revive el dibujo ni deja un aviso", async () => {
    let soltar: () => void = () => undefined;
    await montarPorEsquinas({
      tramoPorCalles: vi.fn(
        (_c: string, a: Punto, b: Punto) =>
          new Promise<Punto[]>((listo) => {
            soltar = () => listo(porCalles(a, b));
          }),
      ),
    });
    await clicEnMapa(A);
    await clicEnMapa(B);
    await pasar(ESPERA_MS);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancelar" })));
    await act(async () => soltar());

    expect(mapa.props?.dibujo).toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Nueva zona" })).toBeInTheDocument();
  });

  it("muchas esquinas marcadas de corrido siguen siendo un solo cálculo", async () => {
    const acc = await montarPorEsquinas();
    const muchas = Array.from({ length: 30 }, (_, i) => p(i, i % 2));

    for (const punto of muchas) {
      await clicEnMapa(punto);
      await pasar(100);
    }
    expect(acc.tramoPorCalles).not.toHaveBeenCalled();
    expect(screen.getByText("ESQUINAS · 30")).toBeInTheDocument();

    await pasar(ESPERA_MS);

    expect(acc.tramoPorCalles).toHaveBeenCalledTimes(29);
    expect(anuncio()).toBeEmptyDOMElement();
  });
});
