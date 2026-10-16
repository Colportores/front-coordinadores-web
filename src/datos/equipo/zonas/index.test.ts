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

/** `index.ts` decide la fuente al importarse: cada caso lo importa de nuevo, y la simulada también. */
async function importarSelector() {
  vi.resetModules();
  const { fuenteZonas } = await import("@/datos/equipo/zonas");
  const { fuenteZonasSimulada } = await import("@/datos/equipo/zonas/simulado");
  return { fuenteZonas, fuenteZonasSimulada };
}

describe("fuenteZonas (selector)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sin variables de Supabase es la simulada", async () => {
    fijar("development", {});

    const { fuenteZonas, fuenteZonasSimulada } = await importarSelector();

    expect(fuenteZonas).toBe(fuenteZonasSimulada);
  });

  it("con variables incompletas es la simulada", async () => {
    fijar("development", { SUPABASE_URL: VARIABLES.SUPABASE_URL, SUPABASE_ANON_KEY: VARIABLES.SUPABASE_ANON_KEY });

    const { fuenteZonas, fuenteZonasSimulada } = await importarSelector();

    expect(fuenteZonas).toBe(fuenteZonasSimulada);
  });

  it("en desarrollo y con las cuatro variables lee Supabase: sin campaña vigente, la vista 24 no tiene datos", async () => {
    fijar("development");
    const fetchFalso = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("/auth/v1/token")
        ? new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }))
        : new Response(JSON.stringify([])),
    );
    vi.stubGlobal("fetch", fetchFalso);

    const { fuenteZonas, fuenteZonasSimulada } = await importarSelector();
    const datos = await fuenteZonas.obtenerZonas();

    expect(fuenteZonas).not.toBe(fuenteZonasSimulada);
    expect(datos).toBeNull();
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it("en un build de producción (staging, producción, Pages) es la simulada aunque estén las variables", async () => {
    fijar("production");

    const { fuenteZonas, fuenteZonasSimulada } = await importarSelector();

    expect(fuenteZonas).toBe(fuenteZonasSimulada);
  });
});
