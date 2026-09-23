import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TEXTO_ACCION_NO_DISPONIBLE } from "@/components/AccionNoDisponible";
import { DATOS_EQUIPO_SIMULADO } from "@/datos/equipo/simulado";
import { SinZonaAsignada } from "@/features/equipo/SinZonaAsignada";

describe("SinZonaAsignada", () => {
  it("muestra el conteo y los colportores sin zona, con su botón marcado como no disponible", () => {
    render(<SinZonaAsignada colportores={DATOS_EQUIPO_SIMULADO.sinZonaAsignada} />);

    expect(screen.getByText("Sin zona asignada · 1")).toBeInTheDocument();
    expect(screen.getByText(/Ana Martínez/)).toBeInTheDocument();
    expect(screen.getByText(/nueva colportora en tu región/)).toBeInTheDocument();
    const boton = screen.getByRole("button", { name: "Asignar zona" });
    expect(boton).toBeInTheDocument();
    expect(boton).not.toHaveAttribute("href");
    expect(boton).toHaveAttribute("aria-disabled", "true");
    expect(boton).toHaveAttribute("title", TEXTO_ACCION_NO_DISPONIBLE);
  });

  it("muestra un estado vacío cuando todo el equipo tiene zona", () => {
    render(<SinZonaAsignada colportores={[]} />);

    expect(screen.getByText("Sin zona asignada · 0")).toBeInTheDocument();
    expect(screen.getByText("Todo el equipo tiene zona asignada.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Asignar zona" })).not.toBeInTheDocument();
  });
});
