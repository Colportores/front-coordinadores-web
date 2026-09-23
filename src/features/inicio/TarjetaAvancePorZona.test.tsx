import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TABLERO_INICIO_SIMULADO } from "@/datos/inicio/simulado";
import { TarjetaAvancePorZona } from "@/features/inicio/TarjetaAvancePorZona";

describe("TarjetaAvancePorZona", () => {
  it("muestra el porcentaje de avance de cada zona", () => {
    render(<TarjetaAvancePorZona zonas={TABLERO_INICIO_SIMULADO.avancePorZona} />);

    expect(screen.getByText("Avance por zona")).toBeInTheDocument();
    expect(screen.getByText("Cerro Norte")).toBeInTheDocument();
    expect(screen.getByText("74%")).toBeInTheDocument();
    expect(screen.getByText("Belvedere")).toBeInTheDocument();
    expect(screen.getByText("38%")).toBeInTheDocument();
    expect(screen.getAllByRole("progressbar")).toHaveLength(4);
  });

  it("muestra un estado vacío cuando no hay zonas", () => {
    render(<TarjetaAvancePorZona zonas={[]} />);

    expect(screen.getByText("Todavía no hay zonas con avance registrado.")).toBeInTheDocument();
  });
});
