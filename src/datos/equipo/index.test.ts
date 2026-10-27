import { afterEach, describe, expect, it, vi } from "vitest";

import { COOKIE_CAMPANIA_ELEGIDA } from "@/shell/campania-elegida";

// La campaña que eligió la coordinadora (#70) sale de la cookie del pedido; acá no hay pedido.
const cookies = vi.hoisted(() => ({ valores: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nombre: string) => (cookies.valores.has(nombre) ? { name: nombre, value: cookies.valores.get(nombre) } : undefined),
  }),
}));

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
    cookies.valores.clear();
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
    const equipo = await fuenteEquipo.obtenerEquipoPorCiudad();

    expect(fuenteEquipo).not.toBe(fuenteEquipoSimulada);
    // El proyecto no tiene campañas del coordinador: no hay equipo que mostrar, y no se inventan datos de prueba.
    expect(equipo).toBeNull();
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it("en desarrollo la vista de añadir colportores va por las RPC y no por la simulada", async () => {
    fijar("development");
    const fetchFalso = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("/auth/v1/token")
        ? new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }))
        : new Response(JSON.stringify([])),
    );
    vi.stubGlobal("fetch", fetchFalso);

    const { fuenteEquipo } = await importarSelector();
    const datos = await fuenteEquipo.obtenerAnadirColportor();

    // El proyecto no tiene campañas del coordinador: no hay a quién añadir, y no se inventan datos de prueba.
    expect(datos).toBeNull();
    const rutas = fetchFalso.mock.calls.map(([url]) => new URL(String(url)).pathname);
    expect(rutas).toContain("/rest/v1/rpc/campanias_del_coordinador");
  });

  it("en desarrollo la vista de añadir colportores trabaja con la campaña que eligió la coordinadora en el topbar", async () => {
    fijar("development");
    const primera = "11111111-1111-4111-8111-111111111111";
    const elegida = "22222222-2222-4222-8222-222222222222";
    cookies.valores.set(COOKIE_CAMPANIA_ELEGIDA, elegida);
    const fetchFalso = vi.fn(async (url: string | URL | Request) => {
      const ruta = new URL(String(url)).pathname;
      if (ruta.includes("/auth/v1/token")) return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }));
      if (ruta.endsWith("/campanias_del_coordinador")) {
        return new Response(
          JSON.stringify([
            { id: primera, nombre: "Verano 2026", tipo: "VERANO", fecha_inicio: "2026-09-01", fecha_fin: null },
            { id: elegida, nombre: "Verano 2027", tipo: "VERANO", fecha_inicio: "2027-01-04", fecha_fin: null },
          ]),
        );
      }
      return new Response(JSON.stringify([]));
    });
    vi.stubGlobal("fetch", fetchFalso);

    const { fuenteEquipo } = await importarSelector();
    const datos = await fuenteEquipo.obtenerAnadirColportor();

    expect(datos).toMatchObject({ campaniaId: elegida, campania: "Verano 2027" });
  });

  it("en un build de producción (staging, producción, Pages) es la simulada aunque estén las variables", async () => {
    fijar("production");

    const { fuenteEquipo, fuenteEquipoSimulada } = await importarSelector();

    expect(fuenteEquipo).toBe(fuenteEquipoSimulada);
  });
});
