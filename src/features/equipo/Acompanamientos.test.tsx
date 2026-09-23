import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DATOS_EQUIPO_SIMULADO } from "@/datos/equipo/simulado";
import { Acompanamientos } from "@/features/equipo/Acompanamientos";

describe("Acompanamientos", () => {
  it("muestra las jornadas sin acompañamiento y el % de la campaña", () => {
    render(<Acompanamientos datos={DATOS_EQUIPO_SIMULADO.acompanamiento} />);

    expect(screen.getByText("Jornada de J. Cabrera · ayer")).toBeInTheDocument();
    expect(screen.getByText("3,4 h · Cerro Norte · sin acompañamiento registrado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar acompañamiento" })).toBeInTheDocument();
    expect(screen.getByText("Jornadas acompañadas esta campaña")).toBeInTheDocument();
    expect(screen.getByText("21%")).toBeInTheDocument();
  });

  it("muestra un estado vacío cuando no hay jornadas pendientes de acompañamiento", () => {
    render(
      <Acompanamientos datos={{ jornadasSinAcompanamiento: [], porcentajeJornadasAcompanadas: 100 }} />,
    );

    expect(screen.getByText("No hay jornadas pendientes de acompañamiento.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar acompañamiento" })).not.toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });
});
