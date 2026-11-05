import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import PestanaEquipo from "@/app/equipo/page";
import type * as ModuloEquipo from "@/datos/equipo";
import { fuenteEquipoSimulada } from "@/datos/equipo/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";

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

describe("PestanaEquipo en el build del sitio de prueba (export estático, sin servidor)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("arma la misma vista con la fuente simulada, sin el selector de fuente", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
    render(<ProveedorModoDev activo={false}>{await PestanaEquipo()}</ProveedorModoDev>);

    expect(screen.getByRole("heading", { level: 1, name: "Equipo" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Zonas de cada colportor" })).toBeInTheDocument();
  });

  it("sin campaña avisa y no arma la vista", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
    vi.spyOn(fuenteEquipoSimulada, "obtenerEquipoPorCiudad").mockResolvedValueOnce(null);

    render(<ProveedorModoDev activo={false}>{await PestanaEquipo()}</ProveedorModoDev>);

    expect(screen.getByRole("status")).toHaveTextContent("No tenés una campaña en curso ni por empezar.");
    expect(screen.queryByRole("navigation", { name: "Ciudades" })).not.toBeInTheDocument();
  });

  it("trae las jornadas y registra un acompañamiento contra la simulada desde el navegador, sin pasar por el selector", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
    render(<ProveedorModoDev activo={false}>{await PestanaEquipo()}</ProveedorModoDev>);
    const usuario = userEvent.setup();

    await usuario.click(screen.getByRole("button", { name: /^Rivera/ }));
    await usuario.click(screen.getByRole("button", { name: "Acompañamientos" }));
    await usuario.click(screen.getByRole("button", { name: "Registrar acompañamiento de Florencia Pintos" }));
    const lista = await screen.findByRole("list", { name: "Jornadas terminadas de Florencia Pintos" });
    await usuario.click(within(lista).getAllByRole("button", { name: /^Registrar acompañamiento en la jornada/ })[0]);

    expect(await screen.findByText(/Acompañamiento registrado: jornada de Florencia Pintos/)).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /^Florencia Pintos/ })).getByRole("cell", { name: "1" })).toBeInTheDocument();
  });
});
