import { describe, expect, it } from "vitest";

import { informeNoDisponible } from "@/datos/reportes/informe";

describe("informeNoDisponible (sitio de prueba, desarrollo sin Supabase y puente de la demo)", () => {
  it("no inventa un archivo: dice que lo arma el servidor y qué hacer", async () => {
    const resultado = await informeNoDisponible({ ambito: { tipo: "todas" }, granularidad: "semana" });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.causa).toBe("rechazado");
      expect(resultado.mensaje).toMatch(/lo arma el servidor del panel/);
      expect(resultado.mensaje).toMatch(/Datos CSV/);
    }
  });
});
