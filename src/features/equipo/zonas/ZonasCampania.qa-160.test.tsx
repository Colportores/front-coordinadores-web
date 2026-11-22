import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CasaDeCiudad, EstadoDeCasa, Punto } from "@/datos/equipo/zonas";
import { DATOS_ZONAS_SIMULADO, fuenteZonasSimulada } from "@/datos/equipo/zonas/simulado";
import { type AccionesZonas, ZonasCampania } from "@/features/equipo/zonas/ZonasCampania";
import type { PropsMapaZonas } from "@/features/equipo/zonas/tipos";

/** QA del PR #160 (issue #146): casos límite de los puntos de las casas (24P·05 a 24P·08) que los tests del PR no cubrían. */

const mapa = vi.hoisted(() => ({ props: null as PropsMapaZonas | null }));
vi.mock("@/features/equipo/zonas/MapaZonas", () => ({
  MapaZonas: (props: PropsMapaZonas) => {
    mapa.props = props;
    return <div data-testid="mapa" />;
  },
}));

const MONTEVIDEO = DATOS_ZONAS_SIMULADO.ciudades[0];
const LAS_PIEDRAS = DATOS_ZONAS_SIMULADO.ciudades[1];
const ORIGEN: Punto = (MONTEVIDEO.zonas[0].esquinas as Punto[])[0];

const casa = (n: number, estado: EstadoDeCasa): CasaDeCiudad => ({
  id: `casa-${n}`,
  lon: ORIGEN.lon,
  lat: ORIGEN.lat,
  tipo: "CASA",
  estado,
  zonaIds: [],
});
const CINCO = [casa(1, "RECHAZO"), casa(2, "RECHAZO"), casa(3, "VENTA_COMPLETA"), casa(4, "SIN_VISITA"), casa(5, "COBRANZA_PENDIENTE")];

function montar(casasDeLaCiudad: AccionesZonas["casasDeLaCiudad"]) {
  const acciones: AccionesZonas = {
    esquinaMasCercana: vi.fn((c: string, p: Punto) => fuenteZonasSimulada.esquinaMasCercana(c, p)),
    tramoPorCalles: vi.fn((c: string, a: Punto, b: Punto) => fuenteZonasSimulada.tramoPorCalles(c, a, b)),
    vistaPreviaZona: vi.fn((e) => fuenteZonasSimulada.vistaPreviaZona(e)),
    guardarZona: vi.fn((e) => fuenteZonasSimulada.guardarZona(e)),
    asignarZona: vi.fn(async () => ({ ok: true as const })),
    quitarZona: vi.fn(async () => ({ ok: true as const })),
    eliminarZona: vi.fn((id: string) => fuenteZonasSimulada.eliminarZona("campania-verano-2026", id)),
    buscarCiudades: vi.fn(async () => []),
    agregarCiudad: vi.fn(async () => ({ ok: false as const, mensaje: "no" })),
    casasDeLaCiudad,
  };
  render(<ZonasCampania datos={DATOS_ZONAS_SIMULADO} acciones={acciones} />);
}

function pendiente<T>() {
  let resolver: (valor: T) => void = () => undefined;
  const promesa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promesa, resolver };
}

const chip = () => document.querySelector("[data-aviso-de-casas]");

afterEach(() => {
  vi.restoreAllMocks();
  mapa.props = null;
});

describe("QA #146 · casos límite de las casas de la ciudad", () => {
  it("«Reintentar» y la red que vuelve a la vez: no se manda un segundo pedido y la respuesta llega una sola vez", async () => {
    const espera = pendiente<CasaDeCiudad[]>();
    const pedir = vi.fn<AccionesZonas["casasDeLaCiudad"]>().mockRejectedValueOnce(new Error("boom")).mockReturnValueOnce(espera.promesa);
    montar(pedir);
    await userEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    // Vuelve la red mientras el reintento sigue en camino: ya está «Cargando…», no hay nada que volver a pedir.
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(pedir).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(chip()).toHaveTextContent("Cargando las casas de Montevideo…");

    await act(async () => espera.resolver(CINCO));

    expect(mapa.props?.casas?.casas).toHaveLength(5);
    expect(screen.getByText("5 casas")).toBeInTheDocument();
    expect(chip()).toBeNull();
  });

  it("el error de una ciudad no se arrastra a la otra, y al volver se pide de nuevo y se recupera", async () => {
    const pedir = vi
      .fn<AccionesZonas["casasDeLaCiudad"]>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([casa(7, "RECHAZO")])
      .mockResolvedValue(CINCO);
    montar(pedir);
    await screen.findByRole("alert");

    await userEvent.click(screen.getByRole("button", { name: new RegExp(LAS_PIEDRAS.nombre) }));
    await screen.findByText("1 casa");
    expect(screen.queryByRole("alert")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: new RegExp(MONTEVIDEO.nombre) }));
    await screen.findByText("5 casas");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("se corta la red con las casas a la vista, vuelve y la nueva lectura falla: aviso de error con «Reintentar», nunca «Cargando…» eterno", async () => {
    const pedir = vi.fn<AccionesZonas["casasDeLaCiudad"]>().mockResolvedValueOnce(CINCO).mockRejectedValueOnce(new Error("boom")).mockResolvedValue(CINCO);
    montar(pedir);
    await screen.findByText("5 casas");
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(chip()).toHaveTextContent(/Sin conexión\./);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    // Vuelta la red, la segunda lectura falla: aviso de error con salida, sin cargando eterno.
    const alerta = await screen.findByRole("alert");
    await userEvent.click(within(alerta).getByRole("button", { name: "Reintentar" }));
    await screen.findByText("5 casas");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
