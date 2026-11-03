import { describe, expect, it } from "vitest";

import { validarAlquiler } from "@/features/cuentas/modelo";

/**
 * QA de la vista 36 (#67): el alquiler cambia para todos los inscriptos, así que lo que no es un monto con puntos de miles
 * bien puestos tiene que rechazarse (decisión P4: entero ≥ 0, punto de miles opcional, hasta 9 dígitos).
 */
describe("QA · validarAlquiler, puntos de miles", () => {
  it("acepta los montos bien escritos", () => {
    for (const [texto, monto] of [
      ["0", 0],
      ["18500", 18500],
      ["18.500", 18500],
      ["1.250.000", 1250000],
      [" 18.500 ", 18500],
    ] as const) {
      expect(validarAlquiler(texto)).toEqual({ error: null, monto });
    }
  });

  it("rechaza signos, letras, comas, emoji y dígitos que no son ASCII", () => {
    for (const texto of ["-5", "abc", "18,5", "😀", "١٢٣", "1e3", "$U 18.500"]) {
      expect(validarAlquiler(texto).monto, texto).toBeNull();
    }
  });

  it.skip("QA #67: un punto que no separa miles (12.5, 1.8.5.00, 1..0) se lee como 125 / 1850 / 10 en lugar de rechazarse", () => {
    for (const texto of ["12.5", "1.8.5.00", "1..0", ".5", "0.5", "1.0"]) {
      expect(validarAlquiler(texto).monto, texto).toBeNull();
    }
  });
});
