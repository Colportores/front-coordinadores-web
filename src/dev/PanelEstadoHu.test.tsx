import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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

    it("Escape cierra el panel y devuelve el foco al botón", async () => {
      const user = userEvent.setup();
      renderPanel(true);
      const boton = screen.getByRole("button", { name: /Estado de HU/ });
      await user.click(boton);
      await user.click(screen.getByRole("checkbox", { name: /Mostrar chips/ }));

      await user.keyboard("{Escape}");

      expect(screen.queryByRole("region", { name: "Estado de HU" })).not.toBeInTheDocument();
      expect(boton).toHaveAttribute("aria-expanded", "false");
      expect(boton).toHaveFocus();
    });

    it("sin permiso de escritura en localStorage recuerda la preferencia en memoria", async () => {
      const user = userEvent.setup();
      const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
      renderPanel(true);
      await user.click(screen.getByRole("button", { name: /Estado de HU/ }));
      const interruptor = screen.getByRole("checkbox", { name: /Mostrar chips/ });

      await user.click(interruptor);
      expect(interruptor).not.toBeChecked();

      await user.click(interruptor);
      expect(interruptor).toBeChecked();
      setItem.mockRestore();
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
