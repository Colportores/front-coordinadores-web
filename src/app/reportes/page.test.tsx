import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PestanaReportes from "@/app/reportes/page";

describe("PestanaReportes", () => {
  it("renderiza los cinco bloques de la pestaña con los datos simulados", async () => {
    render(await PestanaReportes());

    expect(screen.getByRole("heading", { name: "Reportes", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Reportes · Montevideo Oeste")).toBeInTheDocument();
    expect(screen.getByText("Ventas por semana · región")).toBeInTheDocument();
    expect(screen.getByText("Horas por colportor · esta semana")).toBeInTheDocument();
    expect(screen.getByText("Resumen de campaña")).toBeInTheDocument();
    expect(screen.getByText("Mapa de la región")).toBeInTheDocument();
    expect(screen.getByText("Exportar")).toBeInTheDocument();
  });
});
