import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RESUMEN_COORDINADOR_SIMULADO } from "@/datos/shell/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";
import { AvisoVersionDePrueba } from "@/shell/AvisoVersionDePrueba";
import { MarcoDelPanel } from "@/shell/MarcoDelPanel";
import { pestanasVisibles } from "@/shell/pestanas";
import { fijarFlags } from "@/test/flags";

vi.mock("next/navigation", () => ({ usePathname: () => "/inicio", useRouter: () => ({ push: vi.fn() }) }));

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

  describe("en un build que no habla con Supabase (next dev, staging o producción sin las variables)", () => {
    it("avisa que los datos son simulados y que lo que se haga no se guarda, sin botón para cerrarlo", () => {
      render(<AvisoVersionDePrueba />);

      const aviso = screen.getByRole("note");
      expect(aviso).toHaveTextContent("Versión de prueba con datos simulados.");
      expect(aviso).toHaveTextContent("no está conectado a la base de datos");
      expect(aviso).toHaveTextContent("lo que hagas no se guarda");
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("también con el flag de Pages apagado de forma explícita", () => {
      vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "0");
      render(<AvisoVersionDePrueba />);

      expect(screen.getByRole("note")).toHaveTextContent("Versión de prueba con datos simulados.");
    });
  });

  describe("con la conexión a Supabase", () => {
    beforeEach(() => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto.supabase.co");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_prueba");
    });

    it("en staging y producción (Stock y Cuentas ocultas) no aparece", () => {
      fijarFlags({ modoDev: false });
      const { container } = render(<AvisoVersionDePrueba />);

      expect(screen.queryByRole("note")).not.toBeInTheDocument();
      expect(container).toBeEmptyDOMElement();
    });

    it("con Stock y Cuentas a la vista (modo dev) dice que esas dos pestañas son simuladas", () => {
      fijarFlags({ modoDev: true });
      render(<AvisoVersionDePrueba />);

      const aviso = screen.getByRole("note");
      expect(aviso).toHaveTextContent("Stock y Cuentas: datos simulados.");
      expect(aviso).toHaveTextContent("Esas pestañas todavía no están conectadas");
    });

    it("con una sola de las dos a la vista, habla de esa", () => {
      fijarFlags({ modoDev: false, cuentas: true });
      render(<AvisoVersionDePrueba />);

      const aviso = screen.getByRole("note");
      expect(aviso).toHaveTextContent("Cuentas: datos simulados.");
      expect(aviso).toHaveTextContent("Esa pestaña todavía no está conectada");
    });
  });

  it("con la conexión mal configurada no hay datos que avisar: el panel bloquea todo", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto.supabase.co");
    const { container } = render(<AvisoVersionDePrueba />);

    expect(container).toBeEmptyDOMElement();
  });

  it("con el puente de desarrollo de la demo (lee Supabase con la cuenta del servidor) no avisa de nada simulado", () => {
    fijarFlags({ modoDev: false });
    vi.stubEnv("SUPABASE_URL", "https://demo.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "sb_publishable_demo");
    vi.stubEnv("SUPABASE_COORDINADOR_EMAIL", "c@ejemplo.org");
    vi.stubEnv("SUPABASE_COORDINADOR_PASSWORD", "clave");
    const { container } = render(<AvisoVersionDePrueba />);

    expect(container).toBeEmptyDOMElement();
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

  it("sin datos simulados (todo conectado) no hay aviso y la grilla queda como antes", () => {
    fijarFlags({ modoDev: false });
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_prueba");
    const { container } = marco();

    const grilla = container.firstElementChild!;
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(Array.from(grilla.children).map((hijo) => hijo.tagName)).toEqual(["HEADER", "MAIN"]);
    expect(grilla.className).toContain("grid-rows-[var(--spacing-topbar)_1fr]");
    expect(grilla.className).not.toContain("alto-aviso");
  });

  it("sin conexión a Supabase el aviso también va arriba de todo y la grilla le reserva una fila", () => {
    const { container } = marco();

    const grilla = container.firstElementChild!;
    expect(grilla.firstElementChild).toHaveAttribute("role", "note");
    expect(grilla.className).toContain("grid-rows-[auto_var(--spacing-topbar)_1fr]");
    expect(grilla.className).toContain("alto-aviso");
  });
});
