import { describe, expect, it } from "vitest";

import { formatMonto } from "@/features/cuentas/formato";

describe("formatMonto", () => {
  it("antepone $U y separa los miles con punto", () => {
    expect(formatMonto(214300)).toBe("$U 214.300");
  });

  it("redondea los decimales", () => {
    expect(formatMonto(9000.4)).toBe("$U 9.000");
  });

  it("no agrega separador para números menores a mil", () => {
    expect(formatMonto(500)).toBe("$U 500");
  });
});
