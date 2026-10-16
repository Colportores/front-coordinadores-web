import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AnadirColportorPagina from "@/app/equipo/anadir/page";
import type * as ModuloEquipo from "@/datos/equipo";
import { fuenteEquipoSimulada } from "@/datos/equipo/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// El selector explota si alguien lo usa: el sitio de prueba tiene que ser siempre la fuente simulada,
// aunque el día de mañana `index.ts` apunte a la real.
vi.mock("@/datos/equipo", async (importOriginal) => ({
  ...(await importOriginal<typeof ModuloEquipo>()),
  fuenteEquipo: new Proxy(
    {},
    {
      get() {
        throw new Error("El sitio de prueba no puede usar el selector de fuente: tiene que ser siempre la simulada.");
      },
    },
  ),
}));

describe("AnadirColportorPagina en el build del sitio de prueba (export estático, sin servidor)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("arma la misma vista con la fuente simulada, sin el selector de fuente", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
    const jsx = await AnadirColportorPagina();
    render(<ProveedorModoDev activo={false}>{jsx}</ProveedorModoDev>);

    expect(screen.getByRole("heading", { level: 1, name: "Añadir colportor" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Añadir colportor a Verano 2026" })).toBeInTheDocument();
  });

  it("sin campaña en curso avisa y no arma el buscador", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
    vi.spyOn(fuenteEquipoSimulada, "obtenerAnadirColportor").mockResolvedValueOnce(null);

    render(<ProveedorModoDev activo={false}>{await AnadirColportorPagina()}</ProveedorModoDev>);

    expect(screen.getByRole("status")).toHaveTextContent("No tenés una campaña en curso a la que añadir colportores.");
    expect(screen.queryByRole("textbox", { name: "Buscar por email o nombre" })).not.toBeInTheDocument();
  });

  it("busca contra la simulada desde el navegador, sin pasar por el selector", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
    render(<ProveedorModoDev activo={false}>{await AnadirColportorPagina()}</ProveedorModoDev>);

    await userEvent.type(screen.getByRole("textbox", { name: "Buscar por email o nombre" }), "silva");

    expect(await screen.findByRole("button", { name: "Elegir a Rodrigo Silva" })).toBeInTheDocument();
  });

  it("inscribe contra la simulada desde el navegador", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
    render(<ProveedorModoDev activo={false}>{await AnadirColportorPagina()}</ProveedorModoDev>);

    const primero = screen.getAllByRole("button", { name: /^Añadir a / })[0];
    const nombre = (primero.getAttribute("aria-label") ?? "").replace("Añadir a ", "");
    await userEvent.click(primero);

    expect(await screen.findByRole("button", { name: `Deshacer: ${nombre}` })).toBeInTheDocument();
  });
});
