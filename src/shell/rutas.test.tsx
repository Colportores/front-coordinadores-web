import { beforeEach, describe, expect, it, vi } from "vitest";

import LayoutCuentas from "@/app/cuentas/layout";
import Raiz from "@/app/page";
import LayoutStock from "@/app/stock/layout";
import { LayoutPestanaConFlag } from "@/shell/LayoutPestanaConFlag";
import { fijarFlags } from "@/test/flags";

const navegacion = vi.hoisted(() => ({
  redirect: vi.fn((ruta: string) => {
    throw new Error(`REDIRECT:${ruta}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

// `connection()` saca la ruta del prerender: solo se llama con el flag apagado.
const servidor = vi.hoisted(() => ({ connection: vi.fn(async () => {}) }));

vi.mock("next/navigation", () => navegacion);
vi.mock("next/server", () => servidor);

describe("rutas del shell", () => {
  beforeEach(() => {
    servidor.connection.mockClear();
  });

  it("/ redirige a /inicio", () => {
    expect(() => Raiz()).toThrow("REDIRECT:/inicio");
    expect(navegacion.redirect).toHaveBeenCalledWith("/inicio");
  });

  describe("Stock y Cuentas", () => {
    const hijos = <p>contenido</p>;
    const params = Promise.resolve({});

    it("sus layouts pasan por el flag de su pestaña", () => {
      expect(LayoutStock({ children: hijos, params }).props).toMatchObject({ pestana: "stock" });
      expect(LayoutCuentas({ children: hijos, params }).props).toMatchObject({ pestana: "cuentas" });
    });

    it("responden 404 fuera del modo dev, y la ruta no se prerenderiza", async () => {
      fijarFlags({ modoDev: false });
      await expect(LayoutPestanaConFlag({ pestana: "stock", children: hijos })).rejects.toThrow("NOT_FOUND");
      await expect(LayoutPestanaConFlag({ pestana: "cuentas", children: hijos })).rejects.toThrow("NOT_FOUND");
      expect(servidor.connection).toHaveBeenCalledTimes(2);
    });

    it("se muestran en modo dev, y la ruta puede ser estática (el sitio de prueba la exporta)", async () => {
      fijarFlags({ modoDev: true });
      await expect(LayoutPestanaConFlag({ pestana: "stock", children: hijos })).resolves.toBe(hijos);
      await expect(LayoutPestanaConFlag({ pestana: "cuentas", children: hijos })).resolves.toBe(hijos);
      expect(servidor.connection).not.toHaveBeenCalled();
    });
  });

  it("las pestañas sin flag nunca responden 404", async () => {
    fijarFlags({ modoDev: false });
    const hijos = <p>contenido</p>;
    await expect(LayoutPestanaConFlag({ pestana: "inicio", children: hijos })).resolves.toBe(hijos);
    expect(servidor.connection).not.toHaveBeenCalled();
  });
});
