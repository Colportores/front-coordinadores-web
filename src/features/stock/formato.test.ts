import { describe, expect, it } from "vitest";

import { formatearMonto } from "@/features/stock/formato";

describe("formatearMonto", () => {
  describe("cuando el monto es positivo", () => {
    it("agrupa los miles con punto y antepone $U, como en el diseño", () => {
      expect(formatearMonto(19_800)).toBe("$U 19.800");
      expect(formatearMonto(58_000)).toBe("$U 58.000");
      expect(formatearMonto(71_500)).toBe("$U 71.500");
      expect(formatearMonto(1_000_000)).toBe("$U 1.000.000");
    });

    it("no agrega separador para montos menores a mil", () => {
      expect(formatearMonto(800)).toBe("$U 800");
    });

    it("no agrega signo para el monto cero", () => {
      expect(formatearMonto(0)).toBe("$U 0");
    });
  });

  describe("cuando el monto es negativo", () => {
    it("antepone el signo sin pegarlo al separador de miles", () => {
      expect(formatearMonto(-500)).toBe("$U -500");
      expect(formatearMonto(-123_456)).toBe("$U -123.456");
      expect(formatearMonto(-1_234_567)).toBe("$U -1.234.567");
    });
  });

  describe("cuando el monto tiene decimales", () => {
    it("lo redondea antes de formatearlo", () => {
      expect(formatearMonto(19_799.6)).toBe("$U 19.800");
    });
  });
});
