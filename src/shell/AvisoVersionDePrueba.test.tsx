import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RESUMEN_COORDINADOR_SIMULADO } from "@/datos/shell/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";
import { AvisoVersionDePrueba } from "@/shell/AvisoVersionDePrueba";
import { MarcoDelPanel } from "@/shell/MarcoDelPanel";
import { pestanasVisibles } from "@/shell/pestanas";

vi.mock("next/navigation", () => ({ usePathname: () => "/inicio" }));

const TEXTO = "Versión de prueba con datos simulados. Lo que hagas no se guarda: al recargar la página vuelve a los datos de ejemplo.";

describe("AvisoVersionDePrueba", () => {
  describe("en el build del sitio de prueba (GitHub Pages)", () => {
    it("muestra el aviso completo, sin botón para cerrarlo", () => {
      vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
      render(<AvisoVersionDePrueba />);

      expect(screen.getByRole("note")).toHaveTextContent(TEXTO);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  describe("en el panel normal (next dev, staging y producción)", () => {
    it("no aparece", () => {
      const { container } = render(<AvisoVersionDePrueba />);

      expect(screen.queryByRole("note")).not.toBeInTheDocument();
      expect(container).toBeEmptyDOMElement();
    });

    it("tampoco con el flag apagado de forma explícita", () => {
      vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "0");
      render(<AvisoVersionDePrueba />);

      expect(screen.queryByRole("note")).not.toBeInTheDocument();
    });
  });
});

describe("MarcoDelPanel y el aviso de versión de prueba", () => {
  function marco() {
    return render(
      <ProveedorModoDev activo={false}>
        <MarcoDelPanel resumen={RESUMEN_COORDINADOR_SIMULADO} pestanas={pestanasVisibles()}>
          <p>contenido de la pestaña</p>
        </MarcoDelPanel>
      </ProveedorModoDev>,
    );
  }

  it("en el sitio de prueba el aviso va arriba de todo, antes del topbar, y la grilla le reserva una fila", () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
    const { container } = marco();

    const grilla = container.firstElementChild!;
    expect(Array.from(grilla.children).map((hijo) => hijo.tagName)).toEqual(["DIV", "HEADER", "MAIN"]);
    expect(grilla.firstElementChild).toHaveAttribute("role", "note");
    expect(grilla.className).toContain("grid-rows-[auto_var(--spacing-topbar)_1fr]");
    // La navegación sigue entera debajo del aviso: no la tapa.
    expect(screen.getByRole("navigation", { name: "Secciones del panel" })).toBeInTheDocument();
    expect(screen.getByText("contenido de la pestaña")).toBeInTheDocument();
  });

  it("en el panel normal no hay aviso y la grilla queda como antes", () => {
    const { container } = marco();

    const grilla = container.firstElementChild!;
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(Array.from(grilla.children).map((hijo) => hijo.tagName)).toEqual(["HEADER", "MAIN"]);
    expect(grilla.className).toContain("grid-rows-[var(--spacing-topbar)_1fr]");
    expect(grilla.className).not.toContain("alto-aviso");
  });
});
