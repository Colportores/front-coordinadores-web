import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PestanaEquipo from "@/app/equipo/page";
import { TEXTO_ACCION_NO_DISPONIBLE } from "@/components/AccionNoDisponible";
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

  it("marca como no disponibles todas las acciones sin formulario diseñado de la pestaña", async () => {
    const jsx = await PestanaEquipo();
    render(<ProveedorModoDev activo={false}>{jsx}</ProveedorModoDev>);

    const nombres = ["+ Asignar colportor a zona", "Asignar zona", "Editar", "Registrar acompañamiento"];
    for (const nombre of nombres) {
      const boton = screen.getByRole("button", { name: nombre });
      expect(boton).toHaveAttribute("aria-disabled", "true");
      expect(boton).toHaveAttribute("title", TEXTO_ACCION_NO_DISPONIBLE);
    }
    // El filtro de zona sí funciona: no debe llevar la marca.
    expect(screen.getByRole("button", { name: /Todas las zonas/ })).not.toHaveAttribute("aria-disabled");
  });
});
