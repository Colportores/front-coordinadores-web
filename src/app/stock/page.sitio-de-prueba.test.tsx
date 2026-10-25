import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PestanaStock from "@/app/stock/page";
import type * as ModuloStock from "@/datos/stock";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";

// El selector explota si alguien lo usa: el sitio de prueba tiene que ser siempre la fuente simulada,
// aunque el día de mañana `index.ts` apunte a la real.
vi.mock("@/datos/stock", async (importOriginal) => ({
  ...(await importOriginal<typeof ModuloStock>()),
  fuenteStock: new Proxy(
    {},
    {
      get() {
        throw new Error("El sitio de prueba no puede usar el selector de fuente: tiene que ser siempre la simulada.");
      },
    },
  ),
}));

describe("PestanaStock en el build del sitio de prueba (export estático, sin servidor)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("arma la misma vista con la fuente simulada, sin el selector de fuente", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
    render(<ProveedorModoDev activo={false}>{await PestanaStock()}</ProveedorModoDev>);

    expect(screen.getByRole("heading", { level: 1, name: "Stock" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Stock por producto en Todas las ciudades" })).toBeInTheDocument();
  });
});
