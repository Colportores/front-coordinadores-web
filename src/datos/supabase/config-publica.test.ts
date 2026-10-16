import { describe, expect, it, vi } from "vitest";

import { configPublicaSupabase, leerConfigPublicaSupabase } from "@/datos/supabase/config-publica";

const COMPLETO = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_x",
};

/** Un JWT con la carga dada (la firma no importa: solo se lee el rol). */
function jwt(carga: object): string {
  const base64url = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url(carga)}.firma-de-prueba`;
}

describe("leerConfigPublicaSupabase", () => {
  it("devuelve la URL y la clave cuando están las dos", () => {
    expect(leerConfigPublicaSupabase(COMPLETO)).toEqual({ url: "https://abc.supabase.co", anonKey: "sb_publishable_x" });
  });

  it("limpia espacios y la barra final de la URL", () => {
    const config = leerConfigPublicaSupabase({ ...COMPLETO, NEXT_PUBLIC_SUPABASE_URL: "  https://abc.supabase.co//  " });

    expect(config?.url).toBe("https://abc.supabase.co");
  });

  it("acepta el Supabase local por http", () => {
    expect(leerConfigPublicaSupabase({ ...COMPLETO, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })?.url).toBe(
      "http://127.0.0.1:54321",
    );
  });

  it.each(Object.keys(COMPLETO))("queda en null si falta %s", (variable) => {
    expect(leerConfigPublicaSupabase({ ...COMPLETO, [variable]: undefined })).toBeNull();
    expect(leerConfigPublicaSupabase({ ...COMPLETO, [variable]: "  " })).toBeNull();
  });

  it.each(["abc.supabase.co", "javascript:alert(1)", "ftp://abc.supabase.co", "no es una url"])(
    "queda en null si la URL no es http(s): «%s»",
    (url) => {
      expect(leerConfigPublicaSupabase({ ...COMPLETO, NEXT_PUBLIC_SUPABASE_URL: url })).toBeNull();
    },
  );

  it("acepta una clave anónima en JWT (formato anterior de Supabase)", () => {
    const anonKey = jwt({ iss: "supabase", ref: "abc", role: "anon" });

    expect(leerConfigPublicaSupabase({ ...COMPLETO, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey })?.anonKey).toBe(anonKey);
  });

  it("rechaza una clave secreta: con NEXT_PUBLIC_ iría al navegador de todos", () => {
    expect(leerConfigPublicaSupabase({ ...COMPLETO, NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_secret_abcdefgh" })).toBeNull();
  });

  it("rechaza un JWT con el rol de servicio, que se saltea la RLS", () => {
    const clave = jwt({ iss: "supabase", ref: "abc", role: "service_role" });

    expect(leerConfigPublicaSupabase({ ...COMPLETO, NEXT_PUBLIC_SUPABASE_ANON_KEY: clave })).toBeNull();
  });
});

describe("configPublicaSupabase", () => {
  it("lee las variables NEXT_PUBLIC_ del entorno del build", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_x");

    expect(configPublicaSupabase()).toEqual({ url: "https://abc.supabase.co", anonKey: "sb_publishable_x" });
  });

  it("queda en null sin variables", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", undefined);

    expect(configPublicaSupabase()).toBeNull();
  });
});
