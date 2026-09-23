import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FiltrosReportes } from "@/features/reportes/FiltrosReportes";

describe("FiltrosReportes", () => {
  it("renderiza las tres opciones de rango con Campaña activa por defecto", () => {
    render(<FiltrosReportes />);
    expect(screen.getByRole("button", { name: "Campaña" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Mes" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Semana" })).toHaveAttribute("aria-pressed", "false");
  });
});
