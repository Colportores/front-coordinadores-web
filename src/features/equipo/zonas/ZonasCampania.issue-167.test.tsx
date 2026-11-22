import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatosZonas, Punto } from "@/datos/equipo/zonas";
import { DATOS_ZONAS_SIMULADO, fuenteZonasSimulada } from "@/datos/equipo/zonas/simulado";
import {
  type AccionesZonas,
  TEXTO_ESQUINAS_SIN_CONECTAR,
  TEXTO_SIN_CIUDADES,
  ZonasCampania,
} from "@/features/equipo/zonas/ZonasCampania";
import type { PropsMapaZonas } from "@/features/equipo/zonas/tipos";

/** Issue #167: lo que el recorrido del manual encontró en «Ciudades» (campaña sin ciudades y zonas por esquinas). */

const mapa = vi.hoisted(() => ({ props: null as PropsMapaZonas | null }));
vi.mock("@/features/equipo/zonas/MapaZonas", () => ({
  MapaZonas: (props: PropsMapaZonas) => {
    mapa.props = props;
    return <div data-testid="mapa" />;
  },
}));

const CAMPANIA = "campania-verano-2026";
const SIN_CIUDADES: DatosZonas = { campaniaId: CAMPANIA, campania: "Verano 2026", ciudades: [] };
const SIN_ESQUINAS: DatosZonas = { ...DATOS_ZONAS_SIMULADO, esquinasDisponibles: false };
const PUNTO: Punto = { lon: -56.25, lat: -34.86 };

function acciones(sobre: Partial<AccionesZonas> = {}): AccionesZonas {
  // Como en el panel conectado: la esquina, el tramo y guardar por esquinas tiran (`FuncionSinConectar`).
  const sinConectar = () => Promise.reject(new Error("todavía no está conectada"));
  return {
    esquinaMasCercana: vi.fn(sinConectar),
    tramoPorCalles: vi.fn(sinConectar),
    vistaPreviaZona: vi.fn((e) => fuenteZonasSimulada.vistaPreviaZona(e)),
    guardarZona: vi.fn((e) => (e.forma.tipoForma === "ESQUINAS" ? sinConectar() : fuenteZonasSimulada.guardarZona(e))),
    asignarZona: vi.fn(async () => ({ ok: true as const })),
    quitarZona: vi.fn(async () => ({ ok: true as const })),
    eliminarZona: vi.fn((id: string) => fuenteZonasSimulada.eliminarZona(CAMPANIA, id)),
    buscarCiudades: vi.fn((t: string) => fuenteZonasSimulada.buscarCiudades(CAMPANIA, t)),
    agregarCiudad: vi.fn((id: string) => fuenteZonasSimulada.agregarCiudad(CAMPANIA, id)),
    casasDeZonas: vi.fn(async () => []),
    ...sobre,
  };
}

function montar(datos: DatosZonas, sobre: Partial<AccionesZonas> = {}) {
  const acc = acciones(sobre);
  render(<ZonasCampania datos={datos} acciones={acc} />);
  return acc;
}

afterEach(() => {
  mapa.props = null;
});

