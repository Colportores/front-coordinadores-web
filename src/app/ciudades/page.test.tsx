import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import ErrorZonas from "@/app/ciudades/error";
import CargandoZonas from "@/app/ciudades/loading";
import ZonasPagina from "@/app/ciudades/page";
import { fuenteZonas } from "@/datos/equipo/zonas";
import { DATOS_ZONAS_SIMULADO } from "@/datos/equipo/zonas/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";
import type { AccionesZonas } from "@/features/equipo/zonas/ZonasCampania";

vi.mock("@/features/equipo/zonas/MapaZonas", () => ({ MapaZonas: () => <div data-testid="mapa" /> }));

/** Baja por el árbol de la página hasta el componente de la vista y devuelve sus props. */
function propsDeLaVista(jsx: ReactElement): { acciones: AccionesZonas } {
  let actual: unknown = jsx;
  while (isValidElement(actual)) {
    const props = actual.props as { acciones?: AccionesZonas; children?: unknown };
    if (props.acciones) return { acciones: props.acciones };
    actual = props.children;
  }
  throw new Error("No se encontró la vista dentro de la página");
}

describe("ZonasPagina", () => {
  it("arma la vista 24 con el título de la pestaña, la campaña y las ciudades", async () => {
    const jsx = await ZonasPagina();
    render(<ProveedorModoDev activo={false}>{jsx}</ProveedorModoDev>);

    expect(screen.getByRole("heading", { level: 1, name: "Ciudades" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Zonas · Verano 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Montevideo/ })).toBeInTheDocument();
    expect(screen.getByTestId("mapa")).toBeInTheDocument();
  });

  it("al elegir otra campaña (la página se vuelve a pedir) la vista arranca de cero con las ciudades de la nueva (#70)", async () => {
    const ciudad = DATOS_ZONAS_SIMULADO.ciudades[0];
    vi.spyOn(fuenteZonas, "obtenerZonas")
      .mockResolvedValueOnce({ ...DATOS_ZONAS_SIMULADO, campaniaId: "campania-a", campania: "Campaña A", ciudades: [{ ...ciudad, nombre: "Ciudad de A" }] })
      .mockResolvedValueOnce({ ...DATOS_ZONAS_SIMULADO, campaniaId: "campania-b", campania: "Campaña B", ciudades: [{ ...ciudad, nombre: "Ciudad de B" }] });

    const { rerender } = render(<ProveedorModoDev activo={false}>{await ZonasPagina()}</ProveedorModoDev>);
    expect(screen.getByRole("button", { name: /Ciudad de A/ })).toBeInTheDocument();

    rerender(<ProveedorModoDev activo={false}>{await ZonasPagina()}</ProveedorModoDev>);

    expect(screen.getByRole("heading", { name: "Zonas · Campaña B" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ciudad de B/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ciudad de A/ })).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("sin una campaña con la que armar zonas (la fuente devuelve null) lo dice, sin mapa ni «+ Nueva zona»", async () => {
    vi.spyOn(fuenteZonas, "obtenerZonas").mockResolvedValueOnce(null);

    const jsx = await ZonasPagina();
    render(<ProveedorModoDev activo={false}>{jsx}</ProveedorModoDev>);

    expect(screen.getByRole("heading", { level: 1, name: "Ciudades" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No tenés una campaña en curso ni por empezar.");
    expect(screen.queryByTestId("mapa")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Nueva zona" })).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("en modo dev marca la sección con la HU-CAM-006", async () => {
    const jsx = await ZonasPagina();
    const { container } = render(<ProveedorModoDev activo>{jsx}</ProveedorModoDev>);

    expect(container.querySelector('[data-hu="HU-CAM-006"]')).not.toBeNull();
  });

  it("las acciones de la vista hablan con la fuente de datos, y «asignar» lo hace en la campaña de la página", async () => {
    const { acciones } = propsDeLaVista(await ZonasPagina());
    const ciudad = DATOS_ZONAS_SIMULADO.ciudades[0];
    const origen = { lon: ciudad.centro.lon, lat: ciudad.centro.lat };

    expect((await acciones.esquinaMasCercana(ciudad.id, origen)).calleA).toBeTruthy();
    expect((await acciones.tramoPorCalles(ciudad.id, origen, origen)).length).toBeGreaterThan(0);
    expect(
      await acciones.vistaPreviaZona({ ciudadId: ciudad.id, forma: { tipoForma: "RADIAL", centro: origen, radioM: 200 } }),
    ).toMatchObject({ poligonoGeojson: { type: "Polygon" } });
    expect(
      await acciones.guardarZona({ ciudadId: ciudad.id, nombre: "", forma: { tipoForma: "RADIAL", centro: origen, radioM: 200 } }),
    ).toEqual({ ok: false, mensaje: "Poné un nombre para la zona." });
    expect(await acciones.asignarZona("col-5", "zona-belvedere")).toEqual({ ok: true });
    expect(await acciones.asignarZona("col-7", "zona-belvedere")).toMatchObject({ ok: false });
    expect(await acciones.quitarZona("col-1")).toEqual({ ok: true });
    expect(await acciones.eliminarZona("zona-belvedere")).toEqual({ ok: true, colportoresSinZona: 0 });
    expect((await acciones.buscarCiudades("salto")).map((c) => c.nombre)).toEqual(["Salto"]);
    expect(await acciones.agregarCiudad("cat-salto")).toMatchObject({ ok: true });
  });
});

describe("carga y error de la ruta de zonas", () => {
  it("mientras trae las zonas dice que está cargando", () => {
    render(<CargandoZonas />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando las zonas de la campaña…");
  });

  it("si no las puede traer avisa qué hacer y deja reintentar", async () => {
    const retry = vi.fn();
    render(<ErrorZonas error={new Error("sin red")} retry={retry} />);

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar las zonas de la campaña. Revisá tu conexión y probá de nuevo.");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("«Reintentar» usa `retry` (vuelve a pedir los datos) y no `reset` (solo repinta el error guardado)", async () => {
    const retry = vi.fn();
    const reset = vi.fn();
    // Next 16 le pasa las dos al boundary; el spread evita que el tipo de la vista (que ya no pide `reset`) lo rechace.
    const props = { error: new Error("sin red"), retry, reset };
    render(<ErrorZonas {...props} />);

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });
});
