import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DATOS_STOCK_SIMULADO } from "@/datos/stock/simulado";
import { PedidosCasaEditora } from "@/features/stock/PedidosCasaEditora";

describe("PedidosCasaEditora", () => {
  describe("cuando hay pedidos", () => {
    it("muestra el título y cada pedido con su solicitante, libros, monto y estado", () => {
      render(<PedidosCasaEditora pedidos={DATOS_STOCK_SIMULADO.pedidos} />);

      expect(screen.getByText("Pedidos a casa editora")).toBeInTheDocument();
      expect(screen.getByText("#214")).toBeInTheDocument();
      expect(screen.getByText("J. Cabrera")).toBeInTheDocument();
      expect(screen.getByText("$U 19.800")).toBeInTheDocument();
      expect(screen.getByText("Por autorizar")).toBeInTheDocument();
      expect(screen.getByText("$U 58.000")).toBeInTheDocument();
      expect(screen.getByText("Despachado")).toBeInTheDocument();
      expect(screen.getByText("$U 71.500")).toBeInTheDocument();
      expect(screen.getByText("Entregado")).toBeInTheDocument();
    });

    it("ofrece autorizar solo el pedido por autorizar y ver los demás", () => {
      render(<PedidosCasaEditora pedidos={DATOS_STOCK_SIMULADO.pedidos} />);

      expect(screen.getAllByRole("button", { name: "Autorizar" })).toHaveLength(1);
      expect(screen.getAllByRole("button", { name: "Ver" })).toHaveLength(2);
    });
  });

  describe("cuando no hay pedidos", () => {
    it("muestra un estado vacío", () => {
      render(<PedidosCasaEditora pedidos={[]} />);

      expect(screen.getByText("Todavía no hay pedidos a casa editora.")).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });
  });
});
