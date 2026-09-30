import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import ErrorZonas from "@/app/equipo/zonas/error";
import CargandoZonas from "@/app/equipo/zonas/loading";
import ZonasPagina from "@/app/equipo/zonas/page";
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

    expect(screen.getByRole("heading", { level: 1, name: "Zonas de la campaña" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Zonas · Verano 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Montevideo/ })).toBeInTheDocument();
    expect(screen.getByTestId("mapa")).toBeInTheDocument();
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
      (await acciones.vistaPreviaZona({ ciudadId: ciudad.id, forma: { tipoForma: "RADIAL", centro: origen, radioM: 200 } })).poligonoGeojson.type,
    ).toBe("Polygon");
    expect(
      await acciones.guardarZona({ ciudadId: ciudad.id, nombre: "", forma: { tipoForma: "RADIAL", centro: origen, radioM: 200 } }),
    ).toEqual({ ok: false, mensaje: "Poné un nombre para la zona." });
    expect(await acciones.asignarZona("col-5", "zona-belvedere")).toEqual({ ok: true });
  });
});

describe("carga y error de la ruta de zonas", () => {
  it("mientras trae las zonas dice que está cargando", () => {
    render(<CargandoZonas />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando las zonas de la campaña…");
  });

  it("si no las puede traer avisa qué hacer y deja reintentar", async () => {
    const reset = vi.fn();
    render(<ErrorZonas error={new Error("sin red")} reset={reset} />);

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar las zonas de la campaña. Revisá tu conexión y probá de nuevo.");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
