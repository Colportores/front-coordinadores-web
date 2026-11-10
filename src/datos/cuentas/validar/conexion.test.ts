import { afterEach, describe, expect, it, vi } from "vitest";

import { fuenteDeValidarTickets, validarTicketsConectada } from "@/datos/cuentas/validar/conexion";

afterEach(() => {
  vi.unstubAllEnvs();
});

function puente() {
  vi.stubEnv("SUPABASE_URL", "https://demo.supabase.co");
  vi.stubEnv("SUPABASE_ANON_KEY", "sb_publishable_demo");
  vi.stubEnv("SUPABASE_COORDINADOR_EMAIL", "c@ejemplo.org");
  vi.stubEnv("SUPABASE_COORDINADOR_PASSWORD", "clave");
}

describe("de dónde lee la vista 29 (la regla que comparten el selector y la franja)", () => {
  it("con la conexión pública, la sesión de quien entró", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_prueba");
    expect(fuenteDeValidarTickets()).toBe("sesion");
    expect(validarTicketsConectada()).toBe(true);
  });

  it("sin ella y con el puente de desarrollo, la demo", () => {
    puente();
    expect(fuenteDeValidarTickets()).toBe("puente");
    expect(validarTicketsConectada()).toBe(true);
  });

  it("sin nada, o en el sitio de prueba aunque haya puente, la simulada", () => {
    expect(fuenteDeValidarTickets()).toBe("simulada");
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
    vi.stubEnv("NODE_ENV", "production");
    puente();
    expect(validarTicketsConectada()).toBe(false);
  });
});
