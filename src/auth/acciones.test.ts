import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cerrarSesionAccion, iniciarSesionAccion } from "@/auth/acciones";
import { correoDeLaSesion } from "@/auth/correo-de-sesion";
import { crearSupabaseDeServidor } from "@/auth/supabase-servidor";
import { CONFIG_PRUEBA, prenderSupabaseFalso } from "@/test/cookies-supabase";
import { errorDeAuth, json } from "@/test/supabase";

/** `cookies()` de `next/headers` con un almacén en memoria, como en una server action (donde sí se puede escribir). */
const almacen = vi.hoisted(() => ({
  datos: new Map<string, string>(),
  opciones: new Map<string, Record<string, unknown>>(),
  soloLectura: false,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...almacen.datos].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, opciones: Record<string, unknown>) => {
      if (almacen.soloLectura) throw new Error("Cookies can only be modified in a Server Action or Route Handler.");
      if (value) {
        almacen.datos.set(name, value);
        almacen.opciones.set(name, opciones);
      } else {
        almacen.datos.delete(name);
      }
    },
  }),
}));

function prenderLogin() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", CONFIG_PRUEBA.url);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", CONFIG_PRUEBA.anonKey);
}

beforeEach(() => {
  almacen.datos.clear();
  almacen.opciones.clear();
  almacen.soloLectura = false;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("iniciarSesionAccion", () => {
  it("entra: deja la sesión en cookies httpOnly y devuelve adónde ir", async () => {
    prenderLogin();
    prenderSupabaseFalso();

    const respuesta = await iniciarSesionAccion("coordinador@example.com", "Clave-de-prueba1", "/equipo");

    expect(respuesta).toEqual({ tipo: "ok", destino: "/equipo" });
    expect(almacen.datos.size).toBeGreaterThan(0);
    for (const [nombre, opciones] of almacen.opciones) expect(opciones, nombre).toMatchObject({ httpOnly: true, sameSite: "lax" });
  });

  it("el destino que manda el navegador no se confía: un sitio ajeno es la pantalla inicial", async () => {
    prenderLogin();
    prenderSupabaseFalso();
    expect(await iniciarSesionAccion("coordinador@example.com", "Clave-de-prueba1", "//sitio.malo")).toEqual({ tipo: "ok", destino: "/inicio" });
    expect(await iniciarSesionAccion("coordinador@example.com", "Clave-de-prueba1")).toEqual({ tipo: "ok", destino: "/inicio" });
  });

  it("lo que no es texto no llega a Supabase", async () => {
    prenderLogin();
    const { llamadas } = prenderSupabaseFalso();
    expect(await iniciarSesionAccion({ a: 1 }, "x")).toEqual({ tipo: "credenciales-invalidas" });
    expect(await iniciarSesionAccion("a@b.com", null)).toEqual({ tipo: "credenciales-invalidas" });
    expect(llamadas).toEqual([]);
  });

  it("correo o contraseña incorrectos: no deja nada guardado", async () => {
    prenderLogin();
    prenderSupabaseFalso({ iniciar: () => errorDeAuth(400, "invalid_credentials", "Invalid login credentials") });
    expect(await iniciarSesionAccion("coordinador@example.com", "mala")).toEqual({ tipo: "credenciales-invalidas" });
    expect(almacen.datos.size).toBe(0);
  });

  it("una cuenta sin el rol no queda con sesión", async () => {
    prenderLogin();
    prenderSupabaseFalso({ tieneRol: () => json(false) });
    expect(await iniciarSesionAccion("otra@example.com", "Clave-de-prueba1")).toEqual({ tipo: "sin-acceso" });
    expect(almacen.datos.size).toBe(0);
  });

  it("sin red o con el servicio caído es «no disponible», nunca credenciales malas", async () => {
    prenderLogin();
    prenderSupabaseFalso({
      iniciar: () => {
        throw new TypeError("fetch failed");
      },
    });
    expect(await iniciarSesionAccion("coordinador@example.com", "Clave-de-prueba1")).toEqual({ tipo: "no-disponible" });
  });

  it("un coordinador suspendido no entra ni queda con sesión", async () => {
    prenderLogin();
    prenderSupabaseFalso({ estadoCuenta: () => json("SUSPENDIDA") });
    expect(await iniciarSesionAccion("coordinador@example.com", "Clave-de-prueba1")).toEqual({ tipo: "suspendida" });
    expect(almacen.datos.size).toBe(0);
  });

  it("sin login configurado no intenta nada", async () => {
    const { llamadas } = prenderSupabaseFalso();
    expect(await iniciarSesionAccion("coordinador@example.com", "Clave-de-prueba1")).toEqual({ tipo: "no-disponible" });
    expect(llamadas).toEqual([]);
  });
});

describe("cerrarSesionAccion", () => {
  it("borra las cookies de la sesión", async () => {
    prenderLogin();
    prenderSupabaseFalso();
    await iniciarSesionAccion("coordinador@example.com", "Clave-de-prueba1");
    almacen.datos.set("campania-elegida", "abc");

    expect(await cerrarSesionAccion()).toEqual({ tipo: "cerrada" });

    expect([...almacen.datos.keys()]).toEqual(["campania-elegida"]);
  });

  it("sin red igual la borra y lo dice", async () => {
    prenderLogin();
    const { servidor } = prenderSupabaseFalso();
    await iniciarSesionAccion("coordinador@example.com", "Clave-de-prueba1");
    servidor.revocar = () => {
      throw new TypeError("fetch failed");
    };

    expect(await cerrarSesionAccion()).toEqual({ tipo: "cerrada-sin-revocar" });
    expect(almacen.datos.size).toBe(0);
  });

  it("sin sesión abierta es idempotente", async () => {
    prenderLogin();
    prenderSupabaseFalso();
    expect(await cerrarSesionAccion()).toEqual({ tipo: "cerrada" });
  });
});

describe("correoDeLaSesion", () => {
  it("dice de qué cuenta es la sesión abierta", async () => {
    prenderLogin();
    prenderSupabaseFalso();
    await iniciarSesionAccion("coordinador@example.com", "Clave-de-prueba1");
    expect(await correoDeLaSesion()).toBe("coordinador@example.com");
  });

  it("sin sesión, o sin poder preguntar, es null", async () => {
    prenderLogin();
    prenderSupabaseFalso();
    expect(await correoDeLaSesion()).toBeNull();

    await iniciarSesionAccion("coordinador@example.com", "Clave-de-prueba1");
    prenderSupabaseFalso({
      usuario: () => {
        throw new TypeError("fetch failed");
      },
    });
    expect(await correoDeLaSesion()).toBeNull();
  });
});

describe("crearSupabaseDeServidor", () => {
  it("en un componente de servidor (cookies de solo lectura) no tira al renovar o escribir", async () => {
    prenderLogin();
    prenderSupabaseFalso();
    await iniciarSesionAccion("coordinador@example.com", "Clave-de-prueba1");
    almacen.soloLectura = true;

    const supabase = await crearSupabaseDeServidor();
    await expect(supabase.auth.signOut({ scope: "local" })).resolves.toBeDefined();
  });

  it("sin configuración tira, para que nadie lo use sin saberlo", async () => {
    await expect(crearSupabaseDeServidor()).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
