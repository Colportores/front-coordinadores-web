import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CasaDeCiudad, DatosZonas, EstadoDeCasa, Punto } from "@/datos/equipo/zonas";
import { DATOS_ZONAS_SIMULADO, fuenteZonasSimulada } from "@/datos/equipo/zonas/simulado";
import { type AccionesZonas, ZonasCampania } from "@/features/equipo/zonas/ZonasCampania";
import type { PropsMapaZonas } from "@/features/equipo/zonas/tipos";

/** Los puntos de las casas en la vista 24 (diseño 24P·01 a 24P·08, HU-CAM-006, issue #44). */

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
const CENTRO_LIBRE: Punto = { lon: ORIGEN.lon + 3 * 0.0045, lat: ORIGEN.lat - 3.4 * 0.004 };

const casa = (n: number, estado: EstadoDeCasa): CasaDeCiudad => ({
  id: `casa-${n}`,
  lon: ORIGEN.lon,
  lat: ORIGEN.lat,
  tipo: "CASA",
  estado,
  zonaIds: [MONTEVIDEO.zonas[0].id],
});
const CINCO: CasaDeCiudad[] = [
  casa(1, "RECHAZO"),
  casa(2, "RECHAZO"),
  casa(3, "VENTA_COMPLETA"),
  casa(4, "SIN_VISITA"),
  casa(5, "COBRANZA_PENDIENTE"),
];

function acciones(sobre: Partial<AccionesZonas> = {}): AccionesZonas {
  return {
    esquinaMasCercana: vi.fn((c: string, p: Punto) => fuenteZonasSimulada.esquinaMasCercana(c, p)),
    tramoPorCalles: vi.fn((c: string, a: Punto, b: Punto) => fuenteZonasSimulada.tramoPorCalles(c, a, b)),
    vistaPreviaZona: vi.fn((e) => fuenteZonasSimulada.vistaPreviaZona(e)),
    guardarZona: vi.fn((e) => fuenteZonasSimulada.guardarZona(e)),
    asignarZona: vi.fn(async () => ({ ok: true as const })),
    quitarZona: vi.fn(async () => ({ ok: true as const })),
    eliminarZona: vi.fn((id: string) => fuenteZonasSimulada.eliminarZona("campania-verano-2026", id)),
    buscarCiudades: vi.fn(async () => []),
    agregarCiudad: vi.fn(async () => ({ ok: false as const, mensaje: "no" })),
    casasDeZonas: vi.fn(async () => CINCO),
    ...sobre,
  };
}

function montar(sobre: Partial<AccionesZonas> = {}, datos: DatosZonas = DATOS_ZONAS_SIMULADO) {
  const acc = acciones(sobre);
  const r = render(<ZonasCampania datos={datos} acciones={acc} />);
  return { acc, contenedor: r.container };
}

/** Una promesa que se resuelve o rechaza cuando el test lo decide. */
function pendiente<T>() {
  let resolver: (valor: T) => void = () => undefined;
  let rechazar: (error: unknown) => void = () => undefined;
  const promesa = new Promise<T>((r, e) => {
    resolver = r;
    rechazar = e;
  });
  return { promesa, resolver, rechazar };
}

const leyenda = () => screen.getByRole("region", { name: "Casas por estado" });
const fila = (nombre: string) => within(leyenda()).getByRole("checkbox", { name: new RegExp(`^${nombre}`) });
const cantidad = (nombre: string) => fila(nombre).closest("label")?.querySelector("span.font-mono")?.textContent;
const chip = () => document.querySelector("[data-aviso-de-casas]");

afterEach(() => {
  vi.restoreAllMocks();
  mapa.props = null;
});

