import { describe, expect, it, vi } from "vitest";

import { leerBandera, modoDevActivo, pestanaVisible, sitioDePruebaActivo } from "@/config/flags";
import { pestanasVisibles } from "@/shell/pestanas";
import { fijarFlags } from "@/test/flags";

describe("flags", () => {
  describe("leerBandera", () => {
    it("reconoce valores verdaderos, falsos y ausentes", () => {
      expect(leerBandera("1")).toBe(true);
      expect(leerBandera("true")).toBe(true);
      expect(leerBandera("0")).toBe(false);
      expect(leerBandera("false")).toBe(false);
      expect(leerBandera(undefined)).toBeUndefined();
      expect(leerBandera("quizas")).toBeUndefined();
    });
  });

  describe("sitioDePruebaActivo", () => {
    it("solo es verdadero en el build del sitio de prueba (NEXT_PUBLIC_DEPLOY_PAGES=1)", () => {
      expect(sitioDePruebaActivo()).toBe(false);
      vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
      expect(sitioDePruebaActivo()).toBe(true);
      vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "0");
      expect(sitioDePruebaActivo()).toBe(false);
    });
  });

  describe("cuando el modo dev está apagado (staging y producción)", () => {
    it("oculta Stock y Cuentas y deja visibles las demás", () => {
      fijarFlags({ modoDev: false });
      expect(modoDevActivo()).toBe(false);
      expect(pestanaVisible("stock")).toBe(false);
      expect(pestanaVisible("cuentas")).toBe(false);
      expect(pestanasVisibles().map((p) => p.id)).toEqual(["inicio", "equipo", "ciudades", "reportes"]);
    });

    it("el flag propio de la pestaña la puede prender", () => {
      fijarFlags({ modoDev: false, stock: true });
      expect(pestanaVisible("stock")).toBe(true);
      expect(pestanaVisible("cuentas")).toBe(false);
    });
  });

  describe("cuando el modo dev está prendido (desarrollo)", () => {
    it("muestra las seis pestañas", () => {
      fijarFlags({ modoDev: true });
      expect(modoDevActivo()).toBe(true);
      expect(pestanasVisibles().map((p) => p.id)).toEqual(["inicio", "equipo", "ciudades", "stock", "cuentas", "reportes"]);
    });

    it("el flag propio de la pestaña la puede apagar", () => {
      fijarFlags({ modoDev: true, cuentas: false });
      expect(pestanaVisible("cuentas")).toBe(false);
    });
  });
});
