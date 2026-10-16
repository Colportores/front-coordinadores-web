import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Punto, VistaPreviaZona } from "@/datos/equipo/zonas";
import { DATOS_ZONAS_SIMULADO, fuenteZonasSimulada } from "@/datos/equipo/zonas/simulado";
import { type AccionesZonas, ZonasCampania } from "@/features/equipo/zonas/ZonasCampania";
import type { PropsMapaZonas } from "@/features/equipo/zonas/tipos";

/**
 * Ronda de fixes del PR #52 (QA de la vista 24): el deslizador de radio del canvas 02 (decisión del 16/10), el «Reintentar» de la
 * vista previa caída, el foco al abrir y al terminar una acción, y el tope de 40 caracteres del nombre.
 */

const mapa = vi.hoisted(() => ({ props: null as PropsMapaZonas | null }));
vi.mock("@/features/equipo/zonas/MapaZonas", () => ({
  MapaZonas: (props: PropsMapaZonas) => {
    mapa.props = props;
    return <div data-testid="mapa" />;
  },
}));

const MONTEVIDEO = DATOS_ZONAS_SIMULADO.ciudades[0];
const ORIGEN: Punto = (MONTEVIDEO.zonas[0].esquinas as Punto[])[0];
const nodo = (v: number, h: number): Punto => ({ lon: ORIGEN.lon + v * 0.0045, lat: ORIGEN.lat - h * 0.004 });
/** Un centro donde un círculo de 400 m no toca ninguna zona existente. */
const CENTRO_LIBRE = nodo(3, 3.4);

function acciones(sobre: Partial<AccionesZonas> = {}): AccionesZonas {
  return {
    esquinaMasCercana: vi.fn((c: string, p: Punto) => fuenteZonasSimulada.esquinaMasCercana(c, p)),
    tramoPorCalles: vi.fn((c: string, a: Punto, b: Punto) => fuenteZonasSimulada.tramoPorCalles(c, a, b)),
    vistaPreviaZona: vi.fn((e) => fuenteZonasSimulada.vistaPreviaZona(e)),
    guardarZona: vi.fn((e) => fuenteZonasSimulada.guardarZona(e)),
    asignarZona: vi.fn(async () => ({ ok: true as const })),
    quitarZona: vi.fn(async () => ({ ok: true as const })),
    eliminarZona: vi.fn((id: string) => fuenteZonasSimulada.eliminarZona("campania-verano-2026", id)),
    buscarCiudades: vi.fn((t: string) => fuenteZonasSimulada.buscarCiudades("campania-verano-2026", t)),
    agregarCiudad: vi.fn((id: string) => fuenteZonasSimulada.agregarCiudad("campania-verano-2026", id)),
    ...sobre,
  };
}

function montar(sobre: Partial<AccionesZonas> = {}) {
  const acc = acciones(sobre);
  render(<ZonasCampania datos={DATOS_ZONAS_SIMULADO} acciones={acc} />);
  return acc;
}

async function clicEnMapa(punto: Punto) {
  await act(async () => {
    mapa.props?.onMapaClick(punto);
  });
}

async function nuevaZonaRadialConCentro() {
  await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
  await clicEnMapa(CENTRO_LIBRE);
  await screen.findByText(/^Incluye \d+ ubicaciones\.$/);
}

const deslizador = () => screen.getByRole("slider", { name: /RADIO/ });
const campoRadio = () => screen.getByRole("spinbutton", { name: /RADIO/ });

afterEach(() => {
  mapa.props = null;
});