describe("24P·01 · la ciudad con las casas por estado", () => {
  it("pide las casas de todas las zonas de la ciudad y las pasa al mapa", async () => {
    const { acc } = montar();

    await waitFor(() => expect(mapa.props?.casas?.casas).toHaveLength(5));
    expect(acc.casasDeZonas).toHaveBeenCalledWith(MONTEVIDEO.zonas.map((z) => z.id));
    expect(chip()).toBeNull();
  });

  it("la leyenda trae los ocho estados con su cantidad y el total, sin personas ni montos", async () => {
    montar();
    await screen.findByText("5 casas");

    expect(within(leyenda()).getAllByRole("checkbox")).toHaveLength(8);
    expect(cantidad("Rechazó")).toBe("2");
    expect(cantidad("Venta completa")).toBe("1");
    expect(cantidad("Sin visita")).toBe("1");
    expect(cantidad("No contestó")).toBe("0");
    expect(within(leyenda()).getAllByRole("checkbox").every((c) => (c as HTMLInputElement).checked)).toBe(true);
    expect(within(leyenda()).getByText("Círculo: visita. Cuadrado: venta y cobro. Destildar un estado lo saca del mapa.")).toBeInTheDocument();
  });
});

describe("24P·02 · destildar un estado lo saca del mapa", () => {
  it("el total dice «M de N casas», las cantidades de la leyenda no cambian y al volver a tildar vuelven", async () => {
    montar();
    await screen.findByText("5 casas");

    await userEvent.click(fila("Rechazó"));

    expect(screen.getByText("3 de 5 casas")).toBeInTheDocument();
    expect(cantidad("Rechazó")).toBe("2");
    expect(mapa.props?.casas?.casas.map((c) => c.id)).toEqual(["casa-3", "casa-4", "casa-5"]);
    expect(fila("Rechazó")).not.toBeChecked();

    await userEvent.click(fila("Rechazó"));

    expect(screen.getByText("5 casas")).toBeInTheDocument();
    expect(mapa.props?.casas?.casas).toHaveLength(5);
  });

  it("destildar todos deja el mapa sin puntos y la leyenda sigue usable", async () => {
    montar();
    await screen.findByText("5 casas");
    for (const e of ["Sin visita", "Rechazó", "Cobranza pendiente", "Venta completa"]) await userEvent.click(fila(e));

    expect(screen.getByText("0 de 5 casas")).toBeInTheDocument();
    expect(mapa.props?.casas?.casas).toEqual([]);
    expect(chip()).toBeNull();
    await userEvent.click(fila("Venta completa"));
    expect(screen.getByText("1 de 5 casas")).toBeInTheDocument();
  });

  it("lo destildado sigue destildado al cambiar de ciudad y volver", async () => {
    montar();
    await screen.findByText("5 casas");
    await userEvent.click(fila("Rechazó"));

    await userEvent.click(screen.getByRole("button", { name: /Las Piedras/ }));
    await userEvent.click(screen.getByRole("button", { name: /Montevideo/ }));

    await screen.findByText("3 de 5 casas");
    expect(fila("Rechazó")).not.toBeChecked();
  });
});

describe("24P·03 · la casa elegida", () => {
  it("la elección vive en la vista: el mapa recibe cuál es y puede cerrarla", async () => {
    montar();
    await waitFor(() => expect(mapa.props?.casas?.casas).toHaveLength(5));
    expect(mapa.props?.casas?.elegidaId).toBeNull();

    act(() => mapa.props?.casas?.onElegir("casa-3"));
    expect(mapa.props?.casas?.elegidaId).toBe("casa-3");

    act(() => mapa.props?.casas?.onElegir(null));
    expect(mapa.props?.casas?.elegidaId).toBeNull();
  });

  it("al cambiar de ciudad la tarjeta se cierra", async () => {
    montar();
    await waitFor(() => expect(mapa.props?.casas?.casas).toHaveLength(5));
    act(() => mapa.props?.casas?.onElegir("casa-3"));

    await userEvent.click(screen.getByRole("button", { name: /Las Piedras/ }));

    expect(mapa.props?.casas?.elegidaId).toBeNull();
  });
});

