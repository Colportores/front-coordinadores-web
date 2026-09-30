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
    expect(screen.getByRole("link", { name: "+ Añadir colportor" })).toHaveAttribute("href", "/equipo/anadir");
    expect(screen.getByRole("row", { name: /Diego Rocha/ })).toBeInTheDocument();
    expect(screen.getByText("Sin zona asignada · 1")).toBeInTheDocument();
    expect(screen.getByText("Precios por ciudad")).toBeInTheDocument();
    expect(screen.getByText("Acompañamientos")).toBeInTheDocument();
  });

  it("marca como no disponibles todas las acciones sin formulario diseñado de la pestaña", async () => {
    const jsx = await PestanaEquipo();
    render(<ProveedorModoDev activo={false}>{jsx}</ProveedorModoDev>);

    const nombres = ["+ Asignar colportor a zona", "Asignar zona", "Editar"];
    for (const nombre of nombres) {
      const boton = screen.getByRole("button", { name: nombre });
      expect(boton).toHaveAttribute("aria-disabled", "true");
      expect(boton).toHaveAttribute("title", TEXTO_ACCION_NO_DISPONIBLE);
    }
    // El filtro de ciudad y «Registrar acompañamiento» sí funcionan: no llevan la marca.
    expect(screen.getByRole("button", { name: /Todas las ciudades/ })).not.toHaveAttribute("aria-disabled");
    expect(screen.getByRole("button", { name: "Registrar acompañamiento" })).not.toHaveAttribute("aria-disabled");
  });
});
