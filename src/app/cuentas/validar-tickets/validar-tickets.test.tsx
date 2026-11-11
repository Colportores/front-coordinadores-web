import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { isValidElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ErrorValidarTickets from "@/app/cuentas/validar-tickets/error";
import CargandoValidarTickets from "@/app/cuentas/validar-tickets/loading";
import ValidarTickets from "@/app/cuentas/validar-tickets/page";
import { fuenteValidarTickets } from "@/datos/cuentas/validar";
import type * as ModuloValidar from "@/datos/cuentas/validar";
import { armarValidacionSimulada } from "@/datos/cuentas/validar/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// El selector se reemplaza por uno que se puede controlar; en el sitio de prueba tiene que explotar si alguien lo usa:
// ahí la fuente es siempre la simulada, aunque el día de mañana `index.ts` apunte a la real.
// `accionesValidarTickets`: null = sin Supabase (las simuladas del navegador); un objeto = conectada (server actions, #170).
const conexion = vi.hoisted(() => ({ acciones: null as unknown }));
vi.mock("@/datos/cuentas/validar", async (importOriginal) => {
  const original = await importOriginal<typeof ModuloValidar>();
  return {
    ...original,
    fuenteValidarTickets: { obtenerPorValidar: vi.fn() },
    get accionesValidarTickets() {
      return conexion.acciones;
    },
  };
});

const obtenerPorValidar = vi.mocked(fuenteValidarTickets.obtenerPorValidar);
const AHORA = new Date("2026-11-10T14:00:00.000Z");

afterEach(() => {
  conexion.acciones = null;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  obtenerPorValidar.mockReset();
});

describe("ruta /cuentas/validar-tickets (vista 29)", () => {
  it("arma la vista con lo que trae la fuente", async () => {
    obtenerPorValidar.mockResolvedValue(armarValidacionSimulada(AHORA));

    render(<ProveedorModoDev activo={false}>{await ValidarTickets()}</ProveedorModoDev>);

    expect(screen.getByRole("heading", { level: 1, name: "Validar tickets" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Tickets por validar · 5");
    expect(screen.getByRole("link", { name: "‹ Estado de cuenta del equipo" })).toHaveAttribute("href", "/cuentas");
  });

  it("conectada a Supabase (#170): la vista recibe las server actions, que llaman a las acciones reales", async () => {
    const validar = vi.fn(async () => ({ ok: true, valor: { resueltoEn: AHORA.toISOString(), yaEstaba: false } }));
    conexion.acciones = { validar, rechazar: vi.fn(), enlaceDeFoto: vi.fn() };
    obtenerPorValidar.mockResolvedValue(armarValidacionSimulada(AHORA));

    const jsx = await ValidarTickets();
    let actual: unknown = jsx;
    let acciones: { validar: (item: unknown) => Promise<unknown> } | undefined;
    while (isValidElement(actual)) {
      const props = actual.props as { acciones?: typeof acciones; children?: unknown };
      if (props.acciones) {
        acciones = props.acciones;
        break;
      }
      actual = props.children;
    }

    expect(acciones).toBeDefined();
    await acciones?.validar({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", tipo: "deposito", monto: 1 });
    expect(validar).toHaveBeenCalledWith({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", tipo: "deposito" });
    render(<ProveedorModoDev activo={false}>{jsx}</ProveedorModoDev>);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Tickets por validar · 5");
  });

  it("si la fuente falla, la página falla y Next muestra error.tsx (no se pinta una vista vacía)", async () => {
    obtenerPorValidar.mockRejectedValue(new Error("sin red"));

    await expect(ValidarTickets()).rejects.toThrow("sin red");
  });

  it("al elegir otra campaña la vista se reinicia: la clave es la campaña", async () => {
    obtenerPorValidar.mockResolvedValue({ ...armarValidacionSimulada(AHORA), campaniaId: "otra" });

    const jsx = await ValidarTickets();
    const vista = JSON.stringify(jsx, (clave, valor) => (clave === "_owner" || clave === "_store" ? undefined : valor));

    expect(vista).toContain('"key":"otra"');
  });

  it("en el modo dev marca la sección con la HU de validar tickets", async () => {
    obtenerPorValidar.mockResolvedValue(armarValidacionSimulada(AHORA));

    const { container } = render(<ProveedorModoDev activo={false}>{await ValidarTickets()}</ProveedorModoDev>);

    expect(container.querySelector('[data-hu="HU-COB-008"]')).not.toBeNull();
  });

  describe("en el build del sitio de prueba (export estático, sin servidor)", () => {
    it("arma los datos en el navegador con la fuente simulada, sin pasar por el selector", async () => {
      vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
      obtenerPorValidar.mockImplementation(() => {
        throw new Error("El sitio de prueba no puede usar el selector de fuente: tiene que ser siempre la simulada.");
      });

      render(<ProveedorModoDev activo={false}>{await ValidarTickets()}</ProveedorModoDev>);

      expect(screen.getByRole("status")).toHaveTextContent("Cargando los tickets…");
      expect(await screen.findByRole("heading", { level: 2, name: /^Tickets por validar/ })).toBeInTheDocument();
      expect(obtenerPorValidar).not.toHaveBeenCalled();
    });

    it("si no se pueden cargar los datos simulados, avisa qué hacer", async () => {
      vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
      const modulo = await import("@/datos/cuentas/validar/simulado");
      vi.spyOn(modulo.fuenteValidarTicketsSimulada, "obtenerPorValidar").mockRejectedValueOnce(new Error("roto"));

      render(<ProveedorModoDev activo={false}>{await ValidarTickets()}</ProveedorModoDev>);

      expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar los tickets. Recargá la página para probar de nuevo.");
    });
  });
});

describe("carga y error de la ruta de la vista 29", () => {
  it("mientras trae los tickets dice que está cargando", () => {
    render(<CargandoValidarTickets />);

    expect(screen.getByRole("status")).toHaveTextContent("Cargando los tickets…");
    expect(screen.getByRole("heading", { level: 1, name: "Validar tickets" })).toBeInTheDocument();
  });

  it("si no los puede traer avisa qué hacer y deja reintentar con `retry`, no con `reset`", async () => {
    const retry = vi.fn();
    const reset = vi.fn();
    render(<ErrorValidarTickets {...{ error: new Error("sin red"), retry, reset }} />);

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar los tickets. Revisá tu conexión y probá de nuevo.");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });
});
