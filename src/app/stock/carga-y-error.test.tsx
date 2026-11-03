import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ErrorStock from "@/app/stock/error";
import CargandoStock from "@/app/stock/loading";

describe("carga y error de la ruta de la vista 34 (Stock)", () => {
  it("mientras trae el stock dice que está cargando", () => {
    render(<CargandoStock />);

    expect(screen.getByRole("status")).toHaveTextContent("Cargando el stock de la campaña…");
    expect(screen.getByRole("heading", { level: 1, name: "Stock" })).toBeInTheDocument();
  });

  it("si no lo puede traer (sin conexión, base caída) avisa qué hacer y deja reintentar con `retry`, no con `reset`", async () => {
    const retry = vi.fn();
    const reset = vi.fn();
    const props = { error: new Error("sin red"), retry, reset };
    render(<ErrorStock {...props} />);

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar el stock de la campaña. Revisá tu conexión y probá de nuevo.");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });

  it("dos toques seguidos en «Reintentar» no rompen nada: cada uno pide de nuevo y el botón sigue habilitado", async () => {
    const retry = vi.fn();
    render(<ErrorStock error={new Error("sin red")} retry={retry} />);

    await userEvent.dblClick(screen.getByRole("button", { name: "Reintentar" }));

    expect(retry).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeEnabled();
  });
});
