import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cerrarSesion, iniciarSesion, verificarAcceso } from "@/auth/acceso";
import {
  crearSupabasePrueba,
  errorDeAuth,
  errorDePostgrest,
  json,
  respuestaDeSesion,
  type LlamadaFalsa,
} from "@/test/supabase";

const CREDENCIALES = { correo: "coordinador@example.com", contrasena: "Clave-de-prueba1" };

/** Lo que contesta el Supabase falso a cada endpoint; cada test cambia lo que necesita, también a mitad del test. */
type Contestacion = () => Response | Promise<Response>;

interface Servidor {
  iniciar: Contestacion;
  renovar: Contestacion;
  revocar: Contestacion;
  tieneRol: Contestacion;
}

function servidorFalso(cambios: Partial<Servidor> = {}) {
  const servidor: Servidor = {
    iniciar: () => respuestaDeSesion(),
    renovar: () => respuestaDeSesion({ token: "token-renovado" }),
    revocar: () => new Response(null, { status: 204 }),
    tieneRol: () => json(true),
    ...cambios,
  };
  const prueba = crearSupabasePrueba((llamada: LlamadaFalsa) => {
    switch (llamada.ruta) {
      case "/auth/v1/token":
        return llamada.url.searchParams.get("grant_type") === "refresh_token" ? servidor.renovar() : servidor.iniciar();
      case "/auth/v1/logout":
        return servidor.revocar();
      case "/rest/v1/rpc/tiene_rol":
        return servidor.tieneRol();
      default:
        throw new Error(`Ruta no prevista en el test: ${llamada.ruta}`);
    }
  });
  return { ...prueba, servidor };
}

const sinRed = (): never => {
  throw new TypeError("fetch failed");
};

/** Una conexión que nunca contesta. */
const colgada = (): Promise<Response> => new Promise(() => {});

const rutas = (llamadas: LlamadaFalsa[]) => llamadas.map((l) => l.ruta);

