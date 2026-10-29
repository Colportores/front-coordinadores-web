import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import PestanaCuentas from "@/app/cuentas/page";
import type * as ModuloCuentas from "@/datos/cuentas";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";

// El selector explota si alguien lo usa: el sitio de prueba tiene que ser siempre la fuente simulada,
// aunque el día de mañana `index.ts` apunte a la real.
vi.mock("@/datos/cuentas", async (importOriginal) => ({
  ...(await importOriginal<typeof ModuloCuentas>()),
  fuenteCuentas: new Proxy(
    {},
    {
      get() {
        throw new Error("El sitio de prueba no puede usar el selector de fuente: tiene que ser siempre la simulada.");
      },
    },
  ),
}));

describe("PestanaCuentas en el build del sitio de prueba (export estático, sin servidor)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("arma los datos en el navegador con la fuente simulada, sin el selector de fuente", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
    const jsx = await PestanaCuentas();
    render(<ProveedorModoDev activo={false}>{jsx}</ProveedorModoDev>);

    expect(screen.getByRole("heading", { level: 1, name: "Cuentas" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Cargando las cuentas…");
    expect(await screen.findByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Casa editora" })).toBeInTheDocument();
  });

  it("registra un retiro contra la simulada desde el navegador", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
    render(<ProveedorModoDev activo={false}>{await PestanaCuentas()}</ProveedorModoDev>);
    await screen.findByRole("heading", { level: 2, name: "Todas las ciudades" });

    await userEvent.click(screen.getByRole("button", { name: /^Artigas/ }));
    await userEvent.click(screen.getByRole("tab", { name: /Tickets/ }));
    await userEvent.click(screen.getByRole("button", { name: "Registrar retiro" }));
    await userEvent.selectOptions(screen.getByLabelText("Colportor", { selector: "#retiro-colportor" }), "sofia-cabral");
    await userEvent.type(screen.getByLabelText(/Monto retirado/), "2500");
    await userEvent.click(screen.getByRole("radio", { name: "Casa editora" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar retiro" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Retiro de $U 2.500 de Sofía Cabral guardado y validado");
  });

  it("si no se pueden cargar los datos simulados, avisa qué hacer", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
    const modulo = await import("@/datos/cuentas/simulado");
    vi.spyOn(modulo.fuenteCuentasSimulada, "obtenerCuentas").mockRejectedValueOnce(new Error("roto"));

    render(<ProveedorModoDev activo={false}>{await PestanaCuentas()}</ProveedorModoDev>);

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar las cuentas. Recargá la página para probar de nuevo.");
  });
});
