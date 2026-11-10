import { describe, expect, it } from "vitest";

import { armarCuentasSimuladas } from "@/datos/cuentas/simulado";
import { aplicarAlquiler, subtituloDeSeleccion, TODAS } from "@/features/cuentas/modelo";

/** Una campaña que dejó de cobrar alquiler (41B·01): la fecha es un dato opcional; sin él el subtítulo no la inventa. */
const AHORA = new Date("2026-11-04T15:00:00.000Z");

describe("la fecha en que la campaña dejó de cobrar alquiler", () => {
  it("al pasar el alquiler a 0 guarda el día del cambio, en hora de Montevideo, y el subtítulo lo dice", () => {
    const datos = armarCuentasSimuladas(AHORA);
    const sinAlquiler = aplicarAlquiler(datos, 0, "2026-11-01T02:30:00.000Z");
    expect(sinAlquiler.alquilerDejoDeCobrarEl).toBe("2026-10-31");
    expect(subtituloDeSeleccion(sinAlquiler, TODAS)).toMatch(/ · la campaña dejó de cobrar alquiler el 31\/10$/);
  });

  it("sin el dato (o si la campaña cobra) el subtítulo es el de siempre, sin fecha inventada", () => {
    const datos = armarCuentasSimuladas(AHORA);
    expect(subtituloDeSeleccion({ ...datos, alquilerPorColportor: 0 }, TODAS)).not.toMatch(/dejó de cobrar/);
    expect(subtituloDeSeleccion({ ...datos, alquilerDejoDeCobrarEl: "2026-11-01" }, TODAS)).not.toMatch(/dejó de cobrar/);
    expect(subtituloDeSeleccion({ ...datos, alquilerPorColportor: 0, alquilerDejoDeCobrarEl: "no-es-fecha" }, TODAS)).not.toMatch(/dejó de cobrar/);
  });

  it("otro cambio a 0 con la campaña ya sin alquiler no pisa la fecha; volver a cobrar la borra", () => {
    const datos = armarCuentasSimuladas(AHORA);
    const sin = aplicarAlquiler(datos, 0, "2026-11-01T15:00:00.000Z");
    expect(aplicarAlquiler(sin, 0, "2026-11-03T15:00:00.000Z").alquilerDejoDeCobrarEl).toBe("2026-11-01");
    expect(aplicarAlquiler(sin, 5000, "2026-11-03T15:00:00.000Z").alquilerDejoDeCobrarEl).toBeUndefined();
  });
});
