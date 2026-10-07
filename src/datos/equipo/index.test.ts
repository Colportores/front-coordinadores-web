import { afterEach, describe, expect, it, vi } from "vitest";

const VARIABLES = {
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_x",
  SUPABASE_COORDINADOR_EMAIL: "coordinador.demo@example.com",
  SUPABASE_COORDINADOR_PASSWORD: "clave",
};

function fijar(entorno: "development" | "production", variables: Record<string, string> = VARIABLES) {
  vi.stubEnv("NODE_ENV", entorno);
  for (const [nombre, valor] of Object.entries(variables)) vi.stubEnv(nombre, valor);
}

/**
 * `index.ts` decide la fuente al importarse, así que cada caso lo importa de nuevo. Tras `resetModules` la
 * simulada también es otra instancia: se importa de nuevo para comparar contra la que ve el selector.
 */
async function importarSelector() {
  vi.resetModules();
  const { fuenteEquipo } = await import("@/datos/equipo");
  const { fuenteEquipoSimulada } = await import("@/datos/equipo/simulado");
  return { fuenteEquipo, fuenteEquipoSimulada };
}

describe("fuenteEquipo (selector)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sin variables de Supabase es la simulada", async () => {
    fijar("development", {});

    const { fuenteEquipo, fuenteEquipoSimulada } = await importarSelector();

    expect(fuenteEquipo).toBe(fuenteEquipoSimulada);
  });

  it("en desarrollo y con las cuatro variables lee Supabase", async () => {
    fijar("development");
    const fetchFalso = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("/auth/v1/token")
        ? new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }))
        : new Response(JSON.stringify([])),
    );
    vi.stubGlobal("fetch", fetchFalso);

    const { fuenteEquipo, fuenteEquipoSimulada } = await importarSelector();
    const equipo = await fuenteEquipo.obtenerEquipo();

    expect(fuenteEquipo).not.toBe(fuenteEquipoSimulada);
    expect(equipo.region).toBe("Sin campaña vigente");
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it("en un build de producción (staging, producción, Pages) es la simulada aunque estén las variables", async () => {
    fijar("production");

    const { fuenteEquipo, fuenteEquipoSimulada } = await importarSelector();

    expect(fuenteEquipo).toBe(fuenteEquipoSimulada);
  });
});
