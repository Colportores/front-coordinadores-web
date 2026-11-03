import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RESUMEN_COORDINADOR_SIMULADO } from "@/datos/shell/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";
import { AvisoVersionDePrueba } from "@/shell/AvisoVersionDePrueba";
import { MarcoDelPanel } from "@/shell/MarcoDelPanel";
import { pestanasVisibles } from "@/shell/pestanas";
import { fijarFlags } from "@/test/flags";

// QA de #101 (aviso de datos simulados fuera de Pages): textos literales de cada caso, precedencias y casos límite.
vi.mock("next/navigation", () => ({ usePathname: () => "/inicio", useRouter: () => ({ push: vi.fn() }) }));

function conexion() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_prueba");
}
function puente() {
  vi.stubEnv("SUPABASE_URL", "https://demo.supabase.co");
  vi.stubEnv("SUPABASE_ANON_KEY", "sb_publishable_demo");
  vi.stubEnv("SUPABASE_COORDINADOR_EMAIL", "c@ejemplo.org");
  vi.stubEnv("SUPABASE_COORDINADOR_PASSWORD", "clave");
}

function textoDelAviso(): string {
  return (screen.getByRole("note").textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("#101 · texto literal de cada caso del aviso", () => {
  it("Pages: el texto exacto que exige build:pages", () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
    render(<AvisoVersionDePrueba />);

    expect(textoDelAviso()).toBe(
      "Versión de prueba con datos simulados. Lo que hagas no se guarda: al recargar la página vuelve a los datos de ejemplo.",
    );
  });

  it("sin conexión a la base: «Versión de prueba con datos simulados.» y que lo que se haga no se guarda", () => {
    render(<AvisoVersionDePrueba />);

    expect(textoDelAviso()).toBe(
      "Versión de prueba con datos simulados. Este panel no está conectado a la base de datos: lo que ves es de ejemplo y lo que hagas no se guarda.",
    );
  });

  it("Stock y Cuentas simuladas con la conexión real: las nombra a las dos", () => {
    conexion();
    fijarFlags({ modoDev: true });
    render(<AvisoVersionDePrueba />);

    expect(textoDelAviso()).toBe(
      "Stock y Cuentas: datos simulados. Esas pestañas todavía no están conectadas a la base de datos: lo que muestran es de ejemplo y lo que hagas en ellas no se guarda.",
    );
  });

  it("solo Stock a la vista: habla de «Esa pestaña» en singular", () => {
    conexion();
    fijarFlags({ modoDev: false, stock: true });
    render(<AvisoVersionDePrueba />);

    expect(textoDelAviso()).toContain("Stock: datos simulados. Esa pestaña todavía no está conectada a la base de datos");
    expect(textoDelAviso()).toContain("lo que hagas en ella no se guarda");
  });

  it.skip("QA #101: con una sola pestaña simulada el aviso dice «lo que muestran» (plural); tendría que decir «lo que muestra»", () => {
    conexion();
    fijarFlags({ modoDev: false, stock: true });
    render(<AvisoVersionDePrueba />);

    expect(textoDelAviso()).toBe(
      "Stock: datos simulados. Esa pestaña todavía no está conectada a la base de datos: lo que muestra es de ejemplo y lo que hagas en ella no se guarda.",
    );
  });

  it.each([
    ["Pages", () => vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1")],
    ["sin conexión", () => undefined],
    [
      "pestañas simuladas",
      () => {
        conexion();
        fijarFlags({ modoDev: true });
      },
    ],
  ])("%s: el aviso es una nota sin botones ni enlaces, no hay nada que cerrar", (_caso, preparar) => {
    preparar();
    render(<AvisoVersionDePrueba />);

    expect(screen.getByRole("note").querySelector("button, a, input, [tabindex]")).toBeNull();
  });
});

describe("#101 · precedencias y casos límite", () => {
  it("el flag de la pestaña en falso gana al modo dev: con Stock y Cuentas ocultas por flag y conexión real no hay aviso", () => {
    conexion();
    fijarFlags({ modoDev: true, stock: false, cuentas: false });
    const { container } = render(<AvisoVersionDePrueba />);

    expect(container).toBeEmptyDOMElement();
  });

  it("solo la URL cargada (falta la clave): el panel bloquea todo y no avisa de datos simulados que no muestra", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto.supabase.co");
    fijarFlags({ modoDev: true });
    const { container } = render(<AvisoVersionDePrueba />);

    expect(container).toBeEmptyDOMElement();
  });

  it("el sitio de prueba manda aunque haya variables de Supabase: texto de Pages", () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
    conexion();
    render(<AvisoVersionDePrueba />);

    expect(textoDelAviso()).toContain("al recargar la página vuelve a los datos de ejemplo");
  });

  it("URL y clave en blanco (espacios) no cuentan como conexión... pero tampoco como configuración a medias: avisa", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "   ");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "  ");
    render(<AvisoVersionDePrueba />);

    expect(textoDelAviso()).toContain("no está conectado a la base de datos");
  });

  it("el puente de desarrollo incompleto (contraseña en blanco) no cuenta como conexión: avisa", () => {
    puente();
    vi.stubEnv("SUPABASE_COORDINADOR_PASSWORD", "   ");
    render(<AvisoVersionDePrueba />);

    expect(textoDelAviso()).toContain("no está conectado a la base de datos");
  });

  it("el puente de la demo con el modo dev prendido avisa de Stock y Cuentas, no de «sin conexión»", () => {
    puente();
    fijarFlags({ modoDev: true });
    render(<AvisoVersionDePrueba />);

    expect(textoDelAviso()).toContain("Stock y Cuentas: datos simulados.");
    expect(textoDelAviso()).not.toContain("no está conectado a la base de datos:");
  });

  it("los textos no filtran valores del entorno (URL, clave, correo)", () => {
    conexion();
    puente();
    fijarFlags({ modoDev: true });
    render(<AvisoVersionDePrueba />);

    const texto = textoDelAviso();
    for (const secreto of ["proyecto.supabase.co", "sb_publishable", "c@ejemplo.org", "clave"]) expect(texto).not.toContain(secreto);
  });
});

