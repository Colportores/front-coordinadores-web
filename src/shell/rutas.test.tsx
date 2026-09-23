import { describe, expect, it, vi } from "vitest";

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

vi.mock("next/navigation", () => navegacion);

describe("rutas del shell", () => {
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

    it("responden 404 fuera del modo dev", () => {
      fijarFlags({ modoDev: false });
      expect(() => LayoutPestanaConFlag({ pestana: "stock", children: hijos })).toThrow("NOT_FOUND");
      expect(() => LayoutPestanaConFlag({ pestana: "cuentas", children: hijos })).toThrow("NOT_FOUND");
    });

    it("se muestran en modo dev", () => {
      fijarFlags({ modoDev: true });
      expect(LayoutPestanaConFlag({ pestana: "stock", children: hijos })).toBe(hijos);
      expect(LayoutPestanaConFlag({ pestana: "cuentas", children: hijos })).toBe(hijos);
    });
  });

  it("las pestañas sin flag nunca responden 404", () => {
    fijarFlags({ modoDev: false });
    const hijos = <p>contenido</p>;
    expect(LayoutPestanaConFlag({ pestana: "inicio", children: hijos })).toBe(hijos);
  });
});
