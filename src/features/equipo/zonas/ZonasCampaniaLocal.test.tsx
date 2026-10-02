import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DATOS_ZONAS_SIMULADO } from "@/datos/equipo/zonas/simulado";
import { ZonasCampaniaLocal } from "@/features/equipo/zonas/ZonasCampaniaLocal";

vi.mock("@/features/equipo/zonas/MapaZonas", () => ({ MapaZonas: () => <div data-testid="mapa" /> }));

describe("ZonasCampaniaLocal (vista 24 en el sitio de prueba)", () => {
  it("muestra la vista con los datos que recibe", () => {
    render(<ZonasCampaniaLocal datos={DATOS_ZONAS_SIMULADO} />);

    expect(screen.getByRole("heading", { name: "Zonas · Verano 2026" })).toBeInTheDocument();
    expect(screen.getByTestId("mapa")).toBeInTheDocument();
  });

  it("las acciones le hablan a la fuente simulada desde el navegador: busca y agrega una ciudad", async () => {
    render(<ZonasCampaniaLocal datos={DATOS_ZONAS_SIMULADO} />);

    await userEvent.click(screen.getByRole("button", { name: /\+ Agregar ciudad/ }));
    await userEvent.type(screen.getByRole("searchbox", { name: /BUSCAR POR NOMBRE O PROVINCIA/ }), "salto");
    await userEvent.click(await screen.findByRole("button", { name: /^Agregar Salto/ }));

    const ciudades = screen.getByRole("navigation", { name: "Ciudades de la campaña" });
    expect(await within(ciudades).findByRole("button", { name: /Salto/ })).toBeInTheDocument();
  });
});