describe("iniciarSesion", () => {
  it("abre la sesión y comprueba el rol COORDINADOR con la sesión recién abierta", async () => {
    const { supabase, llamadas } = servidorFalso({ iniciar: () => respuestaDeSesion({ token: "token-1", usuarioId: "u-7" }) });

    const resultado = await iniciarSesion(supabase, CREDENCIALES);

    expect(resultado).toEqual({ tipo: "ok", usuarioId: "u-7" });
    expect(llamadas[0]).toMatchObject({
      metodo: "POST",
      ruta: "/auth/v1/token",
      cuerpo: { email: "coordinador@example.com", password: "Clave-de-prueba1" },
    });
    expect(llamadas[1]).toMatchObject({
      metodo: "POST",
      ruta: "/rest/v1/rpc/tiene_rol",
      token: "token-1",
      cuerpo: { p_codigo: "COORDINADOR" },
    });
    expect((await supabase.auth.getSession()).data.session?.access_token).toBe("token-1");
  });

  it("normaliza el correo y manda la contraseña tal cual, con sus espacios", async () => {
    const { supabase, llamadas } = servidorFalso();

    await iniciarSesion(supabase, { correo: "  coordinador@example.com  ", contrasena: " con espacios " });

    expect(llamadas[0].cuerpo).toMatchObject({ email: "coordinador@example.com", password: " con espacios " });
  });

  it.each([
    ["sin correo", { correo: "", contrasena: "clave" }],
    ["con el correo en blanco", { correo: "   ", contrasena: "clave" }],
    ["sin contraseña", { correo: "coordinador@example.com", contrasena: "" }],
    ["con un correo de más de 254 caracteres", { correo: `${"a".repeat(250)}@x.uy`, contrasena: "clave" }],
  ])("%s: no llama a Supabase y dice que las credenciales no sirven", async (_caso, credenciales) => {
    const { supabase, llamadas } = servidorFalso();

    expect(await iniciarSesion(supabase, credenciales)).toEqual({ tipo: "credenciales-invalidas" });
    expect(llamadas).toHaveLength(0);
  });

  it("con correo o contraseña equivocados no comprueba el rol ni deja sesión", async () => {
    const { supabase, llamadas } = servidorFalso({
      iniciar: () => errorDeAuth(400, "invalid_credentials", "Invalid login credentials"),
    });

    expect(await iniciarSesion(supabase, CREDENCIALES)).toEqual({ tipo: "credenciales-invalidas" });
    expect(rutas(llamadas)).toEqual(["/auth/v1/token"]);
    expect((await supabase.auth.getSession()).data.session).toBeNull();
  });

  it("reconoce el mensaje de siempre cuando el servidor no manda código de error", async () => {
    const { supabase } = servidorFalso({ iniciar: () => json({ msg: "Invalid login credentials" }, 400) });

    expect(await iniciarSesion(supabase, CREDENCIALES)).toEqual({ tipo: "credenciales-invalidas" });
  });

  it("avisa que falta verificar el correo", async () => {
    const { supabase } = servidorFalso({ iniciar: () => errorDeAuth(400, "email_not_confirmed", "Email not confirmed") });

    expect(await iniciarSesion(supabase, CREDENCIALES)).toEqual({ tipo: "correo-sin-verificar" });
  });

  it("avisa cuando Supabase limita los intentos", async () => {
    const { supabase } = servidorFalso({
      iniciar: () => errorDeAuth(429, "over_request_rate_limit", "Request rate limit reached"),
    });

    expect(await iniciarSesion(supabase, CREDENCIALES)).toEqual({ tipo: "demasiados-intentos" });
  });

  it("una cuenta bloqueada por Supabase no entra", async () => {
    const { supabase } = servidorFalso({ iniciar: () => errorDeAuth(403, "user_banned", "User banned") });

    expect(await iniciarSesion(supabase, CREDENCIALES)).toEqual({ tipo: "sin-acceso" });
  });

  it("sin red, con Supabase caído o ante un error que no se conoce no dice que las credenciales estén mal", async () => {
    for (const iniciar of [sinRed, () => json({ msg: "bad gateway" }, 502), () => errorDeAuth(400, "otro_codigo", "algo")]) {
      const { supabase } = servidorFalso({ iniciar });

      expect(await iniciarSesion(supabase, CREDENCIALES)).toEqual({ tipo: "no-disponible" });
    }
  });

  describe("cuando las credenciales sirven pero la cuenta no es de coordinador", () => {
    it("no entra y no deja una sesión abierta en el panel", async () => {
      const { supabase, llamadas } = servidorFalso({ tieneRol: () => json(false) });

      expect(await iniciarSesion(supabase, CREDENCIALES)).toEqual({ tipo: "sin-acceso" });
      expect(llamadas.at(-1)).toMatchObject({ ruta: "/auth/v1/logout", token: "token-1" });
      expect(llamadas.at(-1)?.url.searchParams.get("scope")).toBe("local");
      expect((await supabase.auth.getSession()).data.session).toBeNull();
    });

    it("sin acceso sigue siendo sin acceso aunque no haya red para revocar la sesión", async () => {
      const { supabase } = servidorFalso({ tieneRol: () => json(false), revocar: sinRed });

      expect(await iniciarSesion(supabase, CREDENCIALES)).toEqual({ tipo: "sin-acceso" });
      expect((await supabase.auth.getSession()).data.session).toBeNull();
    });
  });

  describe("cuando no se puede comprobar el rol", () => {
    it.each([
      ["sin red", sinRed],
      ["con Supabase caído", () => json({ message: "caído" }, 503)],
      ["con la función sin desplegar", () => errorDePostgrest(404, "PGRST202", "Could not find the function")],
      ["con un JWT que Supabase acaba de emitir y la base no acepta (claves de otro proyecto)", () => errorDePostgrest(401, "PGRST301", "JWT invalid")],
      ["con una respuesta que no es un booleano", () => json(null)],
    ])("%s: no entra, pero no acusa a las credenciales ni a la sesión", async (_caso, tieneRol) => {
      const { supabase } = servidorFalso({ tieneRol });

      expect(await iniciarSesion(supabase, CREDENCIALES)).toEqual({ tipo: "no-disponible" });
    });

    it("deja la sesión abierta (es válida) y el siguiente intento entra", async () => {
      const { supabase, servidor } = servidorFalso({ tieneRol: sinRed });

      expect(await iniciarSesion(supabase, CREDENCIALES)).toEqual({ tipo: "no-disponible" });
      expect((await supabase.auth.getSession()).data.session).not.toBeNull();

      servidor.tieneRol = () => json(true);
      expect(await iniciarSesion(supabase, CREDENCIALES)).toEqual({ tipo: "ok", usuarioId: "usuario-1" });
    });
  });

  it("después de una falla de red, reintentar entra: no queda nada trabado", async () => {
    const { supabase, servidor } = servidorFalso({ iniciar: sinRed });

    expect(await iniciarSesion(supabase, CREDENCIALES)).toEqual({ tipo: "no-disponible" });

    servidor.iniciar = () => respuestaDeSesion();
    expect(await iniciarSesion(supabase, CREDENCIALES)).toEqual({ tipo: "ok", usuarioId: "usuario-1" });
  });

  it("dos intentos seguidos antes de que termine el primero terminan los dos y queda la última sesión", async () => {
    let numero = 0;
    const { supabase } = servidorFalso({ iniciar: () => respuestaDeSesion({ token: `token-${++numero}` }) });

    const resultados = await Promise.all([iniciarSesion(supabase, CREDENCIALES), iniciarSesion(supabase, CREDENCIALES)]);

    expect(resultados.map((r) => r.tipo)).toEqual(["ok", "ok"]);
    expect((await supabase.auth.getSession()).data.session?.access_token).toBe("token-2");
  });
});

