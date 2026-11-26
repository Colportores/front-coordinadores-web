import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { abrirEnlaceAccion, cerrarOtrasSesionesAccion, guardarContrasenaAccion, pedirEnlaceAccion } from "@/auth/acciones-recuperacion";
import { COOKIE_DE_RECUPERACION, piso, recuperacionEnCurso } from "@/auth/recuperacion-servidor";
import { CONFIG_PRUEBA } from "@/test/cookies-supabase";
import { errorDeAuth, json, respuestaDeSesion, type LlamadaFalsa } from "@/test/supabase";

/** `cookies()` y `headers()` de `next/headers` con un almacén en memoria, como en una server action. */
const pedido = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  opciones: new Map<string, Record<string, unknown>>(),
  cabeceras: {} as Record<string, string>,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...pedido.cookies].map(([name, value]) => ({ name, value })),
    get: (name: string) => (pedido.cookies.has(name) ? { name, value: pedido.cookies.get(name) } : undefined),
    set: (name: string, value: string, opciones: Record<string, unknown>) => {
      if (value) {
        pedido.cookies.set(name, value);
        pedido.opciones.set(name, opciones);
      } else {
        pedido.cookies.delete(name);
      }
    },
  }),
  headers: async () => new Headers(pedido.cabeceras),
}));

const CORREO = "marta.perez@correo.com";
const CLAVE = "Nueva-clave-1";

interface Servidor {
  recuperar: (llamada: LlamadaFalsa) => Response | Promise<Response>;
  canjear: (llamada: LlamadaFalsa) => Response | Promise<Response>;
  cambiar: (llamada: LlamadaFalsa) => Response | Promise<Response>;
  revocar: (llamada: LlamadaFalsa) => Response | Promise<Response>;
}

/** Un Supabase falso con las rutas de la recuperación; el cliente es el `supabase-js` y el `@supabase/ssr` de verdad. */
function prenderServidor(cambios: Partial<Servidor> = {}) {
  const servidor: Servidor = {
    recuperar: () => json({}),
    canjear: () => respuestaDeSesion({ token: "token-recuperacion", usuarioId: "u-9" }),
    cambiar: () => json({ id: "u-9", email: CORREO, aud: "authenticated", role: "authenticated" }),
    revocar: () => new Response(null, { status: 204 }),
    ...cambios,
  };
  const llamadas: LlamadaFalsa[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(entrada instanceof Request ? entrada.url : String(entrada));
      const texto = typeof init?.body === "string" ? init.body : null;
      const llamada: LlamadaFalsa = {
        metodo: init?.method ?? "GET",
        url,
        ruta: url.pathname,
        token: new Headers(init?.headers).get("Authorization")?.replace("Bearer ", "") ?? null,
        cuerpo: texto ? (JSON.parse(texto) as unknown) : null,
      };
      llamadas.push(llamada);
      if (url.pathname === "/auth/v1/recover") return servidor.recuperar(llamada);
      if (url.pathname === "/auth/v1/token" || url.pathname === "/auth/v1/verify") return servidor.canjear(llamada);
      if (url.pathname === "/auth/v1/user" && llamada.metodo === "PUT") return servidor.cambiar(llamada);
      if (url.pathname === "/auth/v1/logout") return servidor.revocar(llamada);
      throw new Error(`Ruta no prevista en el test: ${llamada.metodo} ${url.pathname}`);
    }),
  );
  return { servidor, llamadas };
}

function prenderLogin() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", CONFIG_PRUEBA.url);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", CONFIG_PRUEBA.anonKey);
}

const hayCookieDeSesion = () => [...pedido.cookies.keys()].some((nombre) => nombre.startsWith("sb-") && !nombre.includes("code-verifier"));

beforeEach(() => {
  pedido.cookies.clear();
  pedido.opciones.clear();
  pedido.cabeceras = { origin: "https://panel.test" };
  piso.pedidoMs = 0;
  prenderLogin();
});

afterEach(() => {
  vi.unstubAllGlobals();
  piso.pedidoMs = 800;
});

