import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Esquina, Punto, VistaPreviaZona } from "@/datos/equipo/zonas";
import { DATOS_ZONAS_SIMULADO, fuenteZonasSimulada } from "@/datos/equipo/zonas/simulado";
import { type AccionesZonas, ZonasCampania } from "@/features/equipo/zonas/ZonasCampania";
import type { PropsMapaZonas } from "@/features/equipo/zonas/tipos";

/**
 * Issue #182: la «×» de cada esquina del mapa quita esa esquina, no la última. Las demás se renumeran y el borde se
 * vuelve a calcular con las que quedan.
 */

const mapa = vi.hoisted(() => ({ props: null as PropsMapaZonas | null }));
vi.mock("@/features/equipo/zonas/MapaZonas", () => ({
  MapaZonas: (props: PropsMapaZonas) => {
    mapa.props = props;
    return <div data-testid="mapa" />;
  },
}));

const CAMPANIA = "campania-verano-2026";
const p = (lon: number, lat: number): Punto => ({ lon, lat });
/** La esquina de un punto de la red de prueba: sus calles se llaman como sus coordenadas. */
const esquinaDe = (punto: Punto): Esquina => ({ ...punto, calleA: `Calle ${punto.lon}`, calleB: `Avenida ${punto.lat}` });

const PREVIA: VistaPreviaZona = {
  poligonoGeojson: { type: "Polygon", coordinates: [[[0, 0], [4, 0], [4, 4], [0, 0]]] },
  ubicacionesIncluidas: 12,
  superposicion: null,
  comparteCalle: null,
};

