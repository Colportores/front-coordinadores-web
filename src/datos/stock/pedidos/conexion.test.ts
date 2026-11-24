import { afterEach, describe, expect, it, vi } from "vitest";

import { fuenteDePedidos, pedidosConectada } from "@/datos/stock/pedidos/conexion";

afterEach(() => {
  vi.unstubAllEnvs();
});

function puente() {
  vi.stubEnv("SUPABASE_URL", "https://demo.supabase.co");
  vi.stubEnv("SUPABASE_ANON_KEY", "sb_publishable_demo");
  vi.stubEnv("SUPABASE_COORDINADOR_EMAIL", "c@ejemplo.org");
  vi.stubEnv("SUPABASE_COORDINADOR_PASSWORD", "clave");
}

describe("de dónde lee la vista 35 (la regla que comparten el selector y la franja)", () => {
  it("con la conexión pública, la sesión de quien entró", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_prueba");
    expect(fuenteDePedidos()).toBe("sesion");
    expect(pedidosConectada()).toBe(true);
  });

  it("sin ella y con el puente de desarrollo, la demo", () => {
    puente();
    expect(fuenteDePedidos()).toBe("puente");
    expect(pedidosConectada()).toBe(true);
  });

  it("sin nada, o en el sitio de prueba aunque haya puente, la simulada", () => {
    expect(fuenteDePedidos()).toBe("simulada");
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
    vi.stubEnv("NODE_ENV", "production");
    puente();
    expect(pedidosConectada()).toBe(false);
  });
});
