import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DATOS_STOCK_SIMULADO } from "@/datos/stock/simulado";
import { StockPorColportor } from "@/features/stock/StockPorColportor";

describe("StockPorColportor", () => {
  it("muestra el título y el stock de cada colportor", () => {
    render(<StockPorColportor stock={DATOS_STOCK_SIMULADO.stockPorColportor} />);

    expect(screen.getByText("Stock por colportor")).toBeInTheDocument();
    expect(screen.getByText("Diego Rocha")).toBeInTheDocument();
    expect(screen.getByText("64 libros")).toBeInTheDocument();
    expect(screen.getByText("Melina Vázquez")).toBeInTheDocument();
    expect(screen.getByText("51 libros")).toBeInTheDocument();
  });

  it("marca con alerta al colportor con stock bajo", () => {
    render(<StockPorColportor stock={DATOS_STOCK_SIMULADO.stockPorColportor} />);

    const nombre = screen.getByText("Joel Cabrera");
    expect(nombre).toHaveClass("text-peligro");
    expect(screen.getByText(/6 libros/)).toHaveClass("text-peligro");
    expect(screen.getByText("— stock bajo")).toBeInTheDocument();
  });

  it("muestra un estado vacío cuando no hay colportores con stock", () => {
    render(<StockPorColportor stock={[]} />);

    expect(screen.getByText("No hay colportores con stock registrado.")).toBeInTheDocument();
  });
});
