import { describe, expect, it } from "vitest";

import { formatearMonto } from "@/features/stock/formato";

describe("formatearMonto", () => {
  it("agrupa los miles con punto y antepone $U, como en el diseño", () => {
    expect(formatearMonto(19_800)).toBe("$U 19.800");
    expect(formatearMonto(58_000)).toBe("$U 58.000");
    expect(formatearMonto(71_500)).toBe("$U 71.500");
  });

  it("no agrega separador para montos menores a mil", () => {
    expect(formatearMonto(800)).toBe("$U 800");
  });
});
