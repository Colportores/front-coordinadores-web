import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import AnadirColportorPagina from "@/app/equipo/anadir/page";
import type * as ModuloEquipo from "@/datos/equipo";
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
  it("arma la misma vista con la fuente simulada, sin el selector de fuente", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
    const jsx = await AnadirColportorPagina();
    render(<ProveedorModoDev activo={false}>{jsx}</ProveedorModoDev>);

    expect(screen.getByRole("heading", { level: 1, name: "Añadir colportor" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Añadir colportor a Verano 2026" })).toBeInTheDocument();
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
