import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ErrorCuentas from "@/app/cuentas/error";
import CargandoCuentas from "@/app/cuentas/loading";

describe("carga y error de la ruta de Cuentas", () => {
  it("mientras trae los datos dice que está cargando", () => {
    render(<CargandoCuentas />);

    expect(screen.getByRole("status")).toHaveTextContent("Cargando las cuentas…");
    expect(screen.getByRole("heading", { level: 1, name: "Cuentas" })).toBeInTheDocument();
  });

  it("41B·04: dibuja el marco de la vista (ciudades, pestañas con «Alquiler» activa) y el esqueleto de la tabla con aria-busy", () => {
    const { container } = render(<CargandoCuentas />);

    expect(screen.getByText("Ciudades")).toBeInTheDocument();
    for (const rotulo of ["Casa editora", "Alquiler", "Tickets"]) expect(screen.getByText(rotulo)).toBeInTheDocument();
    expect(screen.getByText("Alquiler").className).toMatch(/bg-marca/);
    const esqueleto = container.querySelector('[aria-busy="true"]');
    expect(esqueleto).not.toBeNull();
    expect(within(esqueleto as HTMLElement).queryByRole("status")).not.toBeInTheDocument();
    // Lo dibujado no son controles: no hay pestañas ni botones que no hagan nada, y un solo `role=status`.
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("si no los puede traer avisa qué hacer y deja reintentar con `retry`, no con `reset`", async () => {
    const retry = vi.fn();
    const reset = vi.fn();
    const props = { error: new Error("sin red"), retry, reset };
    render(<ErrorCuentas {...props} />);

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar las cuentas. Revisá tu conexión y probá de nuevo.");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });
});
