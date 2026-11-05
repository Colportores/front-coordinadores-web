import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import PestanaReportes from "@/app/reportes/page";
import type * as ModuloReportes from "@/datos/reportes";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";

// El selector explota si alguien lo usa: el sitio de prueba tiene que ser siempre la fuente simulada,
// aunque el día de mañana `index.ts` apunte a la real.
vi.mock("@/datos/reportes", async (importOriginal) => ({
  ...(await importOriginal<typeof ModuloReportes>()),
  fuenteReportes: new Proxy(
    {},
    {
      get() {
        throw new Error("El sitio de prueba no puede usar el selector de fuente: tiene que ser siempre la simulada.");
      },
    },
  ),
}));

describe("PestanaReportes en el build del sitio de prueba (export estático, sin servidor)", () => {
  it("arma la misma vista con la fuente simulada, sin pasar por el selector de fuente", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
    render(<ProveedorModoDev activo={false}>{await PestanaReportes()}</ProveedorModoDev>);

    expect(screen.getByRole("heading", { name: "Reportes", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("25 colportores · S7 contra S6")).toBeInTheDocument();
  });
});