describe("deslizador del radio (artboard 02)", () => {
  it("va de 1 a 3000 m de a 1 m, igual que el campo, y los dos se llaman RADIO", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));

    for (const control of [deslizador(), campoRadio()]) {
      expect(control).toHaveAttribute("min", "1");
      expect(control).toHaveAttribute("max", "3000");
      expect(control).toHaveAttribute("step", "1");
    }
  });

  it("está apagado hasta que hay centro, igual que el campo, y marca 400 m", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));

    expect(deslizador()).toBeDisabled();
    expect(campoRadio()).toBeDisabled();

    await clicEnMapa(CENTRO_LIBRE);

    expect(deslizador()).toBeEnabled();
    expect(deslizador()).toHaveValue("400");
    expect(deslizador()).toHaveAttribute("aria-valuetext", "400 m");
  });

  it("moverlo cambia el campo, el círculo del mapa y la vista previa", async () => {
    const acc = montar();
    await nuevaZonaRadialConCentro();
    await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "Casabó");

    fireEvent.change(deslizador(), { target: { value: "750" } });

    expect(campoRadio()).toHaveValue(750);
    expect(deslizador()).toHaveAttribute("aria-valuetext", "750 m");
    expect(mapa.props?.dibujo?.radioM).toBe(750);
    expect(mapa.props?.dibujo?.rotuloCentro?.detalle).toBe("750 m");
    await waitFor(() => expect(acc.vistaPreviaZona).toHaveBeenCalledTimes(2));
    await screen.findByText(/^Incluye \d+ ubicaciones\.$/);
    expect(screen.getByRole("button", { name: "Guardar zona" })).toBeEnabled();
  });

  it("escribir en el campo mueve el deslizador, y arrastrar el borde del mapa también", async () => {
    montar();
    await nuevaZonaRadialConCentro();

    await userEvent.clear(campoRadio());
    await userEvent.type(campoRadio(), "1200");
    expect(deslizador()).toHaveValue("1200");

    await act(async () => mapa.props?.onRadio(900));
    expect(deslizador()).toHaveValue("900");
    expect(campoRadio()).toHaveValue(900);
  });

  it("los extremos son 1 y 3000 m: lo que se pase de largo se acota (Inicio y Fin del teclado llegan ahí)", async () => {
    montar();
    await nuevaZonaRadialConCentro();

    fireEvent.change(deslizador(), { target: { value: "99999" } });
    expect(campoRadio()).toHaveValue(3000);
    expect(mapa.props?.dibujo?.radioM).toBe(3000);

    fireEvent.change(deslizador(), { target: { value: "-5" } });
    expect(campoRadio()).toHaveValue(1);
    expect(mapa.props?.dibujo?.radioM).toBe(1);
  });

  it("con el campo vacío (Guardar apagado) el deslizador lo completa y Guardar se habilita", async () => {
    montar();
    await nuevaZonaRadialConCentro();
    await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "Casabó");
    await userEvent.clear(campoRadio());
    expect(screen.getByRole("button", { name: "Guardar zona" })).toBeDisabled();

    fireEvent.change(deslizador(), { target: { value: "500" } });

    expect(campoRadio()).toHaveValue(500);
    await screen.findByText(/^Incluye \d+ ubicaciones\.$/);
    expect(screen.getByRole("button", { name: "Guardar zona" })).toBeEnabled();
  });

  it("al editar una zona radial arranca en el radio que tiene, y las que son por esquinas no lo muestran", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "Ver la zona Paso de la Arena" }));
    await userEvent.click(screen.getByRole("button", { name: "Editar forma" }));

    expect(deslizador()).toHaveValue("600");
    expect(deslizador()).toBeEnabled();

    await userEvent.click(screen.getByRole("radio", { name: /Por esquinas/ }));
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });
});

