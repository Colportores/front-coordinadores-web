import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ExportarReportes } from "@/features/reportes/ExportarReportes";

describe("ExportarReportes", () => {
  it("renderiza el título y los dos botones de exportación", () => {
    render(<ExportarReportes />);
    expect(screen.getByText("Exportar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Informe PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Datos CSV" })).toBeInTheDocument();
  });
});
