import { describe, expect, it } from "vitest";

import { listarCampaniasAccion } from "@/app/acciones-campanias";
import { CAMPANIAS_SIMULADAS } from "@/datos/shell/simulado";

describe("listarCampaniasAccion (server action del topbar)", () => {
  it("sin Supabase configurado (producción, sitio de prueba y estos tests) ofrece las campañas simuladas", async () => {
    expect(await listarCampaniasAccion()).toEqual({ ok: true, campanias: CAMPANIAS_SIMULADAS });
  });
});
