import { render, screen } from "@testing-library/react";
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
