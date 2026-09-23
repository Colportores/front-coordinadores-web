import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FlujoPedidos } from "@/features/stock/FlujoPedidos";

describe("FlujoPedidos", () => {
  it("explica quién autoriza y qué genera la autorización", () => {
    const { container } = render(<FlujoPedidos />);

    expect(screen.getByText("Flujo de pedidos:")).toBeInTheDocument();
    expect(container.textContent).toContain("los autorizás vos como coordinador");
    expect(container.textContent).toContain("se genera automáticamente la deuda");
  });
});
