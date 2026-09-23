import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TEXTO_ACCION_NO_DISPONIBLE } from "@/components/AccionNoDisponible";
import { RESUMEN_COORDINADOR_SIMULADO } from "@/datos/shell/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";
import { pestanasVisibles } from "@/shell/pestanas";
import { Topbar } from "@/shell/Topbar";
import { fijarFlags } from "@/test/flags";

vi.mock("next/navigation", () => ({ usePathname: () => "/equipo" }));

function renderTopbar(modoDev: boolean) {
  fijarFlags({ modoDev });
  return render(
    <ProveedorModoDev activo={modoDev}>
      <Topbar resumen={RESUMEN_COORDINADOR_SIMULADO} pestanas={pestanasVisibles()} />
    </ProveedorModoDev>,
  );
}

describe("Topbar", () => {
  it("muestra la marca, la insignia y los datos del coordinador", () => {
    renderTopbar(false);
    expect(screen.getByText("Colportaje")).toBeInTheDocument();
    expect(screen.getByText("COORDINADOR")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Cuenta: Coordinador de ejemplo" })).toHaveTextContent("MP");
  });

  it("marca el selector de región/campaña como no disponible: no está diseñado todavía", () => {
    renderTopbar(false);
    const selector = screen.getByRole("button", { name: /Montevideo Oeste · Verano 2026/ });
    expect(selector).toHaveAttribute("aria-disabled", "true");
    expect(selector).toHaveAttribute("title", TEXTO_ACCION_NO_DISPONIBLE);
  });

  it("marca la pestaña actual con aria-current", () => {
    renderTopbar(false);
    const nav = screen.getByRole("navigation", { name: "Secciones del panel" });
    expect(within(nav).getByRole("link", { name: "Equipo" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current");
  });

  describe("fuera del modo dev", () => {
    it("oculta Stock y Cuentas y no muestra estados de HU", () => {
      renderTopbar(false);
      const nav = screen.getByRole("navigation", { name: "Secciones del panel" });
      expect(within(nav).getAllByRole("link").map((l) => l.textContent)).toEqual(["Inicio", "Equipo", "Reportes"]);
      expect(screen.queryByTestId("estado-pestana-inicio")).not.toBeInTheDocument();
    });
  });

  describe("en modo dev", () => {
    it("muestra las cinco pestañas con el estado agregado de sus HU", () => {
      renderTopbar(true);
      const nav = screen.getByRole("navigation", { name: "Secciones del panel" });
      expect(within(nav).getAllByRole("link")).toHaveLength(5);
      expect(screen.getByTestId("estado-pestana-inicio")).toHaveTextContent("Mockeada");
      expect(screen.getByTestId("estado-pestana-stock")).toHaveTextContent("Bloqueada");
      expect(screen.getByTestId("estado-pestana-cuentas")).toHaveTextContent("Bloqueada");
    });
  });
});
