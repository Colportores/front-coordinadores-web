import { describe, expect, it } from "vitest";

import { formatMonto } from "@/features/cuentas/formato";

describe("formatMonto", () => {
  describe("cuando el monto es positivo", () => {
    it("antepone $U y separa los miles con punto", () => {
      expect(formatMonto(214300)).toBe("$U 214.300");
    });

    it("no agrega separador para números menores a mil", () => {
      expect(formatMonto(500)).toBe("$U 500");
    });

    it("separa varios grupos de miles", () => {
      expect(formatMonto(1000000)).toBe("$U 1.000.000");
    });
  });

  describe("cuando el monto es cero", () => {
    it("muestra $U 0", () => {
      expect(formatMonto(0)).toBe("$U 0");
    });
  });

  describe("cuando el monto es negativo", () => {
    it("antepone el signo antes de los dígitos", () => {
      expect(formatMonto(-500)).toBe("$U -500");
    });

    it("separa los miles también en negativos", () => {
      expect(formatMonto(-123456)).toBe("$U -123.456");
    });
  });

  describe("cuando el monto tiene decimales", () => {
    it("redondea al entero más cercano", () => {
      expect(formatMonto(9000.4)).toBe("$U 9.000");
    });

    it("redondea hacia arriba cuando corresponde", () => {
      expect(formatMonto(9000.5)).toBe("$U 9.001");
    });
  });
});
