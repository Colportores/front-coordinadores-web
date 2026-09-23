import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TEXTO_ACCION_NO_DISPONIBLE } from "@/components/AccionNoDisponible";
import { ExportarReportes } from "@/features/reportes/ExportarReportes";

describe("ExportarReportes", () => {
  it("renderiza el título y los dos botones de exportación, marcados como no disponibles", () => {
    render(<ExportarReportes />);
    expect(screen.getByText("Exportar")).toBeInTheDocument();
    const pdf = screen.getByRole("button", { name: "Informe PDF" });
    const csv = screen.getByRole("button", { name: "Datos CSV" });
    for (const boton of [pdf, csv]) {
      expect(boton).toHaveAttribute("aria-disabled", "true");
      expect(boton).toHaveAttribute("title", TEXTO_ACCION_NO_DISPONIBLE);
    }
  });
});
