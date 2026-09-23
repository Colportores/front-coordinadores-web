import { describe, expect, it, vi } from "vitest";

import { leerBandera, modoDevActivo, pestanaVisible } from "@/config/flags";
import { pestanasVisibles } from "@/shell/pestanas";

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

  describe("cuando el modo dev está apagado (staging y producción)", () => {
    it("oculta Stock y Cuentas y deja visibles las demás", () => {
      vi.stubEnv("NEXT_PUBLIC_MODO_DEV", undefined);
      expect(modoDevActivo()).toBe(false);
      expect(pestanaVisible("stock")).toBe(false);
      expect(pestanaVisible("cuentas")).toBe(false);
      expect(pestanasVisibles().map((p) => p.id)).toEqual(["inicio", "equipo", "reportes"]);
    });

    it("el flag propio de la pestaña la puede prender", () => {
      vi.stubEnv("NEXT_PUBLIC_MODO_DEV", undefined);
      vi.stubEnv("NEXT_PUBLIC_PESTANA_STOCK", "1");
      expect(pestanaVisible("stock")).toBe(true);
      expect(pestanaVisible("cuentas")).toBe(false);
    });
  });

  describe("cuando el modo dev está prendido (desarrollo)", () => {
    it("muestra las cinco pestañas", () => {
      vi.stubEnv("NEXT_PUBLIC_MODO_DEV", "1");
      expect(modoDevActivo()).toBe(true);
      expect(pestanasVisibles().map((p) => p.id)).toEqual(["inicio", "equipo", "stock", "cuentas", "reportes"]);
    });

    it("el flag propio de la pestaña la puede apagar", () => {
      vi.stubEnv("NEXT_PUBLIC_MODO_DEV", "1");
      vi.stubEnv("NEXT_PUBLIC_PESTANA_CUENTAS", "0");
      expect(pestanaVisible("cuentas")).toBe(false);
    });
  });
});
