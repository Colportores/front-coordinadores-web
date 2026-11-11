import { describe, expect, it } from "vitest";

import { leerConfigSupabase } from "@/datos/supabase/config";

const COMPLETO = {
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_x",
  SUPABASE_COORDINADOR_EMAIL: "coordinador.demo@example.com",
  SUPABASE_COORDINADOR_PASSWORD: "clave",
};

describe("leerConfigSupabase", () => {
  it("devuelve la configuración cuando están las cuatro variables", () => {
    expect(leerConfigSupabase({ ...COMPLETO, NODE_ENV: "development" })).toEqual({
      url: "https://abc.supabase.co",
      anonKey: "sb_publishable_x",
      email: "coordinador.demo@example.com",
      password: "clave",
    });
  });

  it("limpia espacios y la barra final de la URL", () => {
    const config = leerConfigSupabase({ ...COMPLETO, SUPABASE_URL: "  https://abc.supabase.co//  " });

    expect(config?.url).toBe("https://abc.supabase.co");
  });

  it("una URL de solo barras cuenta como ausente y una cadena enorme de barras no cuelga la lectura", () => {
    const inicio = Date.now();
    expect(leerConfigSupabase({ ...COMPLETO, SUPABASE_URL: "///" })).toBeNull();
    expect(leerConfigSupabase({ ...COMPLETO, SUPABASE_URL: `https://abc.supabase.co${"/".repeat(200_000)}` })?.url).toBe("https://abc.supabase.co");
    expect(Date.now() - inicio).toBeLessThan(1500);
  });

  it.each(Object.keys(COMPLETO))("queda apagada si falta %s", (variable) => {
    expect(leerConfigSupabase({ ...COMPLETO, [variable]: undefined })).toBeNull();
    expect(leerConfigSupabase({ ...COMPLETO, [variable]: "  " })).toBeNull();
  });

  it("queda apagada en cualquier build de producción, aunque estén las variables", () => {
    expect(leerConfigSupabase({ ...COMPLETO, NODE_ENV: "production" })).toBeNull();
  });
});
