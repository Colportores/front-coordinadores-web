import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TEXTO_ACCION_NO_DISPONIBLE } from "@/components/AccionNoDisponible";
import { DATOS_EQUIPO_SIMULADO } from "@/datos/equipo/simulado";
import { PreciosPorZona } from "@/features/equipo/PreciosPorZona";

describe("PreciosPorZona", () => {
  it("muestra el precio base y el precio de zona de cada producto, con 'Editar' marcado como no disponible", () => {
    render(<PreciosPorZona productos={DATOS_EQUIPO_SIMULADO.preciosPorZona} />);

    expect(screen.getByText("Precios por zona")).toBeInTheDocument();
    expect(screen.getByText("Vida Sana · 3 tomos")).toBeInTheDocument();
    expect(screen.getByText("base $U 2.900")).toBeInTheDocument();
    expect(screen.getByText("$U 3.100")).toBeInTheDocument();
    const editar = screen.getByRole("button", { name: "Editar" });
    expect(editar).toHaveAttribute("aria-disabled", "true");
    expect(editar).toHaveAttribute("title", TEXTO_ACCION_NO_DISPONIBLE);
  });

  it("muestra un estado vacío cuando no hay precios para la zona", () => {
    render(<PreciosPorZona productos={[]} />);
    expect(screen.getByText("No hay precios configurados para esta zona.")).toBeInTheDocument();
  });
});