/** Una red sin vueltas: el tramo entre dos esquinas es la línea recta. */
function acciones(sobre: Partial<AccionesZonas> = {}): AccionesZonas {
  return {
    esquinaMasCercana: vi.fn(async (_c: string, punto: Punto) => esquinaDe(punto)),
    tramoPorCalles: vi.fn(async (_c: string, a: Punto, b: Punto) => [p(a.lon, a.lat), p(b.lon, b.lat)]),
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

async function montarPorEsquinas(sobre: Partial<AccionesZonas> = {}) {
  const acc = acciones(sobre);
  render(<ZonasCampania datos={DATOS_ZONAS_SIMULADO} acciones={acc} />);
  await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
  await userEvent.click(screen.getByRole("radio", { name: /Por esquinas/ }));
  await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "Santa Catalina");
  return acc;
}

async function clicEnMapa(punto: Punto) {
  await act(async () => {
    mapa.props?.onMapaClick(punto);
  });
}

async function quitarEnMapa(posicion: number) {
  await act(async () => {
    mapa.props?.onQuitarEsquina?.(posicion);
  });
}

const posiciones = () => mapa.props?.dibujo?.esquinas.map(({ lon, lat }) => ({ lon, lat }));

const A = p(0, 0);
const B = p(4, 0);
const C = p(4, 4);
const D = p(0, 4);

afterEach(() => {
  mapa.props = null;
});

describe("zonas por esquinas: quitar una esquina puntual (#182)", () => {
  it("la «×» de una esquina del medio saca esa, renumera las demás y rehace el borde con las que quedan", async () => {
    await montarPorEsquinas();
    for (const punto of [A, B, C, D]) await clicEnMapa(punto);
    expect(screen.getByText("ESQUINAS · 4")).toBeInTheDocument();

    await quitarEnMapa(1);

    expect(posiciones()).toEqual([A, C, D]);
    expect(screen.getByText("ESQUINAS · 3")).toBeInTheDocument();
    expect(screen.queryByText("Calle 4 y Avenida 0")).not.toBeInTheDocument();
    await waitFor(() => expect(mapa.props?.dibujo?.linea).toEqual([A, C, C, D]));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("la «×» de la esquina 1 deja a la 2 como primera, y la forma se sigue pudiendo cerrar ahí", async () => {
    await montarPorEsquinas();
    for (const punto of [A, B, C, D]) await clicEnMapa(punto);

    await quitarEnMapa(0);
    expect(posiciones()).toEqual([B, C, D]);
    await waitFor(() => expect(mapa.props?.dibujo?.linea).toEqual([B, C, C, D]));

    await clicEnMapa(B);

    await waitFor(() => expect(screen.getByText("Incluye 12 ubicaciones.")).toBeInTheDocument());
    expect(posiciones()).toEqual([B, C, D]);
    expect(screen.getByRole("button", { name: "Guardar zona" })).toBeEnabled();
  });

  it("una forma cerrada sigue cerrada si le quedan tres esquinas: se vuelve a calcular y se puede guardar", async () => {
    const acc = await montarPorEsquinas();
    for (const punto of [A, B, C, D, A]) await clicEnMapa(punto);
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar zona" })).toBeEnabled());
    const pedidas = vi.mocked(acc.vistaPreviaZona).mock.calls.length;

    await quitarEnMapa(2);

    expect(posiciones()).toEqual([A, B, D]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar zona" })).toBeEnabled());
    expect(vi.mocked(acc.vistaPreviaZona).mock.calls.length).toBe(pedidas + 1);
    expect(vi.mocked(acc.vistaPreviaZona).mock.lastCall?.[0].forma).toMatchObject({
      tipoForma: "ESQUINAS",
      cerrada: true,
      esquinas: [esquinaDe(A), esquinaDe(B), esquinaDe(D)],
    });
  });

  it("una forma cerrada de tres esquinas se reabre al quitarle una: con dos no hay zona", async () => {
    await montarPorEsquinas();
    for (const punto of [A, B, C, A]) await clicEnMapa(punto);
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar zona" })).toBeEnabled());

    await quitarEnMapa(1);

    expect(posiciones()).toEqual([A, C]);
    expect(screen.getByRole("button", { name: "Guardar zona" })).toBeDisabled();
    expect(mapa.props?.dibujo?.poligono).toBeNull();
    await waitFor(() => expect(mapa.props?.dibujo?.linea).toEqual([A, C]));
  });

  it("dos «×» seguidas sacan las dos esquinas que se tocaron, no la que quedó con ese número", async () => {
    await montarPorEsquinas();
    for (const punto of [A, B, C, D]) await clicEnMapa(punto);

    // Las dos en el mismo turno, con los números que se veían: la 2 (B) y la 3 (C).
    await act(async () => {
      mapa.props?.onQuitarEsquina?.(1);
      mapa.props?.onQuitarEsquina?.(2);
    });

    expect(posiciones()).toEqual([A, D]);
  });

  it("el «Quitar» del formulario sigue sacando la última", async () => {
    await montarPorEsquinas();
    for (const punto of [A, B, C]) await clicEnMapa(punto);

    await userEvent.click(screen.getByRole("button", { name: "Quitar" }));

    expect(posiciones()).toEqual([A, B]);
  });

  it("mientras guarda, el mapa no ofrece quitar esquinas", async () => {
    let soltar: () => void = () => undefined;
    const acc = await montarPorEsquinas({
      guardarZona: vi.fn(
        () =>
          new Promise<never>((_, rechazar) => {
            soltar = () => rechazar(new Error("sin red"));
          }),
      ),
    });
    for (const punto of [A, B, C, A]) await clicEnMapa(punto);
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar zona" })).toBeEnabled());
    expect(mapa.props?.onQuitarEsquina).toBeDefined();

    await userEvent.click(screen.getByRole("button", { name: "Guardar zona" }));

    expect(acc.guardarZona).toHaveBeenCalledTimes(1);
    expect(mapa.props?.onQuitarEsquina).toBeUndefined();

    // La falla a mitad del guardado devuelve todo: las esquinas siguen y se pueden volver a quitar.
    await act(async () => soltar());
    expect(posiciones()).toEqual([A, B, C]);
    expect(mapa.props?.onQuitarEsquina).toBeDefined();
  });
});