describe("24P·04 · las casas agrupadas", () => {
  it("cuando el mapa agrupa, el aviso dice que hay que acercar; cuando deja de agrupar, se va", async () => {
    montar();
    await waitFor(() => expect(mapa.props?.casas?.casas).toHaveLength(5));

    act(() => mapa.props?.casas?.onAgrupadas(true));
    expect(chip()).toHaveTextContent("Acercá el mapa para ver el estado de cada casa.");
    expect(chip()).not.toHaveAttribute("role");
    expect(chip()).toHaveAttribute("aria-live", "polite");

    act(() => mapa.props?.casas?.onAgrupadas(false));
    expect(chip()).toBeNull();
  });
});

describe("24P·05 · cargando los puntos", () => {
  it("avisa que está cargando, deja la leyenda en «–» y apagada, y todo vuelve al llegar las casas", async () => {
    const espera = pendiente<CasaDeCiudad[]>();
    montar({ casasDeZonas: vi.fn(() => espera.promesa) });

    expect(chip()).toHaveTextContent("Cargando las casas de Montevideo…");
    expect(cantidad("Rechazó")).toBe("–");
    expect(fila("Rechazó")).toBeDisabled();
    expect(screen.queryByText(/casas$/)).toBeNull();

    await act(async () => espera.resolver(CINCO));

    expect(chip()).toBeNull();
    expect(cantidad("Rechazó")).toBe("2");
    expect(fila("Rechazó")).toBeEnabled();
  });

  it("el nombre de una ciudad larguísima y sin espacios se parte dentro del aviso, no lo desborda", () => {
    const largo = "Villa".repeat(30);
    const datos = { ...DATOS_ZONAS_SIMULADO, ciudades: [{ ...MONTEVIDEO, nombre: largo }, ...DATOS_ZONAS_SIMULADO.ciudades.slice(1)] };
    montar({ casasDeZonas: vi.fn(() => new Promise<CasaDeCiudad[]>(() => undefined)) }, datos);

    expect(chip()).toHaveTextContent(`Cargando las casas de ${largo}…`);
    expect(chip()?.querySelector("span.wrap-anywhere")).not.toBeNull();
  });

  it("las zonas se pueden usar mientras las casas cargan", async () => {
    montar({ casasDeZonas: vi.fn(() => new Promise<CasaDeCiudad[]>(() => undefined)) });

    expect(screen.getByRole("button", { name: "+ Nueva zona" })).toBeEnabled();
    expect(screen.getByRole("region", { name: "Zonas de Montevideo" })).toBeInTheDocument();
  });
});

describe("24P·06 · sin casas registradas", () => {
  it("dice que todavía no hay casas y la leyenda queda en cero", async () => {
    montar({ casasDeZonas: vi.fn(async () => []) });

    await waitFor(() =>
      expect(chip()).toHaveTextContent(
        "Todavía no hay casas registradas en Montevideo. Aparecen acá cuando los colportores las registran y sincronizan.",
      ),
    );
    expect(screen.getByText("0 casas")).toBeInTheDocument();
    expect(cantidad("Rechazó")).toBe("0");
  });

  it("una ciudad sin zonas no pide nada (las casas llegan por zona) y no dice que no hay casas", async () => {
    const { acc } = montar();
    await screen.findByText("5 casas");
    vi.mocked(acc.casasDeZonas).mockClear();

    await userEvent.click(screen.getByRole("button", { name: /Canelones/ }));

    expect(acc.casasDeZonas).not.toHaveBeenCalled();
    expect(chip()).toBeNull();
    // Sin zonas no hay qué contar: la leyenda no afirma «0 casas» y el panel dice que todavía no hay zonas.
    expect(screen.queryByRole("region", { name: "Casas por estado" })).toBeNull();
    expect(screen.queryByText("0 casas")).toBeNull();
    expect(screen.getByText(/Todavía no hay zonas en Canelones/)).toBeInTheDocument();
    expect(mapa.props?.casas?.casas).toEqual([]);
  });
});

