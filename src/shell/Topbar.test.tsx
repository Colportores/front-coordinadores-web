import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RESUMEN_COORDINADOR_SIMULADO } from "@/datos/shell/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";
import { pestanasVisibles } from "@/shell/pestanas";
import { Topbar } from "@/shell/Topbar";
import { fijarFlags } from "@/test/flags";

const ruta = vi.hoisted(() => ({ actual: "/equipo" }));
vi.mock("next/navigation", () => ({ usePathname: () => ruta.actual, useRouter: () => ({ push: vi.fn() }) }));

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

  it("sin login la cuenta es solo una insignia; con login es un botón que abre el menú con «Cerrar sesión» (issue #18)", async () => {
    fijarFlags({ modoDev: false });
    const { unmount } = render(
      <ProveedorModoDev activo={false}>
        <Topbar resumen={RESUMEN_COORDINADOR_SIMULADO} pestanas={pestanasVisibles()} />
      </ProveedorModoDev>,
    );
    expect(screen.queryByRole("button", { name: /^Cuenta:/ })).toBeNull();
    unmount();

    render(
      <ProveedorModoDev activo={false}>
        <Topbar resumen={RESUMEN_COORDINADOR_SIMULADO} pestanas={pestanasVisibles()} cerrarSesion={vi.fn(async () => ({ tipo: "cerrada" as const }))} />
      </ProveedorModoDev>,
    );
    expect(screen.queryByRole("img", { name: /^Cuenta:/ })).toBeNull();
    const cuenta = screen.getByRole("button", { name: "Cuenta: Coordinador de ejemplo" });
    expect(cuenta).toHaveTextContent("MP");
    expect(cuenta).toHaveAttribute("aria-haspopup", "menu");
  });

  it("el botón de región/campaña abre la lista de campañas (vista 37); sin fuente propia, con las simuladas", async () => {
    renderTopbar(false);
    const selector = screen.getByRole("button", { name: /Montevideo Oeste · Verano 2026/ });
    expect(selector).not.toHaveAttribute("aria-disabled");
    expect(selector).toHaveAttribute("aria-haspopup", "listbox");

    await act(async () => {
      fireEvent.click(selector);
    });

    const lista = screen.getByRole("listbox", { name: "Campañas" });
    expect(within(lista).getAllByRole("option")).toHaveLength(3);
    expect(within(lista).getByRole("option", { name: /Verano 2026/ })).toHaveAttribute("aria-selected", "true");
  });

  it("usa la lista que le pasa el layout (la server action) en vez de las simuladas", async () => {
    fijarFlags({ modoDev: false });
    const pedirCampanias = vi.fn(async () => ({ ok: true as const, campanias: [] }));
    render(
      <ProveedorModoDev activo={false}>
        <Topbar resumen={RESUMEN_COORDINADOR_SIMULADO} pestanas={pestanasVisibles()} pedirCampanias={pedirCampanias} />
      </ProveedorModoDev>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Montevideo Oeste · Verano 2026/ }));
    });

    expect(pedirCampanias).toHaveBeenCalledTimes(1);
    expect(screen.getByText("No tenés campañas en curso ni por empezar")).toBeInTheDocument();
  });

  it("en /equipo/anadir (vista 23) «Equipo» sigue como pestaña actual", () => {
    ruta.actual = "/equipo/anadir";
    try {
      renderTopbar(false);
      const nav = screen.getByRole("navigation", { name: "Secciones del panel" });
      expect(within(nav).getByRole("link", { name: "Equipo" })).toHaveAttribute("aria-current", "page");
    } finally {
      ruta.actual = "/equipo";
    }
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
      expect(within(nav).getAllByRole("link").map((l) => l.textContent)).toEqual(["Inicio", "Equipo", "Ciudades", "Reportes"]);
      expect(screen.queryByTestId("estado-pestana-inicio")).not.toBeInTheDocument();
    });
  });

  describe("en modo dev", () => {
    it("muestra las seis pestañas con el estado agregado de sus HU", () => {
      renderTopbar(true);
      const nav = screen.getByRole("navigation", { name: "Secciones del panel" });
      expect(within(nav).getAllByRole("link")).toHaveLength(6);
      expect(screen.getByTestId("estado-pestana-inicio")).toHaveTextContent("Mockeada");
      expect(screen.getByTestId("estado-pestana-stock")).toHaveTextContent("Bloqueada");
      expect(screen.getByTestId("estado-pestana-cuentas")).toHaveTextContent("Bloqueada");
    });
  });
});