describe("verificarAcceso", () => {
  it("sin sesión abierta dice que no hay sesión, sin llamar a Supabase", async () => {
    const { supabase, llamadas } = servidorFalso();

    expect(await verificarAcceso(supabase)).toEqual({ tipo: "sin-sesion" });
    expect(llamadas).toHaveLength(0);
  });

  it("con sesión y rol de coordinador vigente deja entrar", async () => {
    const { supabase, llamadas } = servidorFalso();
    await supabase.auth.signInWithPassword({ email: CREDENCIALES.correo, password: CREDENCIALES.contrasena });

    expect(await verificarAcceso(supabase)).toEqual({ tipo: "ok", usuarioId: "usuario-1" });
    expect(llamadas.at(-1)).toMatchObject({ ruta: "/rest/v1/rpc/tiene_rol", token: "token-1", cuerpo: { p_codigo: "COORDINADOR" } });
  });

  it("un rol revocado se cae en la siguiente comprobación, sin esperar a que el token venza", async () => {
    const { supabase, servidor } = servidorFalso();
    await supabase.auth.signInWithPassword({ email: CREDENCIALES.correo, password: CREDENCIALES.contrasena });
    expect(await verificarAcceso(supabase)).toMatchObject({ tipo: "ok" });

    servidor.tieneRol = () => json(false);

    expect(await verificarAcceso(supabase)).toEqual({ tipo: "sin-acceso" });
    // No se la cierra por su cuenta: la pantalla le dice por qué no entra y le ofrece cerrarla.
    expect((await supabase.auth.getSession()).data.session).not.toBeNull();
  });

  it("si la base rechaza el JWT, la sesión venció", async () => {
    const { supabase } = servidorFalso({ tieneRol: () => errorDePostgrest(401, "PGRST301", "JWT expired") });
    await supabase.auth.signInWithPassword({ email: CREDENCIALES.correo, password: CREDENCIALES.contrasena });

    expect(await verificarAcceso(supabase)).toEqual({ tipo: "sesion-vencida" });
  });

  describe("Supabase caído o mal configurado: no es una sesión vencida (no hay loop de logins)", () => {
    it.each([
      ["sin red", sinRed],
      ["con el servicio caído", () => json({ message: "caído" }, 503)],
      ["con el límite de tráfico", () => json({ message: "demasiadas" }, 429)],
      ["con la clave anónima mal cargada (401 del gateway)", () => json({ message: "Invalid API key" }, 401)],
      ["con la función sin desplegar", () => errorDePostgrest(404, "PGRST202", "Could not find the function")],
      ["con una respuesta que no es un booleano", () => json("sí")],
    ])("%s: no entra, la sesión sigue y al volver el servicio entra", async (_caso, tieneRol) => {
      const { supabase, servidor } = servidorFalso({ tieneRol });
      await supabase.auth.signInWithPassword({ email: CREDENCIALES.correo, password: CREDENCIALES.contrasena });

      expect(await verificarAcceso(supabase)).toEqual({ tipo: "no-disponible" });
      expect((await supabase.auth.getSession()).data.session).not.toBeNull();

      servidor.tieneRol = () => json(true);
      expect(await verificarAcceso(supabase)).toMatchObject({ tipo: "ok" });
    });
  });

  describe("token por vencer o vencido", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    const abrirSesion = (supabase: ReturnType<typeof servidorFalso>["supabase"]) =>
      supabase.auth.signInWithPassword({ email: CREDENCIALES.correo, password: CREDENCIALES.contrasena });

    /** Pasa el tiempo hasta que el token de 1 hora ya venció de verdad. */
    const vencerElToken = () => vi.setSystemTime(Date.now() + 2 * 3_600_000);

    it("si está por vencer lo renueva y deja entrar con el token nuevo", async () => {
      // `expires_in: 1`: cae dentro del margen en que el SDK renueva antes de que venza.
      const { supabase, llamadas } = servidorFalso({ iniciar: () => respuestaDeSesion({ expiraEn: 1 }) });
      await abrirSesion(supabase);

      expect(await verificarAcceso(supabase)).toMatchObject({ tipo: "ok" });
      expect(llamadas.find((l) => l.url.searchParams.get("grant_type") === "refresh_token")).toBeDefined();
      expect(llamadas.at(-1)).toMatchObject({ ruta: "/rest/v1/rpc/tiene_rol", token: "token-renovado" });
    });

    it("si la renovación se rechaza pero el token todavía vale, la sesión sigue en pie", async () => {
      const { supabase } = servidorFalso({
        iniciar: () => respuestaDeSesion({ expiraEn: 1 }),
        renovar: () => errorDeAuth(400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found"),
      });
      await abrirSesion(supabase);

      expect(await verificarAcceso(supabase)).toMatchObject({ tipo: "ok" });
    });

    it("si el token venció y el servidor rechaza la renovación, la sesión venció y no se llama a la base", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const { supabase, llamadas } = servidorFalso({
        renovar: () => errorDeAuth(400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found"),
      });
      await abrirSesion(supabase);
      vencerElToken();

      expect(await verificarAcceso(supabase)).toEqual({ tipo: "sesion-vencida" });
      expect(llamadas.some((l) => l.ruta === "/rest/v1/rpc/tiene_rol")).toBe(false);
      expect((await supabase.auth.getSession()).data.session).toBeNull();
    });

    it("si el token venció y no hay red para renovarlo, no es una sesión vencida: no entra y al volver la red entra", async () => {
      vi.useFakeTimers();
      const { supabase, servidor } = servidorFalso({ renovar: sinRed });
      await abrirSesion(supabase);
      vencerElToken();

      // El SDK reintenta con espera creciente; el tope de 5 s corta antes de que termine.
      const comprobacion = verificarAcceso(supabase);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(await comprobacion).toEqual({ tipo: "no-disponible" });

      servidor.renovar = () => respuestaDeSesion({ token: "token-renovado" });
      const otraVez = verificarAcceso(supabase);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(await otraVez).toMatchObject({ tipo: "ok" });
    });
  });

  describe("Supabase no contesta (conexión colgada)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("la comprobación termina como no disponible a los 5 s, sin cerrar la sesión", async () => {
      const { supabase, servidor } = servidorFalso({ tieneRol: colgada });
      await supabase.auth.signInWithPassword({ email: CREDENCIALES.correo, password: CREDENCIALES.contrasena });

      const comprobacion = verificarAcceso(supabase);
      await vi.advanceTimersByTimeAsync(4_999);
      let terminada = false;
      void comprobacion.then(() => (terminada = true));
      await vi.advanceTimersByTimeAsync(0);
      expect(terminada).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      expect(await comprobacion).toEqual({ tipo: "no-disponible" });
      expect((await supabase.auth.getSession()).data.session).not.toBeNull();

      servidor.tieneRol = () => json(true);
      expect(await verificarAcceso(supabase)).toMatchObject({ tipo: "ok" });
    });

    it("el inicio de sesión termina como no disponible a los 5 s y se puede reintentar", async () => {
      const { supabase, servidor } = servidorFalso({ iniciar: colgada });

      const intento = iniciarSesion(supabase, CREDENCIALES);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(await intento).toEqual({ tipo: "no-disponible" });

      servidor.iniciar = () => respuestaDeSesion();
      expect(await iniciarSesion(supabase, CREDENCIALES)).toEqual({ tipo: "ok", usuarioId: "usuario-1" });
    });

    it("cuando contesta a tiempo no queda ningún temporizador pendiente", async () => {
      const { supabase } = servidorFalso();

      await iniciarSesion(supabase, CREDENCIALES);
      await verificarAcceso(supabase);

      expect(vi.getTimerCount()).toBe(0);
    });
  });
});

