import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import ErrorPedidos from "@/app/stock/pedidos/error";
import CargandoPedidos from "@/app/stock/pedidos/loading";
import PedidosYTransferencias from "@/app/stock/pedidos/page";
import { fuentePedidos } from "@/datos/stock/pedidos";
import type * as ModuloPedidos from "@/datos/stock/pedidos";
import { crearDatosDePedidosSimulados } from "@/datos/stock/pedidos/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";

// El selector se reemplaza por uno que se puede controlar; en el sitio de prueba tiene que explotar si alguien lo usa:
// ahí la fuente es siempre la simulada, aunque el día de mañana `index.ts` apunte a la real.
vi.mock("@/datos/stock/pedidos", async (importOriginal) => {
  const original = await importOriginal<typeof ModuloPedidos>();
  return { ...original, fuentePedidos: { obtenerPedidos: vi.fn() } };
});

const obtenerPedidos = vi.mocked(fuentePedidos.obtenerPedidos);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  obtenerPedidos.mockReset();
});

describe("pestaña Stock · Pedidos y transferencias (vista 35)", () => {
  it("arma la vista con los pedidos de la fuente", async () => {
    obtenerPedidos.mockResolvedValue(crearDatosDePedidosSimulados());

    render(<ProveedorModoDev activo={false}>{await PedidosYTransferencias()}</ProveedorModoDev>);

    expect(screen.getByRole("heading", { level: 1, name: "Pedidos y transferencias" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Por autorizar/ })).toHaveAttribute("aria-selected", "true");
  });

  it("sin campaña dice por qué no hay nada que autorizar", async () => {
    obtenerPedidos.mockResolvedValue(null);

    render(<ProveedorModoDev activo={false}>{await PedidosYTransferencias()}</ProveedorModoDev>);

    expect(screen.getByRole("status")).toHaveTextContent("No tenés una campaña en curso ni por empezar.");
    expect(screen.queryByRole("navigation", { name: "Ciudades" })).not.toBeInTheDocument();
  });

  it("si la fuente falla, la página falla y Next muestra error.tsx (no se pinta una vista vacía)", async () => {
    obtenerPedidos.mockRejectedValue(new Error("sin red"));

    await expect(PedidosYTransferencias()).rejects.toThrow("sin red");
  });

  it("al elegir otra campaña la vista se reinicia: la clave es la campaña", async () => {
    obtenerPedidos.mockResolvedValue({ ...crearDatosDePedidosSimulados(), campaniaId: "otra" });

    const jsx = await PedidosYTransferencias();
    const vista = JSON.stringify(jsx, (clave, valor) => (clave === "_owner" || clave === "_store" ? undefined : valor));

    expect(vista).toContain('"key":"otra"');
  });

  it("en el modo dev marca la sección con la HU de autorizar pedidos", async () => {
    obtenerPedidos.mockResolvedValue(crearDatosDePedidosSimulados());

    const { container } = render(<ProveedorModoDev activo={false}>{await PedidosYTransferencias()}</ProveedorModoDev>);

    expect(container.querySelector('[data-hu="HU-STK-003"]')).not.toBeNull();
  });

  describe("en el build del sitio de prueba (export estático, sin servidor)", () => {
    it("arma los datos en el navegador con la fuente simulada, sin pasar por el selector", async () => {
      vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
      obtenerPedidos.mockImplementation(() => {
        throw new Error("El sitio de prueba no puede usar el selector de fuente: tiene que ser siempre la simulada.");
      });

      render(<ProveedorModoDev activo={false}>{await PedidosYTransferencias()}</ProveedorModoDev>);

      expect(screen.getByRole("status")).toHaveTextContent("Cargando los pedidos y las transferencias…");
      expect(await screen.findByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /^Por autorizar/ })).toHaveTextContent("4");
      expect(obtenerPedidos).not.toHaveBeenCalled();
    });

    it("y se puede autorizar un pedido contra las acciones simuladas", async () => {
      vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");

      render(<ProveedorModoDev activo={false}>{await PedidosYTransferencias()}</ProveedorModoDev>);
      await screen.findByRole("heading", { level: 2, name: "Todas las ciudades" });
      await userEvent.click(screen.getByRole("button", { name: /^Autorizar el pedido #231/ }));

      expect(await screen.findByText(/Pedido #231 de Emiliano Sosa autorizado/)).toBeInTheDocument();
    });
  });
});

describe("carga y error de la ruta de la vista 35", () => {
  it("mientras trae los pedidos dice que está cargando", () => {
    render(<CargandoPedidos />);

    expect(screen.getByRole("status")).toHaveTextContent("Cargando los pedidos y las transferencias…");
    expect(screen.getByRole("heading", { level: 1, name: "Pedidos y transferencias" })).toBeInTheDocument();
  });

  it("si no los puede traer avisa qué hacer y deja reintentar con `retry`, no con `reset`", async () => {
    const retry = vi.fn();
    const reset = vi.fn();
    const props = { error: new Error("sin red"), retry, reset };
    render(<ErrorPedidos {...props} />);

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar los pedidos y las transferencias. Revisá tu conexión y probá de nuevo.");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });

  it("dos toques seguidos en «Reintentar» no rompen nada", async () => {
    const retry = vi.fn();
    render(<ErrorPedidos error={new Error("sin red")} retry={retry} />);

    await userEvent.dblClick(screen.getByRole("button", { name: "Reintentar" }));

    expect(retry).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeEnabled();
  });
});
