import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PestanaCuentas from "@/app/cuentas/page";
import { TEXTO_ACCION_NO_DISPONIBLE } from "@/components/AccionNoDisponible";

describe("PestanaCuentas", () => {
  it("marca como no disponibles todas las acciones sin formulario diseñado de la pestaña", async () => {
    render(await PestanaCuentas());

    expect(screen.getByRole("heading", { name: "Cuentas" })).toBeInTheDocument();

    const validar = screen.getByRole("button", { name: /Validar/ });
    const rechazar = screen.getByRole("button", { name: "Rechazar" });
    const revisar = screen.getByRole("button", { name: "Revisar" });
    const verTodos = screen.getByRole("button", { name: "Ver los 4 tickets →" });

    for (const boton of [validar, rechazar, revisar, verTodos]) {
      expect(boton).toHaveAttribute("aria-disabled", "true");
      expect(boton).toHaveAttribute("title", TEXTO_ACCION_NO_DISPONIBLE);
    }
  });
});
