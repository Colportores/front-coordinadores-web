import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PestanaInicio from "@/app/inicio/page";
import { TEXTO_ACCION_NO_DISPONIBLE } from "@/components/AccionNoDisponible";
import { fijarFlags } from "@/test/flags";

describe("PestanaInicio", () => {
  it("marca como no disponibles las acciones secundarias sin formulario diseñado", async () => {
    fijarFlags({ modoDev: true });
    const jsx = await PestanaInicio();
    render(jsx);

    expect(screen.getByRole("heading", { name: "Inicio" })).toBeInTheDocument();

    const rechazar = screen.getAllByRole("button", { name: "Rechazar" });
    expect(rechazar.length).toBeGreaterThan(0);
    const verFoto = screen.getByRole("button", { name: "Ver foto" });
    for (const boton of [...rechazar, verFoto]) {
      expect(boton).toHaveAttribute("aria-disabled", "true");
      expect(boton).toHaveAttribute("title", TEXTO_ACCION_NO_DISPONIBLE);
    }

    // Los atajos que sí llevan a la pestaña que resuelve el pendiente son links reales, no se tocan.
    expect(screen.getByRole("link", { name: "Validar" })).toHaveAttribute("href", "/cuentas");
  });
});
