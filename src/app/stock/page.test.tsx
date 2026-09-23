import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PestanaStock from "@/app/stock/page";
import { TEXTO_ACCION_NO_DISPONIBLE } from "@/components/AccionNoDisponible";

describe("PestanaStock", () => {
  it("marca como no disponibles todas las acciones sin formulario diseñado de la pestaña", async () => {
    render(await PestanaStock());

    expect(screen.getByRole("heading", { name: "Stock" })).toBeInTheDocument();

    const pedido = screen.getByRole("button", { name: "+ Pedido a casa editora" });
    const autorizar = screen.getAllByRole("button", { name: "Autorizar" });
    const ver = screen.getAllByRole("button", { name: "Ver" });
    const rechazar = screen.getByRole("button", { name: "Rechazar" });

    expect(autorizar).toHaveLength(2);
    expect(ver).toHaveLength(2);

    for (const boton of [pedido, ...autorizar, ...ver, rechazar]) {
      expect(boton).toHaveAttribute("aria-disabled", "true");
      expect(boton).toHaveAttribute("title", TEXTO_ACCION_NO_DISPONIBLE);
    }
  });
});
