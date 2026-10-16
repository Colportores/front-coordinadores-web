import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import ErrorAnadirColportor from "@/app/equipo/anadir/error";
import CargandoAnadirColportor from "@/app/equipo/anadir/loading";

describe("carga y error de la ruta de la vista 23 (añadir colportor)", () => {
  it("mientras trae la campaña y los sugeridos dice que está cargando", () => {
    render(<CargandoAnadirColportor />);

    expect(screen.getByRole("status")).toHaveTextContent("Cargando las cuentas para añadir a la campaña…");
    expect(screen.getByRole("heading", { level: 1, name: "Añadir colportor" })).toBeInTheDocument();
  });

  it("si no los puede traer avisa qué hacer, deja reintentar y deja volver a Equipo", async () => {
    const reset = vi.fn();
    render(<ErrorAnadirColportor error={new Error("sin red")} reset={reset} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "No se pudieron cargar las cuentas para añadir a la campaña. Revisá tu conexión y probá de nuevo.",
    );
    expect(screen.getByRole("link", { name: "‹ Equipo" })).toHaveAttribute("href", "/equipo");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("el aviso de error no muestra el detalle técnico del fallo", () => {
    render(<ErrorAnadirColportor error={new Error("ECONNREFUSED 10.0.0.5:5432 usuario=secreto")} reset={() => undefined} />);

    expect(screen.getByRole("alert")).not.toHaveTextContent(/ECONNREFUSED|secreto/);
  });
});
