import { describe, expect, it } from "vitest";

import type { CampaniaElegible, FuenteDatosShell } from "@/datos/shell/contrato";
import { pedirCampanias } from "@/datos/shell/pedir-campanias";
import { ErrorSupabase } from "@/datos/supabase/cliente";
import { RespuestaInesperada } from "@/datos/supabase/respuesta";

const CAMPANIA: CampaniaElegible = {
  id: "c-1",
  nombre: "Verano 2026",
  ciudades: ["Montevideo"],
  fechaInicio: "2026-09-01",
  fechaFin: null,
  estado: "en-curso",
};

function fuenteQue(resultado: CampaniaElegible[] | Error): FuenteDatosShell {
  return {
    async obtenerResumenCoordinador() {
      throw new Error("no se usa");
    },
    async listarCampanias() {
      if (resultado instanceof Error) throw resultado;
      return resultado;
    },
  };
}

describe("pedirCampanias", () => {
  it("devuelve la lista tal cual", async () => {
    expect(await pedirCampanias(fuenteQue([CAMPANIA]))).toEqual({ ok: true, campanias: [CAMPANIA] });
  });

  it("una lista vacía es «sin campañas», no una falla", async () => {
    expect(await pedirCampanias(fuenteQue([]))).toEqual({ ok: true, campanias: [] });
  });

  it("la red caída, un 5xx, un límite de tráfico y una sesión que no se pudo renovar son «sin conexión»", async () => {
    for (const falla of [new TypeError("fetch failed"), new ErrorSupabase("boom", 503), new ErrorSupabase("lento", 408), new ErrorSupabase("mucho", 429)]) {
      expect(await pedirCampanias(fuenteQue(falla))).toEqual({ ok: false, causa: "sin-conexion" });
    }
  });

  it("un rechazo de la base o una respuesta que el panel no entiende es un error, no «sin conexión»", async () => {
    expect(await pedirCampanias(fuenteQue(new ErrorSupabase("sin permiso", 403, "42501")))).toEqual({ ok: false, causa: "error" });
    expect(await pedirCampanias(fuenteQue(new RespuestaInesperada("campanias_del_coordinador", "no es una lista")))).toEqual({
      ok: false,
      causa: "error",
    });
  });

  it("no filtra el mensaje de la falla: el resultado solo lleva la causa", async () => {
    const resultado = await pedirCampanias(fuenteQue(new ErrorSupabase("secreto interno", 500)));

    expect(JSON.stringify(resultado)).not.toContain("secreto");
  });
});
