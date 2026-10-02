import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import ZonasPagina from "@/app/ciudades/page";
import type * as ModuloZonas from "@/datos/equipo/zonas";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";

vi.mock("@/features/equipo/zonas/MapaZonas", () => ({ MapaZonas: () => <div data-testid="mapa" /> }));

// El selector explota si alguien lo usa: el sitio de prueba tiene que ser siempre la fuente simulada,
// aunque el día de mañana `index.ts` apunte a la real.
vi.mock("@/datos/equipo/zonas", async (importOriginal) => ({
  ...(await importOriginal<typeof ModuloZonas>()),
  fuenteZonas: new Proxy(
    {},
    {
      get() {
        throw new Error("El sitio de prueba no puede usar el selector de fuente: tiene que ser siempre la simulada.");
      },
    },
  ),
}));

/** ¿Algún elemento del árbol de la página lleva una prop `acciones` (las server actions de la vista)? */
function tieneAcciones(jsx: ReactElement): boolean {
  let actual: unknown = jsx;
  while (isValidElement(actual)) {
    const props = actual.props as { acciones?: unknown; children?: unknown };
    if (props.acciones) return true;
    actual = props.children;
  }
  return false;
}

describe("ZonasPagina en el build del sitio de prueba (export estático, sin servidor)", () => {
  it("arma la misma vista con la fuente simulada, sin server actions ni el selector de fuente", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
    const jsx = await ZonasPagina();
    render(<ProveedorModoDev activo={false}>{jsx}</ProveedorModoDev>);

    expect(screen.getByRole("heading", { level: 1, name: "Ciudades" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Zonas · Verano 2026" })).toBeInTheDocument();
    expect(tieneAcciones(jsx)).toBe(false);
  });

  it("las acciones las arma el navegador contra la simulada: busca y agrega una ciudad", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
    render(<ProveedorModoDev activo={false}>{await ZonasPagina()}</ProveedorModoDev>);

    await userEvent.click(screen.getByRole("button", { name: /\+ Agregar ciudad/ }));
    await userEvent.type(screen.getByRole("searchbox", { name: /BUSCAR POR NOMBRE O PROVINCIA/ }), "salto");
    await userEvent.click(await screen.findByRole("button", { name: /^Agregar Salto/ }));

    const ciudades = screen.getByRole("navigation", { name: "Ciudades de la campaña" });
    expect(await within(ciudades).findByRole("button", { name: /Salto/ })).toBeInTheDocument();
  });
});
