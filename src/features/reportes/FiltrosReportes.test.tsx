import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TEXTO_ACCION_NO_DISPONIBLE } from "@/components/AccionNoDisponible";
import { FiltrosReportes } from "@/features/reportes/FiltrosReportes";

describe("FiltrosReportes", () => {
  it("renderiza las tres opciones de rango, todas marcadas como no disponibles", () => {
    render(<FiltrosReportes />);

    for (const nombre of ["Campaña", "Mes", "Semana"]) {
      const boton = screen.getByRole("button", { name: nombre });
      expect(boton).toHaveAttribute("aria-disabled", "true");
      expect(boton).toHaveAttribute("title", TEXTO_ACCION_NO_DISPONIBLE);
    }
  });
});
