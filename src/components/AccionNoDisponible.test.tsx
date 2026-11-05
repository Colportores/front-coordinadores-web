import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AccionNoDisponible, TEXTO_ACCION_NO_DISPONIBLE } from "@/components/AccionNoDisponible";

describe("AccionNoDisponible", () => {
  it("se anuncia como no disponible y muestra el tooltip", () => {
    render(<AccionNoDisponible>Autorizar</AccionNoDisponible>);

    const boton = screen.getByRole("button", { name: "Autorizar" });
    expect(boton).toHaveAttribute("aria-disabled", "true");
    expect(boton).toHaveAttribute("title", TEXTO_ACCION_NO_DISPONIBLE);
    expect(boton).not.toBeDisabled();
    expect(boton).not.toHaveClass("pointer-events-none");
    expect(boton).toHaveClass("cursor-not-allowed");
    expect(boton).toHaveClass("opacity-60");
  });

  it("no hace nada al hacer click, aunque alguien le pase un onClick", async () => {
    const usuario = userEvent.setup();
    const onClick = vi.fn();

    render(<AccionNoDisponible onClick={onClick as never}>Rechazar</AccionNoDisponible>);
    await usuario.click(screen.getByRole("button", { name: "Rechazar" }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("no hace nada con el teclado (Enter / Espacio)", async () => {
    const usuario = userEvent.setup();
    const onClick = vi.fn();

    render(<AccionNoDisponible onClick={onClick as never}>Validar</AccionNoDisponible>);
    const boton = screen.getByRole("button", { name: "Validar" });
    boton.focus();
    await usuario.keyboard("[Enter]");
    await usuario.keyboard(" ");

    expect(onClick).not.toHaveBeenCalled();
  });

  it("mantiene el estilo de variante/tamaño de Button cuando se le pasan", () => {
    render(
      <AccionNoDisponible variant="outline" size="sm" className="text-peligro">
        Rechazar
      </AccionNoDisponible>,
    );

    const boton = screen.getByRole("button", { name: "Rechazar" });
    expect(boton).toHaveClass("border");
    expect(boton).toHaveClass("text-peligro");
  });

  it("conserva las clases propias cuando no se le pasa variante/tamaño", () => {
    render(<AccionNoDisponible className="rounded-control bg-marca text-superficie">Editar</AccionNoDisponible>);

    const boton = screen.getByRole("button", { name: "Editar" });
    expect(boton).toHaveClass("rounded-control");
    expect(boton).toHaveClass("bg-marca");
    expect(boton).not.toHaveClass("bg-primary");
  });
});
