import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import ErrorPrecios from "@/app/stock/precios/error";
import CargandoPrecios from "@/app/stock/precios/loading";
import Precios from "@/app/stock/precios/page";
import { fuentePrecios } from "@/datos/precios";
import type * as ModuloPrecios from "@/datos/precios";
import { crearDatosDePreciosSimulados } from "@/datos/precios/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// El selector se reemplaza por uno que se puede controlar; en el sitio de prueba tiene que explotar si alguien lo usa:
// ahí la fuente es siempre la simulada, aunque el día de mañana `index.ts` apunte a la real.
vi.mock("@/datos/precios", async (importOriginal) => {
  const original = await importOriginal<typeof ModuloPrecios>();
  return { ...original, fuentePrecios: { obtenerPrecios: vi.fn(), guardarPrecios: vi.fn() } };
});

const obtenerPrecios = vi.mocked(fuentePrecios.obtenerPrecios);
const guardarPrecios = vi.mocked(fuentePrecios.guardarPrecios);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  obtenerPrecios.mockReset();
  guardarPrecios.mockReset();
});

describe("Stock · Precios de venta (vista 27)", () => {
  it("arma la vista con los precios de la fuente", async () => {
    obtenerPrecios.mockResolvedValue(crearDatosDePreciosSimulados());

    render(<ProveedorModoDev activo={false}>{await Precios()}</ProveedorModoDev>);

    expect(screen.getByRole("heading", { level: 1, name: "Precios de venta" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Precios de venta" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute("aria-selected", "true");
  });

  it("sin campaña dice por qué no hay precios", async () => {
    obtenerPrecios.mockResolvedValue(null);

    render(<ProveedorModoDev activo={false}>{await Precios()}</ProveedorModoDev>);

    expect(screen.getByRole("status")).toHaveTextContent("No tenés una campaña en curso ni por empezar.");
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("si la fuente falla, la página falla y Next muestra error.tsx (no se pinta una vista vacía)", async () => {
    obtenerPrecios.mockRejectedValue(new Error("sin red"));

    await expect(Precios()).rejects.toThrow("sin red");
  });

  it("al elegir otra campaña la vista se reinicia: la clave es la campaña", async () => {
    obtenerPrecios.mockResolvedValue({ ...crearDatosDePreciosSimulados(), campaniaId: "otra" });

    const vista = JSON.stringify(await Precios(), (clave, valor) => (clave === "_owner" || clave === "_store" ? undefined : valor));

    expect(vista).toContain('"key":"otra"');
  });

  it("en el modo dev marca la sección con la HU de precios", async () => {
    obtenerPrecios.mockResolvedValue(crearDatosDePreciosSimulados());

    const { container } = render(<ProveedorModoDev activo={false}>{await Precios()}</ProveedorModoDev>);

    expect(container.querySelector('[data-hu="HU-CAT-005"]')).not.toBeNull();
  });

  it("guardar pasa por la acción del servidor con la campaña atada, no con la que mande el navegador", async () => {
    obtenerPrecios.mockResolvedValue(crearDatosDePreciosSimulados());
    guardarPrecios.mockResolvedValue({ ok: true });

    render(<ProveedorModoDev activo={false}>{await Precios()}</ProveedorModoDev>);
    await userEvent.click(screen.getByRole("tab", { name: /^Las Piedras/ }));
    await userEvent.click(screen.getByRole("button", { name: "+ Excepción: Nuestros Hijos" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Precio de Nuestros Hijos en Las Piedras" }), { target: { value: "2000" } });
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(guardarPrecios).toHaveBeenCalledTimes(1);
    expect(guardarPrecios.mock.calls[0][0]).toBe(crearDatosDePreciosSimulados().campaniaId);
  });

  describe("en el build del sitio de prueba (export estático, sin servidor)", () => {
    it("arma los datos en el navegador con la fuente simulada, sin pasar por el selector", async () => {
      vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
      obtenerPrecios.mockImplementation(() => {
        throw new Error("El sitio de prueba no puede usar el selector de fuente: tiene que ser siempre la simulada.");
      });

      render(<ProveedorModoDev activo={false}>{await Precios()}</ProveedorModoDev>);

      expect(screen.getByRole("status")).toHaveTextContent("Cargando precios…");
      expect(await screen.findByRole("tab", { name: "General" })).toBeInTheDocument();
      expect(obtenerPrecios).not.toHaveBeenCalled();
    });

    it("y se puede guardar una excepción contra las acciones simuladas", async () => {
      vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");

      render(<ProveedorModoDev activo={false}>{await Precios()}</ProveedorModoDev>);
      await userEvent.click(await screen.findByRole("tab", { name: /^Montevideo/ }));
      const campo = screen.getByRole("textbox", { name: "Precio de Salud y Hogar en Montevideo" });
      await userEvent.clear(campo);
      await userEvent.type(campo, "2700");
      await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

      expect(await screen.findByText("Guardamos 1 precio de Montevideo. Vale para las ventas nuevas.")).toBeInTheDocument();
      expect(guardarPrecios).not.toHaveBeenCalled();
    });
  });
});

describe("carga y error de la ruta de la vista 27", () => {
  it("mientras trae los precios dice que está cargando", () => {
    render(<CargandoPrecios />);

    expect(screen.getByRole("status")).toHaveTextContent("Cargando precios…");
    expect(screen.getByRole("heading", { level: 1, name: "Precios de venta" })).toBeInTheDocument();
  });

  it("si no los puede traer avisa qué hacer y deja reintentar con `retry`, no con `reset`", async () => {
    const retry = vi.fn();
    const reset = vi.fn();
    render(<ErrorPrecios {...({ error: new Error("sin red"), retry, reset } as Parameters<typeof ErrorPrecios>[0])} />);

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar los precios. Revisá tu conexión y probá de nuevo.");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });

  it("dos toques seguidos en «Reintentar» no rompen nada", async () => {
    const retry = vi.fn();
    render(<ErrorPrecios error={new Error("sin red")} retry={retry} />);

    await userEvent.dblClick(screen.getByRole("button", { name: "Reintentar" }));

    expect(retry).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeEnabled();
  });
});
