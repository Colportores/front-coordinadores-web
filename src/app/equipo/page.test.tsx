import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PestanaEquipo from "@/app/equipo/page";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";

describe("PestanaEquipo", () => {
  it("arma la pestaña con el encabezado y los cuatro bloques de la sección", async () => {
    const jsx = await PestanaEquipo();
    render(<ProveedorModoDev activo={false}>{jsx}</ProveedorModoDev>);

    expect(screen.getByRole("heading", { name: "Equipo" })).toBeInTheDocument();
    expect(screen.getByText("Mi equipo · Montevideo Oeste")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Asignar colportor a zona" })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Diego Rocha/ })).toBeInTheDocument();
    expect(screen.getByText("Sin zona asignada · 1")).toBeInTheDocument();
    expect(screen.getByText("Precios por zona")).toBeInTheDocument();
    expect(screen.getByText("Acompañamientos")).toBeInTheDocument();
  });
});
