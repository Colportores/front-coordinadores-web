import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { DatosHoras } from "@/datos/reportes/contrato";

import { colportor, datosDePrueba, horasConstantes } from "./datos-de-prueba";
import { ReporteHoras } from "./ReporteHoras";

const lista = () => screen.getByRole("navigation", { name: "Ciudades" });
const textoDeFilas = () =>
  within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((f) => f.textContent ?? "");

/** Colportores sin zona (decisión de Cristian del 23/10): un grupo «Sin zona asignada» al final, sin departamento. */
function conSinZona(): DatosHoras {
  const datos = datosDePrueba();
  return {
    ...datos,
    ciudades: [
      ...datos.ciudades,
      {
        id: "sin-zona",
        nombre: "Sin zona asignada",
        departamento: null,
        colportores: [colportor("diego", "Diego Machado", horasConstantes("2026-10-05", "2026-10-21", 2))],
      },
    ],
  };
}

describe("ReporteHoras · colportores sin zona", () => {
  it("el grupo «Sin zona asignada» va al final de la lista y suma en «Todas las ciudades»", () => {
    render(<ReporteHoras datos={conSinZona()} />);

    const botones = within(lista())
      .getAllByRole("button")
      .map((b) => b.textContent ?? "");
    expect(botones[botones.length - 1]).toMatch(/^Sin zona asignada/);
    expect(botones[botones.length - 1]).toContain("1 colportor");
    expect(screen.getByText("5 colportores · S2 contra S1")).toBeInTheDocument();
    expect(textoDeFilas().some((f) => f.includes("Diego Machado"))).toBe(true);
  });

  it("al elegir «Sin zona asignada» se ven solo sus colportores, y ninguna ciudad los suma", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={conSinZona()} />);

    await user.click(within(lista()).getByRole("button", { name: /^Sin zona asignada/ }));
    expect(screen.getByRole("heading", { level: 2, name: "Sin zona asignada" })).toBeInTheDocument();
    expect(textoDeFilas()).toHaveLength(1);

    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    expect(textoDeFilas().some((f) => f.includes("Diego Machado"))).toBe(false);
  });
});