describe("ZonasCampania · campaña sin ciudades (#167)", () => {
  it("no queda en blanco: título, «+ Agregar ciudad» y un aviso que dice qué hacer, sin mapa ni lista de ciudades", () => {
    montar(SIN_CIUDADES);

    expect(screen.getByRole("heading", { name: "Zonas · Verano 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Agregar ciudad" })).toBeEnabled();
    expect(screen.getByText(TEXTO_SIN_CIUDADES)).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Ciudades de la campaña" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("mapa")).not.toBeInTheDocument();
  });

  it("agregar la primera ciudad la deja elegida, con su lista de zonas y el mapa, y el aviso se va", async () => {
    const acc = montar(SIN_CIUDADES);

    await userEvent.click(screen.getByRole("button", { name: "+ Agregar ciudad" }));
    const buscador = screen.getByRole("region", { name: "Agregar ciudad" });
    await userEvent.click(await within(buscador).findByRole("button", { name: "Agregar Salto, Salto" }));

    await screen.findByText("«Salto» se agregó a la campaña.");
    expect(acc.agregarCiudad).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(TEXTO_SIN_CIUDADES)).not.toBeInTheDocument();
    const ciudades = screen.getByRole("navigation", { name: "Ciudades de la campaña" });
    expect(within(ciudades).getByRole("button", { name: /Salto/ })).toHaveAttribute("aria-current", "true");
    await waitFor(() => expect(within(ciudades).getByRole("button", { name: /Salto/ })).toHaveFocus());
    expect(screen.getByTestId("mapa")).toBeInTheDocument();
  });

  it("si agregar falla por la red, el aviso de la campaña sin ciudades sigue y el buscador vuelve a dejar elegir", async () => {
    const acc = montar(SIN_CIUDADES, { agregarCiudad: vi.fn(() => Promise.reject(new TypeError("fetch failed"))) });

    await userEvent.click(screen.getByRole("button", { name: "+ Agregar ciudad" }));
    const buscador = screen.getByRole("region", { name: "Agregar ciudad" });
    await userEvent.click(await within(buscador).findByRole("button", { name: "Agregar Salto, Salto" }));

    await within(buscador).findByText(/Necesitás conexión para agregar la ciudad/);
    expect(screen.getByText(TEXTO_SIN_CIUDADES)).toBeInTheDocument();
    expect(within(buscador).getByRole("button", { name: "Agregar Salto, Salto" })).toBeEnabled();
    expect(acc.agregarCiudad).toHaveBeenCalledTimes(1);
  });
});

describe("ZonasCampania · zonas por esquinas sin conectar (#167)", () => {
  async function empezarPorEsquinas() {
    await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
    await userEvent.click(screen.getByRole("radio", { name: /Por esquinas/ }));
  }

  it("al elegir «Por esquinas» dice la causa real, no culpa a la conexión", async () => {
    montar(SIN_ESQUINAS);

    await empezarPorEsquinas();

    expect(screen.getByRole("alert")).toHaveTextContent(TEXTO_ESQUINAS_SIN_CONECTAR);
    expect(screen.queryByText(/Necesitás conexión/)).not.toBeInTheDocument();
  });

  it("un clic en el mapa no pide la esquina y repite el mismo aviso (dos clics seguidos tampoco)", async () => {
    const acc = montar(SIN_ESQUINAS);
    await empezarPorEsquinas();

    await act(async () => {
      mapa.props?.onMapaClick(PUNTO);
      mapa.props?.onMapaClick(PUNTO);
    });
    await act(async () => {
      mapa.props?.onMapaMove(PUNTO);
    });

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(TEXTO_ESQUINAS_SIN_CONECTAR));
    expect(acc.esquinaMasCercana).not.toHaveBeenCalled();
    expect(screen.queryByText(/Necesitás conexión/)).not.toBeInTheDocument();
  });

  it("al volver a «Radial» el aviso se va y la zona radial se dibuja como siempre", async () => {
    montar(SIN_ESQUINAS);
    await empezarPorEsquinas();

    await userEvent.click(screen.getByRole("radio", { name: /Radial/ }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await act(async () => {
      mapa.props?.onMapaClick(PUNTO);
    });
    expect(mapa.props?.dibujo?.centro).toEqual(PUNTO);
  });

  it("editar la forma de una zona por esquinas avisa lo mismo y no pide la vista previa", async () => {
    const acc = montar(SIN_ESQUINAS);

    await userEvent.click(screen.getByRole("button", { name: "Ver la zona Cerro Norte" }));
    await userEvent.click(screen.getByRole("button", { name: "Editar forma" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(TEXTO_ESQUINAS_SIN_CONECTAR);
    await new Promise((r) => setTimeout(r, 700));
    expect(acc.vistaPreviaZona).not.toHaveBeenCalled();
  });

  it("con la fuente que sí las tiene (sin `esquinasDisponibles: false`) no hay aviso al elegirlas", async () => {
    montar(DATOS_ZONAS_SIMULADO, {
      esquinaMasCercana: vi.fn((c: string, p: Punto) => fuenteZonasSimulada.esquinaMasCercana(c, p)),
    });

    await empezarPorEsquinas();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