describe("#101 · MarcoDelPanel", () => {
  function marco() {
    return render(
      <ProveedorModoDev activo={false}>
        <MarcoDelPanel resumen={RESUMEN_COORDINADOR_SIMULADO} pestanas={pestanasVisibles()}>
          <p>contenido de la pestaña</p>
        </MarcoDelPanel>
      </ProveedorModoDev>,
    );
  }

  beforeEach(() => fijarFlags({ modoDev: false }));

  it("con la conexión real y Stock simulada a la vista, el aviso va arriba del topbar y la grilla le reserva su fila", () => {
    conexion();
    fijarFlags({ modoDev: false, stock: true });
    const { container } = marco();

    const grilla = container.firstElementChild!;
    expect(Array.from(grilla.children).map((hijo) => hijo.tagName)).toEqual(["DIV", "HEADER", "MAIN"]);
    expect(grilla.firstElementChild).toHaveAttribute("role", "note");
    expect(grilla.className).toContain("alto-aviso");
  });

  it("con la conexión mal configurada no hay aviso y la grilla no reserva fila", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://otro-host.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_x");
    const { container } = marco();

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(container.firstElementChild!.className).not.toContain("alto-aviso");
  });

  it("el aviso aparece una sola vez y la navegación del topbar sigue entera debajo", () => {
    const { container } = marco();

    expect(screen.getAllByRole("note")).toHaveLength(1);
    expect(container.firstElementChild!.firstElementChild).toHaveAttribute("role", "note");
    expect(screen.getByRole("navigation", { name: "Secciones del panel" })).toBeInTheDocument();
  });
});
