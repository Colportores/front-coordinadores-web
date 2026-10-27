import { afterEach, describe, expect, it, vi } from "vitest";

import { cerrarSesion, iniciarSesion, verificarAcceso } from "@/auth/acceso";
import { borrarCookiesDeSesion, crearSupabaseConCookies, esCookieDeSesion } from "@/auth/supabase-cookies";
import { borrarSesionGuardada } from "@/datos/supabase/sdk";
import { CONFIG_PRUEBA, navegadorFalso, prenderSupabaseFalso } from "@/test/cookies-supabase";
import { json } from "@/test/supabase";

const CREDENCIALES = { correo: "coordinador@example.com", contrasena: "Clave-de-prueba1" };
const CLAVE = "sb-proyecto-auth-token";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("la sesión en cookies (decisión «Sesión panel»)", () => {
  it("al iniciar sesión escribe la sesión en cookies httpOnly, sin cache y solo para este sitio", async () => {
    prenderSupabaseFalso();
    const navegador = navegadorFalso();

    const resultado = await iniciarSesion(crearSupabaseConCookies(CONFIG_PRUEBA, navegador), CREDENCIALES);

    expect(resultado).toEqual({ tipo: "ok", usuarioId: "u-1" });
    expect(navegador.escritas.length).toBeGreaterThan(0);
    for (const { name, options } of navegador.escritas) {
      expect(name.startsWith(CLAVE), name).toBe(true);
      // Lo que cumple la decisión: el JavaScript de la página no puede leer el token.
      expect(options, name).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    }
    expect(navegador.cabeceras["Cache-Control"]).toContain("no-store");
  });

  it("la sesión de las cookies sirve para el pedido siguiente: el rol se comprueba con su token", async () => {
    const { llamadas } = prenderSupabaseFalso();
    const navegador = navegadorFalso();
    await iniciarSesion(crearSupabaseConCookies(CONFIG_PRUEBA, navegador), CREDENCIALES);
    llamadas.length = 0;

    // Otro pedido: un cliente nuevo que solo tiene las cookies.
    const resultado = await verificarAcceso(crearSupabaseConCookies(CONFIG_PRUEBA, navegador));

    expect(resultado).toEqual({ tipo: "ok", usuarioId: "u-1" });
    expect(llamadas.map((l) => l.ruta)).toEqual(["/rest/v1/rpc/tiene_rol", "/rest/v1/rpc/estado_cuenta"]);
    expect(llamadas[0].token).toBe("token-1");
  });

  it("sin cookies no hay sesión", async () => {
    const { llamadas } = prenderSupabaseFalso();
    expect(await verificarAcceso(crearSupabaseConCookies(CONFIG_PRUEBA, navegadorFalso()))).toEqual({ tipo: "sin-sesion" });
    expect(llamadas).toEqual([]);
  });

  it("una cuenta que no es de coordinador no deja cookies de sesión", async () => {
    prenderSupabaseFalso({ tieneRol: () => json(false) });
    const navegador = navegadorFalso();

    const resultado = await iniciarSesion(crearSupabaseConCookies(CONFIG_PRUEBA, navegador), CREDENCIALES);

    expect(resultado).toEqual({ tipo: "sin-acceso" });
    expect(navegador.cookies.size).toBe(0);
  });

  it("cerrar sesión borra las cookies y avisa al servidor", async () => {
    const { llamadas } = prenderSupabaseFalso();
    const navegador = navegadorFalso();
    const supabase = crearSupabaseConCookies(CONFIG_PRUEBA, navegador);
    await iniciarSesion(supabase, CREDENCIALES);

    expect(await cerrarSesion(supabase)).toEqual({ tipo: "cerrada" });

    expect(navegador.cookies.size).toBe(0);
    expect(llamadas.map((l) => l.ruta)).toContain("/auth/v1/logout");
  });

  it("cerrar sesión sin red borra las cookies igual y lo dice", async () => {
    const sinRed = (): never => {
      throw new TypeError("fetch failed");
    };
    const { servidor } = prenderSupabaseFalso();
    const navegador = navegadorFalso();
    const supabase = crearSupabaseConCookies(CONFIG_PRUEBA, navegador);
    await iniciarSesion(supabase, CREDENCIALES);
    servidor.revocar = sinRed;

    expect(await cerrarSesion(supabase)).toEqual({ tipo: "cerrada-sin-revocar" });

    expect(navegador.cookies.size).toBe(0);
  });

  it("borrarSesionGuardada quita todas las cookies de la sesión y deja las demás", async () => {
    prenderSupabaseFalso();
    const navegador = navegadorFalso();
    const supabase = crearSupabaseConCookies(CONFIG_PRUEBA, navegador);
    await iniciarSesion(supabase, CREDENCIALES);
    navegador.cookies.set("campania-elegida", "abc");
    navegador.cookies.set(`${CLAVE}-code-verifier`, "x");

    await borrarSesionGuardada(supabase);

    expect([...navegador.cookies.keys()]).toEqual(["campania-elegida"]);
  });
});

describe("esCookieDeSesion y borrarCookiesDeSesion", () => {
  it("reconoce el token entero, en trozos y el verificador, y nada más", () => {
    for (const nombre of [CLAVE, `${CLAVE}.0`, `${CLAVE}.12`, `${CLAVE}-code-verifier`]) expect(esCookieDeSesion(nombre, CLAVE), nombre).toBe(true);
    for (const nombre of ["campania-elegida", "sb-otro-auth-token", `x${CLAVE}`]) expect(esCookieDeSesion(nombre, CLAVE), nombre).toBe(false);
  });

  it("sin cookies de sesión no escribe nada", () => {
    const navegador = navegadorFalso();
    navegador.cookies.set("campania-elegida", "abc");
    borrarCookiesDeSesion(navegador, CLAVE);
    expect(navegador.escritas).toEqual([]);
  });
});
