import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DATOS_EQUIPO_SIMULADO } from "@/datos/equipo/simulado";
import { PreciosPorZona } from "@/features/equipo/PreciosPorZona";

describe("PreciosPorZona", () => {
  it("muestra el precio base y el precio de zona de cada producto", () => {
    render(<PreciosPorZona productos={DATOS_EQUIPO_SIMULADO.preciosPorZona} />);

    expect(screen.getByText("Precios por zona")).toBeInTheDocument();
    expect(screen.getByText("Vida Sana · 3 tomos")).toBeInTheDocument();
    expect(screen.getByText("base $U 2.900")).toBeInTheDocument();
    expect(screen.getByText("$U 3.100")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
  });

  it("muestra un estado vacío cuando no hay precios para la zona", () => {
    render(<PreciosPorZona productos={[]} />);
    expect(screen.getByText("No hay precios configurados para esta zona.")).toBeInTheDocument();
  });
});