describe("cerrarSesion", () => {
  it("revoca la sesión de este navegador y la borra", async () => {
    const { supabase, llamadas } = servidorFalso();
    await supabase.auth.signInWithPassword({ email: CREDENCIALES.correo, password: CREDENCIALES.contrasena });

    expect(await cerrarSesion(supabase)).toEqual({ tipo: "cerrada" });
    expect(llamadas.at(-1)).toMatchObject({ metodo: "POST", ruta: "/auth/v1/logout", token: "token-1" });
    // Solo esta sesión, no las del mismo usuario en otros dispositivos.
    expect(llamadas.at(-1)?.url.searchParams.get("scope")).toBe("local");
    expect((await supabase.auth.getSession()).data.session).toBeNull();
    expect(await verificarAcceso(supabase)).toEqual({ tipo: "sin-sesion" });
  });

  it("sin red cierra igual en este navegador y dice que no pudo avisar al servidor", async () => {
    const { supabase, servidor } = servidorFalso({ revocar: sinRed });
    await supabase.auth.signInWithPassword({ email: CREDENCIALES.correo, password: CREDENCIALES.contrasena });

    expect(await cerrarSesion(supabase)).toEqual({ tipo: "cerrada-sin-revocar" });
    expect((await supabase.auth.getSession()).data.session).toBeNull();

    // Y cerrar de nuevo, ya con red, no falla.
    servidor.revocar = () => new Response(null, { status: 204 });
    expect(await cerrarSesion(supabase)).toEqual({ tipo: "cerrada" });
  });

  it("con Supabase caído también cierra en este navegador", async () => {
    const { supabase } = servidorFalso({ revocar: () => json({ message: "caído" }, 503) });
    await supabase.auth.signInWithPassword({ email: CREDENCIALES.correo, password: CREDENCIALES.contrasena });

    expect(await cerrarSesion(supabase)).toEqual({ tipo: "cerrada-sin-revocar" });
    expect((await supabase.auth.getSession()).data.session).toBeNull();
  });

  it("si el servidor ya no reconoce la sesión (token vencido) está cerrada y no es un error", async () => {
    const { supabase } = servidorFalso({ revocar: () => errorDeAuth(401, "bad_jwt", "invalid JWT") });
    await supabase.auth.signInWithPassword({ email: CREDENCIALES.correo, password: CREDENCIALES.contrasena });

    expect(await cerrarSesion(supabase)).toEqual({ tipo: "cerrada" });
    expect((await supabase.auth.getSession()).data.session).toBeNull();
  });

  it("sin sesión abierta no llama a Supabase y devuelve cerrada", async () => {
    const { supabase, llamadas } = servidorFalso();

    expect(await cerrarSesion(supabase)).toEqual({ tipo: "cerrada" });
    expect(llamadas).toHaveLength(0);
  });

  it("dos cierres seguidos (doble toque) terminan los dos y la sesión queda cerrada", async () => {
    const { supabase } = servidorFalso();
    await supabase.auth.signInWithPassword({ email: CREDENCIALES.correo, password: CREDENCIALES.contrasena });

    const resultados = await Promise.all([cerrarSesion(supabase), cerrarSesion(supabase)]);

    expect(resultados.map((r) => r.tipo)).toEqual(["cerrada", "cerrada"]);
    expect((await supabase.auth.getSession()).data.session).toBeNull();
  });
});
