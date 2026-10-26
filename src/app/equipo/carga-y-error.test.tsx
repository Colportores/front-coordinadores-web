import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ErrorEquipo from "@/app/equipo/error";
import CargandoEquipo from "@/app/equipo/loading";

describe("carga y error de la ruta de la vista 33 (Equipo)", () => {
  it("mientras trae la campaña, las zonas y los acompañamientos dice que está cargando", () => {
    render(<CargandoEquipo />);

    expect(screen.getByRole("status")).toHaveTextContent("Cargando el equipo de la campaña…");
    expect(screen.getByRole("heading", { level: 1, name: "Equipo" })).toBeInTheDocument();
  });

  it("si no los puede traer avisa qué hacer y deja reintentar", async () => {
    const retry = vi.fn();
    render(<ErrorEquipo error={new Error("sin red")} retry={retry} />);

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar el equipo de la campaña. Revisá tu conexión y probá de nuevo.");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("«Reintentar» usa `retry` (vuelve a pedir los datos) y no `reset` (solo repinta el error guardado)", async () => {
    const retry = vi.fn();
    const reset = vi.fn();
    const props = { error: new Error("sin red"), retry, reset };
    render(<ErrorEquipo {...props} />);

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });

  it("el aviso de error no muestra el detalle técnico del fallo", () => {
    render(<ErrorEquipo error={new Error("ECONNREFUSED 10.0.0.5:5432 usuario=secreto")} retry={() => undefined} />);

    expect(screen.getByRole("alert")).not.toHaveTextContent(/ECONNREFUSED|secreto/);
  });
});