describe("pedirEnlaceAccion", () => {
  it("pide el correo con PKCE, vuelve a «Nueva contraseña» del mismo origen y deja el verificador en una cookie httpOnly", async () => {
    const { llamadas } = prenderServidor();
    expect(await pedirEnlaceAccion(`  ${CORREO.toUpperCase()} `)).toEqual({ tipo: "enviado" });

    const recuperar = llamadas.find((l) => l.ruta === "/auth/v1/recover");
    expect(recuperar?.cuerpo).toMatchObject({ email: CORREO, code_challenge_method: "s256" });
    expect(recuperar?.url.searchParams.get("redirect_to")).toBe("https://panel.test/acceso/nueva-contrasena");
    const verificador = [...pedido.cookies.keys()].find((n) => n.endsWith("code-verifier"));
    expect(verificador).toBeDefined();
    expect(pedido.opciones.get(verificador!)).toMatchObject({ httpOnly: true });
  });

  it("sin cabecera de origen usa el host del pedido", async () => {
    pedido.cabeceras = { host: "panel.staging.test", "x-forwarded-proto": "https" };
    const { llamadas } = prenderServidor();
    await pedirEnlaceAccion(CORREO);
    expect(llamadas.find((l) => l.ruta === "/auth/v1/recover")?.url.searchParams.get("redirect_to")).toBe("https://panel.staging.test/acceso/nueva-contrasena");
  });

  it("un origen que no es http(s) no se usa", async () => {
    pedido.cabeceras = { origin: "javascript:alert(1)", host: "localhost:3000" };
    const { llamadas } = prenderServidor();
    await pedirEnlaceAccion(CORREO);
    expect(llamadas.find((l) => l.ruta === "/auth/v1/recover")?.url.searchParams.get("redirect_to")).toBe("http://localhost:3000/acceso/nueva-contrasena");
  });

  it("un correo que no pasa la validación ni sale del servidor", async () => {
    const { llamadas } = prenderServidor();
    for (const malo of ["", "   ", "lucía@correo.com", "marta@correo", 42, null, undefined, { correo: CORREO }]) {
      expect(await pedirEnlaceAccion(malo), String(malo)).toEqual({ tipo: "correo-invalido" });
    }
    expect(llamadas).toHaveLength(0);
  });

  it("el límite de pedidos y la dirección que no recibe correos contestan igual que un envío (no revelan la cuenta)", async () => {
    for (const respuesta of [errorDeAuth(429, "over_email_send_rate_limit", "limit"), errorDeAuth(400, "email_address_invalid", "invalid")]) {
      prenderServidor({ recuperar: () => respuesta.clone() });
      expect(await pedirEnlaceAccion(CORREO)).toEqual({ tipo: "enviado" });
    }
  });

  it("un servicio caído, sin red o sin variables es «no disponible»", async () => {
    prenderServidor({ recuperar: () => errorDeAuth(500, "unexpected_failure", "caído") });
    expect(await pedirEnlaceAccion(CORREO)).toEqual({ tipo: "no-disponible" });

    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    expect(await pedirEnlaceAccion(CORREO)).toEqual({ tipo: "no-disponible" });

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", undefined);
    expect(await pedirEnlaceAccion(CORREO)).toEqual({ tipo: "no-disponible" });
  });

  it("tarda lo mismo con y sin cuenta: nunca menos que el piso (riesgo R5 de HU-AUTH-004)", async () => {
    vi.useFakeTimers();
    try {
      piso.pedidoMs = 800;
      prenderServidor();
      let listo = false;
      const respuesta = pedirEnlaceAccion(CORREO).then((r) => {
        listo = true;
        return r;
      });
      await vi.advanceTimersByTimeAsync(700);
      expect(listo).toBe(false);
      await vi.advanceTimersByTimeAsync(200);
      expect(await respuesta).toEqual({ tipo: "enviado" });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("abrirEnlaceAccion", () => {
  it("canjea el código con el verificador, deja la sesión y la marca de recuperación en cookies httpOnly y devuelve la cuenta", async () => {
    const { llamadas } = prenderServidor();
    await pedirEnlaceAccion(CORREO);

    expect(await abrirEnlaceAccion("codigo-del-correo")).toEqual({ tipo: "ok", correo: "coordinador@example.com" });
    const canje = llamadas.find((l) => l.ruta === "/auth/v1/token");
    expect(canje?.url.searchParams.get("grant_type")).toBe("pkce");
    expect(canje?.cuerpo).toMatchObject({ auth_code: "codigo-del-correo" });
    expect(hayCookieDeSesion()).toBe(true);
    expect(pedido.cookies.get(COOKIE_DE_RECUPERACION)).toBe("u-9");
    expect(pedido.opciones.get(COOKIE_DE_RECUPERACION)).toMatchObject({ httpOnly: true, maxAge: 900 });
    expect(await recuperacionEnCurso()).toEqual({ id: "u-9", correo: "coordinador@example.com" });
  });

  it("#217: el código de un solo uso abre en otro navegador (sin verificador PKCE), se verifica como recovery y deja la sesión y la marca", async () => {
    const { llamadas } = prenderServidor();
    // Nunca se pidió el enlace desde este navegador: no hay cookie de verificador.
    expect([...pedido.cookies.keys()].some((n) => n.endsWith("code-verifier"))).toBe(false);

    expect(await abrirEnlaceAccion("hash-del-correo", "un-solo-uso")).toEqual({ tipo: "ok", correo: "coordinador@example.com" });
    const verificacion = llamadas.find((l) => l.ruta === "/auth/v1/verify");
    expect(verificacion?.cuerpo).toMatchObject({ token_hash: "hash-del-correo", type: "recovery" });
    expect(llamadas.some((l) => l.ruta === "/auth/v1/token")).toBe(false);
    expect(hayCookieDeSesion()).toBe(true);
    expect(pedido.cookies.get(COOKIE_DE_RECUPERACION)).toBe("u-9");
    expect(await recuperacionEnCurso()).toEqual({ id: "u-9", correo: "coordinador@example.com" });
  });

  it("#217: un código de un solo uso vencido o ya usado es «no válido», sin marca; con el servicio caído, «no disponible»", async () => {
    prenderServidor({ canjear: () => errorDeAuth(403, "otp_expired", "vencido") });
    expect(await abrirEnlaceAccion("hash", "un-solo-uso")).toEqual({ tipo: "no-valido" });
    expect(pedido.cookies.has(COOKIE_DE_RECUPERACION)).toBe(false);

    prenderServidor({ canjear: () => errorDeAuth(503, "unexpected_failure", "caído") });
    expect(await abrirEnlaceAccion("hash", "un-solo-uso")).toEqual({ tipo: "no-disponible" });
    expect(pedido.cookies.has(COOKIE_DE_RECUPERACION)).toBe(false);
  });

  it("#217: un tipo desconocido (viene del navegador) se trata como el código de siempre, nunca como otra cosa", async () => {
    const { llamadas } = prenderServidor();
    await pedirEnlaceAccion(CORREO);
    await abrirEnlaceAccion("codigo", { tipo: "otro" });
    expect(llamadas.some((l) => l.ruta === "/auth/v1/verify")).toBe(false);
    expect(llamadas.find((l) => l.ruta === "/auth/v1/token")?.url.searchParams.get("grant_type")).toBe("pkce");
  });

  it("vencido o ya usado, sin el verificador (otro navegador) o sin código: «no válido», sin marca", async () => {
    prenderServidor({ canjear: () => errorDeAuth(403, "otp_expired", "vencido") });
    await pedirEnlaceAccion(CORREO);
    expect(await abrirEnlaceAccion("c")).toEqual({ tipo: "no-valido" });
    expect(pedido.cookies.has(COOKIE_DE_RECUPERACION)).toBe(false);

    // Otro navegador (un `?code=` viejo): no hay verificador y la respuesta lo marca.
    pedido.cookies.clear();
    expect(await abrirEnlaceAccion("c")).toEqual({ tipo: "no-valido", sinVerificador: true });
    for (const malo of ["", undefined, null, 7, "x".repeat(2000)]) {
      expect(await abrirEnlaceAccion(malo), String(malo)).toEqual({ tipo: "no-valido" });
    }
  });

  it("el servicio caído no es un enlace vencido", async () => {
    prenderServidor({ canjear: () => errorDeAuth(503, "unexpected_failure", "caído") });
    await pedirEnlaceAccion(CORREO);
    expect(await abrirEnlaceAccion("c")).toEqual({ tipo: "no-disponible" });
    expect(pedido.cookies.has(COOKIE_DE_RECUPERACION)).toBe(false);
  });
});

describe("guardarContrasenaAccion", () => {
  async function conEnlaceAbierto(cambios: Partial<Servidor> = {}) {
    const servidor = prenderServidor(cambios);
    await pedirEnlaceAccion(CORREO);
    await abrirEnlaceAccion("codigo-del-correo");
    return servidor;
  }

  it("cambia la contraseña, cierra todas las sesiones y borra la marca y la sesión de este navegador", async () => {
    const { llamadas } = await conEnlaceAbierto();
    expect(await guardarContrasenaAccion(CLAVE)).toEqual({ tipo: "ok" });

    const cambio = llamadas.find((l) => l.ruta === "/auth/v1/user" && l.metodo === "PUT");
    expect(cambio?.cuerpo).toMatchObject({ password: CLAVE });
    expect(cambio?.token).toBe("token-recuperacion");
    expect(llamadas.some((l) => l.ruta === "/auth/v1/logout" && l.url.searchParams.get("scope") === "others")).toBe(true);
    expect(pedido.cookies.has(COOKIE_DE_RECUPERACION)).toBe(false);
    expect(hayCookieDeSesion()).toBe(false);
  });

  it("sin la marca de un enlace (una sesión común) no cambia nada", async () => {
    const { llamadas } = prenderServidor();
    await pedirEnlaceAccion(CORREO);
    await abrirEnlaceAccion("c");
    pedido.cookies.delete(COOKIE_DE_RECUPERACION);

    expect(await guardarContrasenaAccion(CLAVE)).toEqual({ tipo: "enlace-no-valido" });
    expect(llamadas.some((l) => l.metodo === "PUT")).toBe(false);
  });

  it("la marca de otra cuenta no sirve para esta sesión", async () => {
    const { llamadas } = await conEnlaceAbierto();
    pedido.cookies.set(COOKIE_DE_RECUPERACION, "u-otra");
    expect(await guardarContrasenaAccion(CLAVE)).toEqual({ tipo: "enlace-no-valido" });
    expect(llamadas.some((l) => l.metodo === "PUT")).toBe(false);
  });

  it("una contraseña que no cumple las reglas, o que no es texto, no se manda", async () => {
    const { llamadas } = await conEnlaceAbierto();
    for (const mala of ["corta1A", "todo-minuscula-1", 12345678, null, undefined]) {
      expect(await guardarContrasenaAccion(mala), String(mala)).toEqual({ tipo: "contrasena-debil" });
    }
    expect(llamadas.some((l) => l.metodo === "PUT")).toBe(false);
  });

  it("la misma contraseña de antes, la política del servidor y el servicio caído conservan la marca para reintentar", async () => {
    for (const [respuesta, esperado] of [
      [errorDeAuth(422, "same_password", "igual"), "misma-contrasena"],
      [errorDeAuth(422, "weak_password", "débil"), "contrasena-debil"],
      [errorDeAuth(500, "unexpected_failure", "caído"), "no-disponible"],
    ] as const) {
      await conEnlaceAbierto({ cambiar: () => respuesta.clone() });
      expect(await guardarContrasenaAccion(CLAVE), esperado).toEqual({ tipo: esperado });
      expect(pedido.cookies.has(COOKIE_DE_RECUPERACION), esperado).toBe(true);
    }
  });

  it("si la sesión de recuperación ya no sirve (401), es «enlace no válido» y se borra la marca", async () => {
    await conEnlaceAbierto({ cambiar: () => errorDeAuth(401, "bad_jwt", "vencido") });
    expect(await guardarContrasenaAccion(CLAVE)).toEqual({ tipo: "enlace-no-valido" });
    expect(pedido.cookies.has(COOKIE_DE_RECUPERACION)).toBe(false);
  });

  it("dos guardados seguidos: el segundo ya no tiene marca y no vuelve a cambiar nada", async () => {
    const { llamadas } = await conEnlaceAbierto();
    expect(await guardarContrasenaAccion(CLAVE)).toEqual({ tipo: "ok" });
    expect(await guardarContrasenaAccion(CLAVE)).toEqual({ tipo: "enlace-no-valido" });
    expect(llamadas.filter((l) => l.metodo === "PUT")).toHaveLength(1);
  });

  it("si el cierre global falla (500) no es éxito: «ok-sin-revocar», la marca y la sesión quedan, y el reintento sin contraseña lo cierra", async () => {
    let falla = true;
    const { llamadas } = await conEnlaceAbierto({
      revocar: () => (falla ? errorDeAuth(500, "unexpected_failure", "caído") : new Response(null, { status: 204 })),
    });
    expect(await guardarContrasenaAccion(CLAVE)).toEqual({ tipo: "ok-sin-revocar" });
    expect(pedido.cookies.has(COOKIE_DE_RECUPERACION)).toBe(true);
    expect(hayCookieDeSesion()).toBe(true);

    // El reintento sigue fallando: nada cambia.
    expect(await cerrarOtrasSesionesAccion()).toEqual({ tipo: "ok-sin-revocar" });
    expect(pedido.cookies.has(COOKIE_DE_RECUPERACION)).toBe(true);

    falla = false;
    expect(await cerrarOtrasSesionesAccion()).toEqual({ tipo: "ok" });
    expect(pedido.cookies.has(COOKIE_DE_RECUPERACION)).toBe(false);
    expect(hayCookieDeSesion()).toBe(false);
    // La contraseña se cambió una sola vez: el reintento no la vuelve a pedir ni a mandar.
    expect(llamadas.filter((l) => l.metodo === "PUT")).toHaveLength(1);
  });
});

describe("cerrarOtrasSesionesAccion", () => {
  it("sin una recuperación en curso (sin marca) no cierra nada ni afirma el cierre", async () => {
    const { llamadas } = prenderServidor();
    expect(await cerrarOtrasSesionesAccion()).toEqual({ tipo: "ok-sin-revocar" });
    expect(llamadas.some((l) => l.ruta === "/auth/v1/logout")).toBe(false);
  });
});