describe("la vista previa que no se pudo calcular", () => {
  const PREVIA: VistaPreviaZona = {
    poligonoGeojson: { type: "Polygon", coordinates: [[[-56.2, -34.8], [-56.1, -34.8], [-56.1, -34.7], [-56.2, -34.8]]] } as VistaPreviaZona["poligonoGeojson"],
    ubicacionesIncluidas: 7,
    superposicion: null,
    comparteCalle: null,
  };

  it("si «Reintentar» también falla, el aviso vuelve con su «Reintentar»; con la red de vuelta se calcula y Guardar se habilita", async () => {
    const vistaPreviaZona = vi.fn().mockRejectedValueOnce(new Error("sin red")).mockRejectedValueOnce(new Error("sin red")).mockResolvedValue(PREVIA);
    montar({ vistaPreviaZona });
    await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
    await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "Casabó");
    await clicEnMapa(CENTRO_LIBRE);
    await screen.findByRole("button", { name: "Reintentar" });

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(vistaPreviaZona).toHaveBeenCalledTimes(2));
    await userEvent.click(await screen.findByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Incluye 7 ubicaciones.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar zona" })).toBeEnabled();
  });

  it("el «Reintentar» pide la vista previa con la misma forma, una sola vez por toque", async () => {
    const vistaPreviaZona = vi.fn().mockRejectedValueOnce(new Error("sin red")).mockResolvedValue(PREVIA);
    montar({ vistaPreviaZona });
    await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
    await clicEnMapa(CENTRO_LIBRE);
    await userEvent.click(await screen.findByRole("button", { name: "Reintentar" }));

    await screen.findByText("Incluye 7 ubicaciones.");

    expect(vistaPreviaZona).toHaveBeenCalledTimes(2);
    expect(vistaPreviaZona.mock.calls[1][0]).toEqual(vistaPreviaZona.mock.calls[0][0]);
  });

  it("al cambiar el radio el «Reintentar» ya no está: la vista previa se vuelve a pedir sola", async () => {
    const vistaPreviaZona = vi.fn().mockRejectedValueOnce(new Error("sin red")).mockResolvedValue(PREVIA);
    montar({ vistaPreviaZona });
    await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
    await clicEnMapa(CENTRO_LIBRE);
    await screen.findByRole("button", { name: "Reintentar" });

    fireEvent.change(deslizador(), { target: { value: "800" } });

    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
    expect(await screen.findByText("Incluye 7 ubicaciones.")).toBeInTheDocument();
  });

  it("otros avisos (un rechazo al guardar) no traen «Reintentar»", async () => {
    montar({ guardarZona: vi.fn(async () => ({ ok: false as const, mensaje: "Ya hay una zona con ese nombre." })) });
    await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
    await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "Casabó");
    await clicEnMapa(CENTRO_LIBRE);
    await screen.findByText(/^Incluye \d+ ubicaciones\.$/);

    await userEvent.click(screen.getByRole("button", { name: "Guardar zona" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ya hay una zona con ese nombre.");
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
  });
});

describe("el foco al abrir y al terminar una acción", () => {
  it("guardar una zona nueva deja el foco en el título de su detalle", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
    await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "Casabó");
    await clicEnMapa(CENTRO_LIBRE);
    await screen.findByText(/^Incluye \d+ ubicaciones\.$/);

    await userEvent.click(screen.getByRole("button", { name: "Guardar zona" }));

    const titulo = await screen.findByRole("heading", { name: "Casabó" });
    expect(document.activeElement).toBe(titulo);
  });

  it("al abrir una zona el foco llega a su título y se puede seguir con Tab hasta ✕", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "Ver la zona Paso de la Arena" }));

    const detalle = screen.getByRole("region", { name: "Zona Paso de la Arena" });
    expect(document.activeElement).toBe(within(detalle).getByRole("heading", { name: "Paso de la Arena" }));
    await userEvent.tab();
    expect(detalle.contains(document.activeElement)).toBe(true);
  });

  it("«Editar forma» y «+ Nueva zona» ponen el foco en NOMBRE", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "Ver la zona Paso de la Arena" }));
    await userEvent.click(screen.getByRole("button", { name: "Editar forma" }));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "NOMBRE" }));

    await userEvent.click(screen.getByRole("button", { name: "Cerrar el formulario de zona" }));
    await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "NOMBRE" }));
  });

  it("eliminar una zona devuelve el foco a «+ Nueva zona»", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "Ver la zona Belvedere" }));
    await userEvent.click(screen.getByRole("button", { name: "Editar forma" }));
    await userEvent.click(screen.getByRole("button", { name: "Eliminar zona" }));

    await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar zona" }));

    await screen.findByText(/Zona «Belvedere» eliminada/);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "+ Nueva zona" }));
  });

});

describe("el tope de 40 caracteres del nombre", () => {
  async function conNombre(nombre: string) {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
    await userEvent.click(screen.getByRole("textbox", { name: "NOMBRE" }));
    await userEvent.paste(nombre);
    await clicEnMapa(CENTRO_LIBRE);
    await screen.findByText(/^Incluye \d+ ubicaciones\.$/);
  }

  it("40 emojis entran (80 unidades UTF-16)", async () => {
    await conNombre("🌳".repeat(40));

    expect(screen.queryByText("El nombre puede tener hasta 40 caracteres.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar zona" })).toBeEnabled();
  });

  it("41 emojis no: avisa y no deja guardar", async () => {
    await conNombre("🌳".repeat(41));

    expect(screen.getByRole("alert")).toHaveTextContent("El nombre puede tener hasta 40 caracteres.");
    expect(screen.getByRole("button", { name: "Guardar zona" })).toBeDisabled();
  });

  it("los espacios de los costados no cuentan", async () => {
    await conNombre(`  ${"a".repeat(40)}  `);

    expect(screen.getByRole("button", { name: "Guardar zona" })).toBeEnabled();
  });
});
