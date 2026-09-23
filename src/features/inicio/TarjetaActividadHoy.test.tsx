import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TABLERO_INICIO_SIMULADO } from "@/datos/inicio/simulado";
import { TarjetaActividadHoy } from "@/features/inicio/TarjetaActividadHoy";

describe("TarjetaActividadHoy", () => {
  it("muestra a cada colportor con su zona, horas, ventas y estado", () => {
    render(<TarjetaActividadHoy filas={TABLERO_INICIO_SIMULADO.actividadHoy} />);

    expect(screen.getByText("Actividad de hoy")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver equipo →" })).toHaveAttribute("href", "/equipo");
    expect(screen.getByText("Diego Rocha")).toBeInTheDocument();
    expect(screen.getAllByText("Cerro Norte")).toHaveLength(2);
    expect(screen.getByText("5,2 h")).toBeInTheDocument();
    expect(screen.getByText("$U 4.350")).toBeInTheDocument();
    expect(screen.getAllByText("En jornada").length).toBeGreaterThan(0);
    expect(screen.getByText("Finalizada")).toBeInTheDocument();
  });

  it("muestra un guion para quien todavía no inició la jornada", () => {
    render(<TarjetaActividadHoy filas={TABLERO_INICIO_SIMULADO.actividadHoy} />);

    expect(screen.getByText("Pablo Ferreira")).toBeInTheDocument();
    expect(screen.getByText("Sin iniciar")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("muestra un estado vacío cuando no hay actividad", () => {
    render(<TarjetaActividadHoy filas={[]} />);

    expect(screen.getByText("Todavía no hay actividad registrada hoy.")).toBeInTheDocument();
  });
});
