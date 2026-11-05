import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import PestanaCuentas from "@/app/cuentas/page";
import { TEXTO_ACCION_NO_DISPONIBLE } from "@/components/AccionNoDisponible";
import { fuenteCuentas } from "@/datos/cuentas";
import type * as ModuloCuentas from "@/datos/cuentas";
import { armarCuentasSimuladas } from "@/datos/cuentas/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";

vi.mock("@/datos/cuentas", async (importOriginal) => {
  const original = await importOriginal<typeof ModuloCuentas>();
  return { ...original, fuenteCuentas: { obtenerCuentas: vi.fn() } };
});

const obtenerCuentas = vi.mocked(fuenteCuentas.obtenerCuentas);

describe("PestanaCuentas", () => {
  it("arma la vista 36 con las cuentas de la fuente", async () => {
    obtenerCuentas.mockResolvedValue(armarCuentasSimuladas(new Date("2026-10-22T15:00:00.000Z")));

    render(<ProveedorModoDev activo={false}>{await PestanaCuentas()}</ProveedorModoDev>);

    expect(screen.getByRole("heading", { level: 1, name: "Cuentas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Casa editora" })).toBeInTheDocument();
    expect(obtenerCuentas).toHaveBeenCalledWith();
  });

  it("marca como no disponibles las acciones que dependen de la vista 29 (validar tickets)", async () => {
    obtenerCuentas.mockResolvedValue(armarCuentasSimuladas(new Date("2026-10-22T15:00:00.000Z")));

    render(<ProveedorModoDev activo={false}>{await PestanaCuentas()}</ProveedorModoDev>);

    for (const nombre of ["Validar tickets", "Validar tickets →"]) {
      const boton = screen.getByRole("button", { name: nombre });
      expect(boton).toHaveAttribute("aria-disabled", "true");
      expect(boton).toHaveAttribute("title", TEXTO_ACCION_NO_DISPONIBLE);
    }
  });

  it("si la fuente falla, deja que `error.tsx` lo muestre", async () => {
    obtenerCuentas.mockRejectedValue(new Error("sin red"));
    await expect(PestanaCuentas()).rejects.toThrow("sin red");
  });

  it("en modo dev marca la sección con su HU", async () => {
    obtenerCuentas.mockResolvedValue(armarCuentasSimuladas(new Date("2026-10-22T15:00:00.000Z")));
    const { container } = render(<ProveedorModoDev activo>{await PestanaCuentas()}</ProveedorModoDev>);
    expect(container.querySelector("[data-hu='HU-CTA-005']")).not.toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: /Tickets/ }));
    expect(container.querySelector("[data-hu='HU-COB-008']")).not.toBeNull();
  });
});
