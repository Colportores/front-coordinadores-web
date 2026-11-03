import { describe, expect, it } from "vitest";

import { verificarEntornoDeProduccion } from "@/datos/supabase/config-publica";

// QA de #101 (decisión «Sin env», 27/10): el build de producción exige Supabase salvo modo simulado explícito.
const ARMADO = { PANEL_EXIGIR_SUPABASE: "1" };
const COMPLETO = { NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_x" };

function mensajeDe(env: Record<string, string | undefined>): string {
  try {
    verificarEntornoDeProduccion(env);
  } catch (error) {
    return (error as Error).message;
  }
  return "";
}

describe("#101 · verificarEntornoDeProduccion (casos límite)", () => {
  it("variables en blanco (solo espacios) cuentan como faltantes y el mensaje dice cuáles", () => {
    const mensaje = mensajeDe({ ...ARMADO, NEXT_PUBLIC_SUPABASE_URL: "   ", NEXT_PUBLIC_SUPABASE_ANON_KEY: "\t" });

    expect(mensaje).toContain("faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY");
  });

  it("solo la clave en blanco: dice que falta la clave y no la URL", () => {
    const mensaje = mensajeDe({ ...ARMADO, NEXT_PUBLIC_SUPABASE_URL: COMPLETO.NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: "  " });

    expect(mensaje).toContain("falta NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(mensaje).not.toContain("falta NEXT_PUBLIC_SUPABASE_URL");
  });

  it("el mensaje dice qué pasa y qué hacer, y no lleva ningún valor de las variables", () => {
    const mensaje = mensajeDe({ ...ARMADO, NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "" });

    expect(mensaje).toMatch(/exige la conexión a Supabase/);
    expect(mensaje).toMatch(/Cargalas/);
    expect(mensaje).toMatch(/PANEL_DATOS_SIMULADOS=1/);
    expect(mensaje).not.toContain("abc.supabase.co");
  });

  it("armado con la conexión completa y PANEL_DATOS_SIMULADOS prendido también pasa", () => {
    expect(() => verificarEntornoDeProduccion({ ...ARMADO, ...COMPLETO, PANEL_DATOS_SIMULADOS: "1" })).not.toThrow();
  });

  it("DEPLOY_PAGES distinto de «1» no es un permiso (build:pages siempre carga «1»)", () => {
    expect(mensajeDe({ ...ARMADO, DEPLOY_PAGES: "0" })).not.toBe("");
    expect(mensajeDe({ ...ARMADO, DEPLOY_PAGES: "" })).not.toBe("");
  });

  it.each(["sí", "SI", "On", "TRUE", "  1  "])("arma con %j (mayúsculas, tilde y espacios)", (valor) => {
    expect(mensajeDe({ PANEL_EXIGIR_SUPABASE: valor })).not.toBe("");
  });

  it("clave presente pero URL http:// ajena a localhost: frena y no escribe la clave", () => {
    const mensaje = mensajeDe({ ...ARMADO, NEXT_PUBLIC_SUPABASE_URL: "http://staging.interno", NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_clave_larga" });

    expect(mensaje).not.toBe("");
    expect(mensaje).not.toContain("clave_larga");
  });

  it("http://localhost sí vale: no frena un build local armado", () => {
    expect(() =>
      verificarEntornoDeProduccion({ ...ARMADO, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_x" }),
    ).not.toThrow();
  });

  // `activa()` solo conoce 1/true/si/sí/on: un typo en el deploy de diciembre deja salir el build sin Supabase, que es el
  // descuido que la decisión «Sin env» quiere cortar (el aviso del panel es la única red).
  it.skip("QA #101: un valor no reconocido de PANEL_EXIGIR_SUPABASE («yes», «enabled») desarma el chequeo en silencio; tendría que frenar el build diciendo qué valores vale", () => {
    for (const valor of ["yes", "enabled", "y", "armado"]) expect(mensajeDe({ PANEL_EXIGIR_SUPABASE: valor })).not.toBe("");
  });
});
