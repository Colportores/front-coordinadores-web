import { describe, expect, it, vi } from "vitest";

import { crearClienteSupabase, ErrorSupabase } from "@/datos/supabase/cliente";
import type { ConfigSupabase } from "@/datos/supabase/config";

const CONFIG: ConfigSupabase = {
  url: "https://abc.supabase.co",
  anonKey: "sb_publishable_x",
  email: "coordinador.demo@example.com",
  password: "clave",
};

const json = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { "Content-Type": "application/json" } });

const sesion = (token: string, expiresIn = 3600) => json({ access_token: token, expires_in: expiresIn });

type Llamada = { url: string; init: RequestInit };

/** Un `fetch` falso que anota cada llamada y responde con lo que decide `responder`. */
function fetchFalso(responder: (llamada: Llamada, numero: number) => Response) {
  const llamadas: Llamada[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const llamada = { url: String(url), init: init ?? {} };
    llamadas.push(llamada);
    return responder(llamada, llamadas.length);
  });
  return { fn: fn as unknown as typeof fetch, llamadas };
}

const esLogin = (l: Llamada) => l.url.includes("/auth/v1/token");

describe("crearClienteSupabase", () => {
  it("inicia sesión con correo y contraseña y consulta con el token del coordinador", async () => {
    const { fn, llamadas } = fetchFalso((l) => (esLogin(l) ? sesion("token-1") : json([{ id: "c1" }])));
    const cliente = crearClienteSupabase(CONFIG, fn);

    const filas = await cliente.consultar<{ id: string }[]>("campania?select=id");

    expect(filas).toEqual([{ id: "c1" }]);
    expect(llamadas[0].url).toBe("https://abc.supabase.co/auth/v1/token?grant_type=password");
    expect(llamadas[0].init.method).toBe("POST");
    expect(JSON.parse(String(llamadas[0].init.body))).toEqual({
      email: "coordinador.demo@example.com",
      password: "clave",
    });
    expect(llamadas[1].url).toBe("https://abc.supabase.co/rest/v1/campania?select=id");
    expect(llamadas[1].init.headers).toMatchObject({
      apikey: "sb_publishable_x",
      Authorization: "Bearer token-1",
    });
  });

  it("llama a una función por POST con los argumentos como JSON", async () => {
    const { fn, llamadas } = fetchFalso((l) => (esLogin(l) ? sesion("t") : json([])));
    const cliente = crearClienteSupabase(CONFIG, fn);

    await cliente.llamarRpc("colportores_de_campania", { p_campania_id: "c1" });

    expect(llamadas[1].url).toBe("https://abc.supabase.co/rest/v1/rpc/colportores_de_campania");
    expect(llamadas[1].init.method).toBe("POST");
    expect(JSON.parse(String(llamadas[1].init.body))).toEqual({ p_campania_id: "c1" });
    expect(llamadas[1].init.headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("reutiliza la sesión mientras no venza", async () => {
    const { fn, llamadas } = fetchFalso((l) => (esLogin(l) ? sesion("t") : json([])));
    const cliente = crearClienteSupabase(CONFIG, fn);

    await cliente.consultar("a");
    await cliente.consultar("b");

    expect(llamadas.filter(esLogin)).toHaveLength(1);
  });

  it("varias lecturas a la vez comparten un solo inicio de sesión", async () => {
    const { fn, llamadas } = fetchFalso((l) => (esLogin(l) ? sesion("t") : json([])));
    const cliente = crearClienteSupabase(CONFIG, fn);

    await Promise.all([cliente.consultar("a"), cliente.consultar("b"), cliente.consultar("c")]);

    expect(llamadas.filter(esLogin)).toHaveLength(1);
  });

  it("inicia otra sesión cuando la anterior está por vencer (un minuto de margen)", async () => {
    let reloj = 0;
    let numeroSesion = 0;
    const { fn, llamadas } = fetchFalso((l) => (esLogin(l) ? sesion(`token-${++numeroSesion}`, 3600) : json([])));
    const cliente = crearClienteSupabase(CONFIG, fn, () => reloj);

    await cliente.consultar("a");
    reloj = 3600 * 1000 - 61_000;
    await cliente.consultar("b");
    reloj = 3600 * 1000 - 59_000;
    await cliente.consultar("c");

    expect(llamadas.filter(esLogin)).toHaveLength(2);
    expect(llamadas.at(-1)?.init.headers).toMatchObject({ Authorization: "Bearer token-2" });
  });

  it("si una consulta vuelve con 401 inicia otra sesión y repite la consulta una vez", async () => {
    let intentos = 0;
    let numeroSesion = 0;
    const { fn, llamadas } = fetchFalso((l) => {
      if (esLogin(l)) return sesion(`token-${++numeroSesion}`);
      return ++intentos === 1 ? json({ message: "JWT expired" }, 401) : json([{ ok: true }]);
    });
    const cliente = crearClienteSupabase(CONFIG, fn);

    await expect(cliente.consultar("a")).resolves.toEqual([{ ok: true }]);
    expect(llamadas.filter(esLogin)).toHaveLength(2);
  });

  it("no insiste más de una vez si el 401 se repite", async () => {
    const { fn } = fetchFalso((l) => (esLogin(l) ? sesion("t") : json({ message: "no autorizado" }, 401)));
    const cliente = crearClienteSupabase(CONFIG, fn);

    await expect(cliente.consultar("a")).rejects.toMatchObject({ estado: 401 });
  });

  it("explica qué revisar cuando el inicio de sesión falla, sin mostrar la contraseña", async () => {
    const { fn } = fetchFalso(() => json({ error_description: "Invalid login credentials" }, 400));
    const cliente = crearClienteSupabase(CONFIG, fn);

    const error = await cliente.consultar("a").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErrorSupabase);
    expect((error as ErrorSupabase).message).toContain("SUPABASE_COORDINADOR_PASSWORD");
    expect((error as ErrorSupabase).message).not.toContain("clave");
    expect((error as ErrorSupabase).estado).toBe(400);
  });

  it("un error de PostgREST trae el mensaje y el código de la base", async () => {
    const { fn } = fetchFalso((l) =>
      esLogin(l) ? sesion("t") : json({ message: "campaña no vigente", code: "CZ002" }, 400),
    );
    const cliente = crearClienteSupabase(CONFIG, fn);

    await expect(cliente.llamarRpc("x", {})).rejects.toThrow("Supabase respondió 400: campaña no vigente (CZ002)");
  });

  it("una respuesta que no es JSON cae al texto del estado HTTP", async () => {
    const { fn } = fetchFalso((l) =>
      esLogin(l) ? sesion("t") : new Response("<html>", { status: 502, statusText: "Bad Gateway" }),
    );
    const cliente = crearClienteSupabase(CONFIG, fn);

    await expect(cliente.consultar("a")).rejects.toThrow("Supabase respondió 502: Bad Gateway");
  });
});
