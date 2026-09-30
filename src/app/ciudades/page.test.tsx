import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PestanaCiudades from "@/app/ciudades/page";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";

describe("PestanaCiudades", () => {
  it("arma la pestaña con el encabezado y las ciudades de la campaña", async () => {
    const jsx = await PestanaCiudades();
    render(<ProveedorModoDev activo={false}>{jsx}</ProveedorModoDev>);

    expect(screen.getByRole("heading", { level: 1, name: "Ciudades" })).toBeInTheDocument();
    expect(screen.getByText("Ciudades · Verano 2026")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ciudad Montevideo" })).toBeInTheDocument();
    expect(screen.queryByText("HU-CAM-006")).not.toBeInTheDocument();
  });

  it("en modo dev marca la sección con el chip de HU-CAM-006", async () => {
    const jsx = await PestanaCiudades();
    render(<ProveedorModoDev activo>{jsx}</ProveedorModoDev>);

    expect(screen.getByText("HU-CAM-006")).toBeInTheDocument();
  });
});
