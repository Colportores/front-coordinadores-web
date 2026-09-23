import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { PanelEstadoHu } from "@/dev/PanelEstadoHu";
import { CLAVE_CHIPS_VISIBLES, ProveedorModoDev } from "@/dev/ProveedorModoDev";

function renderPanel(activo: boolean) {
  return render(
    <ProveedorModoDev activo={activo}>
      <PanelEstadoHu />
    </ProveedorModoDev>,
  );
}

describe("PanelEstadoHu", () => {
  it("no se renderiza fuera del modo dev", () => {
    renderPanel(false);
    expect(screen.queryByRole("button", { name: /Estado de HU/ })).not.toBeInTheDocument();
  });

  describe("en modo dev", () => {
    it("abre el panel con contadores por estado y las HU agrupadas por pestaña", async () => {
      const user = userEvent.setup();
      renderPanel(true);
      const boton = screen.getByRole("button", { name: /Estado de HU/ });
      expect(boton).toHaveAttribute("aria-expanded", "false");

      await user.click(boton);

      expect(boton).toHaveAttribute("aria-expanded", "true");
      const panel = screen.getByRole("region", { name: "Estado de HU" });
      const contadores = within(panel).getByRole("list", { name: "Historias por estado" });
      expect(within(contadores).getByText("Bloqueada").previousSibling).toHaveTextContent("8");
      expect(within(contadores).getByText("Mockeada").previousSibling).toHaveTextContent("8");
      const stock = within(panel).getByRole("region", { name: "HU de Stock" });
      expect(within(stock).getByText("HU-STK-001")).toBeInTheDocument();
      expect(within(stock).getAllByText(/Stock y cuenta \(V2\)/).length).toBe(4);
    });

    it("el interruptor oculta los chips y lo recuerda en localStorage", async () => {
      const user = userEvent.setup();
      renderPanel(true);
      await user.click(screen.getByRole("button", { name: /Estado de HU/ }));
      const interruptor = screen.getByRole("checkbox", { name: /Mostrar chips/ });
      expect(interruptor).toBeChecked();

      await user.click(interruptor);

      expect(interruptor).not.toBeChecked();
      expect(window.localStorage.getItem(CLAVE_CHIPS_VISIBLES)).toBe("0");
    });
  });
});