describe("24P·07 · error al traer los puntos", () => {
  it("avisa con una alerta, dice que las zonas se pueden editar igual y deja «Reintentar»", async () => {
    montar({ casasDeZonas: vi.fn(async () => Promise.reject(new Error("boom"))) });

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("No pudimos traer las casas. Las zonas se pueden editar igual.");
    expect(within(alerta).getByRole("button", { name: "Reintentar" })).toBeEnabled();
    expect(cantidad("Rechazó")).toBe("–");
    expect(mapa.props?.casas?.casas).toEqual([]);
    expect(screen.getByRole("button", { name: "+ Nueva zona" })).toBeEnabled();
  });

  it("«Reintentar» vuelve a pedir y, si sale bien, trae las casas; si vuelve a fallar, el botón sigue disponible", async () => {
    const pedir = vi
      .fn<AccionesZonas["casasDeZonas"]>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(CINCO);
    montar({ casasDeZonas: pedir });
    await userEvent.click(await screen.findByRole("button", { name: "Reintentar" }));

    await waitFor(() => expect(pedir).toHaveBeenCalledTimes(2));
    await userEvent.click(await screen.findByRole("button", { name: "Reintentar" }));

    await screen.findByText("5 casas");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(pedir).toHaveBeenCalledTimes(3);
  });

  it("«Reintentar» desaparece mientras vuelve a pedir: un toque doble no manda dos pedidos y la respuesta llega una vez", async () => {
    const espera = pendiente<CasaDeCiudad[]>();
    const pedir = vi.fn<AccionesZonas["casasDeZonas"]>().mockRejectedValueOnce(new Error("boom")).mockReturnValueOnce(espera.promesa);
    montar({ casasDeZonas: pedir });
    const boton = await screen.findByRole("button", { name: "Reintentar" });

    await userEvent.dblClick(boton);

    expect(pedir).toHaveBeenCalledTimes(2);
    expect(chip()).toHaveTextContent("Cargando las casas de Montevideo…");
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
    await act(async () => espera.resolver(CINCO));
    expect(mapa.props?.casas?.casas).toHaveLength(5);
  });
});

describe("24P·08 · sin conexión", () => {
  it("se ven las casas que ya estaban, con la hora en que se trajeron, y al volver la red se piden de nuevo", async () => {
    const { acc } = montar();
    await screen.findByText("5 casas");

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(chip()).toHaveTextContent(/Sin conexión\. Ves las casas como estaban a las \d{2}:\d{2}; no se pueden guardar zonas\.$/);
    expect(chip()).toHaveAttribute("data-aviso-de-casas", "sin-conexion");
    expect(mapa.props?.casas?.casas).toHaveLength(5);
    expect(screen.getByText("5 casas")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(acc.casasDeZonas).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(chip()).toBeNull());
  });

  it("sin red y sin casas traídas todavía no hay nada que mostrar: es el error, con «Reintentar»", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    montar({ casasDeZonas: vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))) });

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos traer las casas.");
  });

  it("si al volver a pedir falla por falta de red, conserva las casas de antes con el aviso", async () => {
    const pedir = vi.fn<AccionesZonas["casasDeZonas"]>().mockResolvedValueOnce(CINCO).mockRejectedValue(new TypeError("Failed to fetch"));
    montar({ casasDeZonas: pedir });
    await screen.findByText("5 casas");
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);

    await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
    await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "Casabó");
    await act(async () => mapa.props?.onMapaClick(CENTRO_LIBRE));
    await screen.findByText(/^Incluye \d+ ubicaciones\.$/);
    await userEvent.click(screen.getByRole("button", { name: "Guardar zona" }));

    await waitFor(() => expect(chip()).toHaveAttribute("data-aviso-de-casas", "sin-conexion"));
    expect(mapa.props?.casas?.casas).toHaveLength(5);
  });
});

