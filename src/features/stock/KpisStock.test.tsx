import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DATOS_STOCK_SIMULADO } from "@/datos/stock/simulado";
import { KpisStock } from "@/features/stock/KpisStock";

describe("KpisStock", () => {
  it("muestra las tres cifras con sus rótulos", () => {
    render(<KpisStock kpis={DATOS_STOCK_SIMULADO.kpis} />);

    expect(screen.getByText("Libros en campo")).toBeInTheDocument();
    expect(screen.getByText("486")).toBeInTheDocument();
    expect(screen.getByText("Pedidos en curso")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Transferencias pendientes")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
