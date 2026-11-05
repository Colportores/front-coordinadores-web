import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import PestanaInicio from "@/app/inicio/page";
import { fuenteInicio } from "@/datos/inicio";
import type * as ModuloInicio from "@/datos/inicio";
import { RechazoDelTablero } from "@/datos/inicio/rpc";
import { crearFuenteInicioSimulada } from "@/datos/inicio/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";
import { olvidarAjustes } from "@/features/inicio/ajustes";
import { fijarFlags } from "@/test/flags";

vi.mock("@/datos/inicio", async (importOriginal) => {
  const original = await importOriginal<typeof ModuloInicio>();
  return { ...original, fuenteInicio: { obtenerTablero: vi.fn() } };
});

const obtenerTablero = vi.mocked(fuenteInicio.obtenerTablero);
const simulada = crearFuenteInicioSimulada(() => new Date("2026-10-21T13:40:00.000Z"));

describe("PestanaInicio", () => {
  it("arma la vista 31 con el tablero de la fuente y le da las server actions", async () => {
    fijarFlags({ modoDev: true });
    olvidarAjustes();
    obtenerTablero.mockResolvedValue(await simulada.obtenerTablero());

    const jsx = await PestanaInicio();
    render(<ProveedorModoDev activo={false}>{jsx}</ProveedorModoDev>);

    expect(screen.getByRole("heading", { level: 1, name: "Inicio" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pendientes de acción" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Autorizar" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("link", { name: "Validar" })).toHaveAttribute("href", "/cuentas");
    expect(obtenerTablero).toHaveBeenCalledWith();
  });

  it("sin campaña dice por qué no hay nada que mirar", async () => {
    obtenerTablero.mockResolvedValue(null);

    render(<ProveedorModoDev activo={false}>{await PestanaInicio()}</ProveedorModoDev>);

    expect(screen.getByText(/No tenés una campaña en curso ni por empezar/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a Equipo" })).toHaveAttribute("href", "/equipo");
  });

  it("un rechazo de la base muestra su texto; una caída sigue al error de la pestaña (Reintentar)", async () => {
    obtenerTablero.mockRejectedValueOnce(new RechazoDelTablero("Solo el coordinador de la campaña puede ver su tablero."));
    render(<ProveedorModoDev activo={false}>{await PestanaInicio()}</ProveedorModoDev>);
    expect(screen.getByRole("alert")).toHaveTextContent("Solo el coordinador de la campaña puede ver su tablero.");

    const caida = new TypeError("fetch failed");
    obtenerTablero.mockRejectedValueOnce(caida);
    await expect(PestanaInicio()).rejects.toBe(caida);
  });
});

describe("PestanaInicio en el build del sitio de prueba (export estático, sin servidor)", () => {
  it("arma los datos en el navegador con la fuente simulada: nunca lee el selector ni usa server actions", async () => {
    fijarFlags({ modoDev: false });
    olvidarAjustes();
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
    obtenerTablero.mockClear();

    render(<ProveedorModoDev activo={false}>{await PestanaInicio()}</ProveedorModoDev>);

    expect(await screen.findByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
    expect(obtenerTablero).not.toHaveBeenCalled();
  });

  it("y se puede mirar un día anterior contra la simulada", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
    olvidarAjustes();
    render(<ProveedorModoDev activo={false}>{await PestanaInicio()}</ProveedorModoDev>);
    await screen.findByRole("heading", { level: 2, name: "Todas las ciudades" });

    await userEvent.click(screen.getByRole("button", { name: "Día anterior" }));

    expect(await screen.findByText("Ayer")).toBeInTheDocument();
    const tabla = await screen.findByRole("region", { name: /^Colportores/ });
    expect(within(tabla).getAllByRole("row").length).toBeGreaterThan(10);
    expect(obtenerTablero).not.toHaveBeenCalled();
  });
});
