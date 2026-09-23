import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PestanaReportes from "@/app/reportes/page";
import { TEXTO_ACCION_NO_DISPONIBLE } from "@/components/AccionNoDisponible";

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

  it("marca como no disponibles el filtro de rango y las acciones de exportar", async () => {
    render(await PestanaReportes());

    const nombres = ["Campaña", "Mes", "Semana", "Informe PDF", "Datos CSV"];
    for (const nombre of nombres) {
      const boton = screen.getByRole("button", { name: nombre });
      expect(boton).toHaveAttribute("aria-disabled", "true");
      expect(boton).toHaveAttribute("title", TEXTO_ACCION_NO_DISPONIBLE);
    }
  });
});