describe("cambios de ciudad y de zonas", () => {
  it("la respuesta de una ciudad que ya no está a la vista no pisa a la de la ciudad nueva", async () => {
    const montevideo = pendiente<CasaDeCiudad[]>();
    const lasPiedras = pendiente<CasaDeCiudad[]>();
    const pedir = vi.fn<AccionesZonas["casasDeZonas"]>((ids) => (ids.includes(MONTEVIDEO.zonas[0].id) ? montevideo.promesa : lasPiedras.promesa));
    montar({ casasDeZonas: pedir });

    await userEvent.click(screen.getByRole("button", { name: /Las Piedras/ }));
    await act(async () => lasPiedras.resolver([casa(7, "RECHAZO")]));
    await act(async () => montevideo.resolver(CINCO));

    expect(mapa.props?.casas?.casas.map((c) => c.id)).toEqual(["casa-7"]);
    expect(pedir).toHaveBeenLastCalledWith(LAS_PIEDRAS.zonas.map((z) => z.id));
  });

  it("al elegir otra ciudad no quedan a la vista las casas de la anterior", async () => {
    const lasPiedras = pendiente<CasaDeCiudad[]>();
    montar({ casasDeZonas: vi.fn((ids) => (ids.includes(MONTEVIDEO.zonas[0].id) ? Promise.resolve(CINCO) : lasPiedras.promesa)) });
    await screen.findByText("5 casas");

    await userEvent.click(screen.getByRole("button", { name: /Las Piedras/ }));

    expect(mapa.props?.casas?.casas).toEqual([]);
    expect(chip()).toHaveTextContent("Cargando las casas de Las Piedras…");
  });

  it("al guardar una zona se vuelven a pedir las casas (cambia qué incluye cada una)", async () => {
    const { acc } = montar();
    await screen.findByText("5 casas");
    await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
    await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "Casabó");
    await act(async () => mapa.props?.onMapaClick(CENTRO_LIBRE));
    await screen.findByText(/^Incluye \d+ ubicaciones\.$/);

    await userEvent.click(screen.getByRole("button", { name: "Guardar zona" }));

    await screen.findByRole("region", { name: "Zona Casabó" });
    await waitFor(() => expect(acc.casasDeZonas).toHaveBeenCalledTimes(2));
    expect(vi.mocked(acc.casasDeZonas).mock.calls[1][0]).toHaveLength(MONTEVIDEO.zonas.length + 1);
  });

  it("mientras se dibuja la leyenda no estorba y los puntos siguen en el mapa", async () => {
    montar();
    await screen.findByText("5 casas");

    await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));

    expect(screen.queryByRole("region", { name: "Casas por estado" })).toBeNull();
    expect(mapa.props?.casas?.casas).toHaveLength(5);
    expect(mapa.props?.dibujo).not.toBeNull();
  });
});

describe("accesibilidad (axe A/AA, sin contraste)", () => {
  async function violaciones(nodo: Element) {
    const r = await axe.run(nodo, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      rules: { "color-contrast": { enabled: false } },
    });
    return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);
  }

  it("con las casas cargadas, en la alerta de error y en el aviso de cargando", async () => {
    vi.setConfig({ testTimeout: 60_000 });
    const listo = montar();
    await screen.findByText("5 casas");
    expect(await violaciones(listo.contenedor)).toEqual([]);
  });

  it("la alerta de error", async () => {
    vi.setConfig({ testTimeout: 60_000 });
    const { contenedor } = montar({ casasDeZonas: vi.fn(async () => Promise.reject(new Error("boom"))) });
    await screen.findByRole("alert");
    expect(await violaciones(contenedor)).toEqual([]);
  });

  it("el aviso de cargando", async () => {
    vi.setConfig({ testTimeout: 60_000 });
    const { contenedor } = montar({ casasDeZonas: vi.fn(() => new Promise<CasaDeCiudad[]>(() => undefined)) });
    expect(chip()).not.toBeNull();
    expect(await violaciones(contenedor)).toEqual([]);
  });
});
