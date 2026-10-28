import { describe, expect, it, vi } from "vitest";

import { modoDeAcceso } from "@/auth/modo";

const URL = "https://proyecto.supabase.co";
const CLAVE = "sb_publishable_prueba";

describe("modoDeAcceso", () => {
  it("sin variables, el panel no tiene login", () => {
    expect(modoDeAcceso()).toBe("apagado");
  });

  it("con la URL y una clave publicable, el login está activo", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", CLAVE);
    expect(modoDeAcceso()).toBe("activo");
  });

  it("una variable sola, o una que no sirve, no apaga el login: se bloquea", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL);
    expect(modoDeAcceso()).toBe("mal-configurado");

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", CLAVE);
    expect(modoDeAcceso()).toBe("mal-configurado");

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://otro-host.com");
    expect(modoDeAcceso()).toBe("mal-configurado");

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_secret_loquesea123");
    expect(modoDeAcceso()).toBe("mal-configurado");
  });

  it("variables en blanco cuentan como ausentes", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "  ");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(modoDeAcceso()).toBe("apagado");
  });

  it("el sitio de prueba nunca tiene login, aunque haya variables", () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", CLAVE);
    expect(modoDeAcceso()).toBe("apagado");
  });
});
