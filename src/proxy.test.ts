import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { iniciarSesion } from "@/auth/acceso";
import { CABECERA_SIN_MARCO } from "@/auth/guarda";
import { marcaDeRechazo } from "@/auth/sesion-vencida";
import { crearSupabaseConCookies } from "@/auth/supabase-cookies";
import { proxy, RUTA_NO_DISPONIBLE } from "@/proxy";
import { CONFIG_PRUEBA, navegadorFalso, prenderSupabaseFalso, type NavegadorFalso } from "@/test/cookies-supabase";
import { fijarFlags } from "@/test/flags";
import { errorDePostgrest, json } from "@/test/supabase";

function pedido(ruta: string, { cookies, metodo = "GET", cabeceras = {} }: { cookies?: NavegadorFalso; metodo?: string; cabeceras?: Record<string, string> } = {}) {
  const cookie = cookies ? [...cookies.cookies].map(([nombre, valor]) => `${nombre}=${valor}`).join("; ") : "";
  return new NextRequest(new URL(ruta, "http://localhost:3000"), { method: metodo, headers: { ...(cookie ? { cookie } : {}), ...cabeceras } });
}

async function reescrituraDe(ruta: string): Promise<string | null> {
  const respuesta = await proxy(pedido(ruta));
  const destino = respuesta.headers.get("x-middleware-rewrite");
  return destino ? new URL(destino).pathname : null;
}

describe("proxy de pestañas con flag", () => {
  describe("fuera del modo dev (staging y producción)", () => {
    it("corta Stock y Cuentas antes de renderizar, incluidas subrutas y payload RSC", async () => {
      fijarFlags({ modoDev: false });
      for (const ruta of ["/stock", "/stock/pedidos", "/stock.rsc", "/cuentas", "/cuentas/123"]) {
        expect(await reescrituraDe(ruta), ruta).toBe(RUTA_NO_DISPONIBLE);
      }
    });

    it("no toca las pestañas sin flag ni rutas que solo empiezan parecido", async () => {
      fijarFlags({ modoDev: false });
      expect(await reescrituraDe("/inicio")).toBeNull();
      expect(await reescrituraDe("/stockeo")).toBeNull();
    });

    it("respeta el flag propio de la pestaña", async () => {
      fijarFlags({ modoDev: false, stock: true });
      expect(await reescrituraDe("/stock")).toBeNull();
      expect(await reescrituraDe("/cuentas")).toBe(RUTA_NO_DISPONIBLE);
    });
  });

  describe("en modo dev", () => {
    it("deja pasar Stock y Cuentas", async () => {
      fijarFlags({ modoDev: true });
      expect(await reescrituraDe("/stock")).toBeNull();
      expect(await reescrituraDe("/cuentas")).toBeNull();
    });
  });
});

describe("proxy: la guarda de rutas (issue #18, vista 38)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function prenderLogin() {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", CONFIG_PRUEBA.url);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", CONFIG_PRUEBA.anonKey);
    fijarFlags({ modoDev: true });
  }

  /** Una coordinadora que ya inició sesión: sus cookies, como las mandaría el navegador. */
  async function conSesion(): Promise<NavegadorFalso> {
    prenderSupabaseFalso();
    const navegador = navegadorFalso();
    await iniciarSesion(crearSupabaseConCookies(CONFIG_PRUEBA, navegador), { correo: "coordinador@example.com", contrasena: "Clave-de-prueba1" });
    return navegador;
  }

  const destino = (r: Response) => r.headers.get("location");
  const cabecerasPasadas = (r: Response) => (r.headers.get("x-middleware-override-headers") ?? "").split(",");

  describe("sin variables de Supabase", () => {
    it("el panel no pide sesión: ni consulta a Supabase ni manda a /acceso", async () => {
      const { llamadas } = prenderSupabaseFalso();
      const respuesta = await proxy(pedido("/equipo"));
      expect(respuesta.headers.get("x-middleware-next")).toBe("1");
      expect(llamadas).toEqual([]);
    });
  });

  describe("con login", () => {
    it("sin sesión manda a la pantalla de acceso, recordando adónde iba (sin el parámetro _rsc)", async () => {
      prenderLogin();
      prenderSupabaseFalso();

      const respuesta = await proxy(pedido("/equipo?semana=3&_rsc=abc"));

      expect(respuesta.status).toBe(307);
      expect(destino(respuesta)).toBe("http://localhost:3000/acceso?siguiente=%2Fequipo%3Fsemana%3D3");
    });

    it("sin sesión y yendo a la pantalla inicial, no agrega destino", async () => {
      prenderLogin();
      prenderSupabaseFalso();
      expect(destino(await proxy(pedido("/inicio")))).toBe("http://localhost:3000/acceso");
    });

    it("con la sesión de una coordinadora deja pasar, comprobando el rol con su token", async () => {
      prenderLogin();
      const navegador = await conSesion();
      const { llamadas } = prenderSupabaseFalso();

      const respuesta = await proxy(pedido("/equipo", { cookies: navegador }));

      expect(respuesta.headers.get("x-middleware-next")).toBe("1");
      expect(llamadas.map((l) => l.ruta)).toEqual(["/rest/v1/rpc/tiene_rol", "/rest/v1/rpc/estado_cuenta"]);
      expect(llamadas[0].token).toBe("token-1");
    });

    it("una cuenta que no es de coordinador va a «Sin acceso», sin destino", async () => {
      prenderLogin();
      const navegador = await conSesion();
      prenderSupabaseFalso({ tieneRol: () => json(false) });

      const respuesta = await proxy(pedido("/equipo", { cookies: navegador }));

      expect(destino(respuesta)).toBe("http://localhost:3000/acceso?motivo=sin-acceso");
    });

    it("un coordinador suspendido va a «Cuenta suspendida», sin destino, y a una server action se le responde 401", async () => {
      prenderLogin();
      const navegador = await conSesion();
      prenderSupabaseFalso({ estadoCuenta: () => json("SUSPENDIDA") });

      const respuesta = await proxy(pedido("/equipo", { cookies: navegador }));
      expect(destino(respuesta)).toBe("http://localhost:3000/acceso?motivo=suspendida");

      const accion = await proxy(pedido("/equipo", { cookies: navegador, metodo: "POST", cabeceras: { "next-action": "abc" } }));
      expect(accion.status).toBe(401);
    });

    it("si no se puede saber si está suspendida, no se entra: va a «No disponible»", async () => {
      prenderLogin();
      const navegador = await conSesion();
      prenderSupabaseFalso({ estadoCuenta: () => errorDePostgrest(500, "XX000", "caído") });

      expect(destino(await proxy(pedido("/equipo", { cookies: navegador })))).toBe("http://localhost:3000/acceso?motivo=no-disponible&siguiente=%2Fequipo");
    });

    it("una sesión que la base rechaza va a «Sesión vencida», con el destino", async () => {
      prenderLogin();
      const navegador = await conSesion();
      prenderSupabaseFalso({ tieneRol: () => errorDePostgrest(401, "PGRST301", "JWT expired") });

      const respuesta = await proxy(pedido("/ciudades", { cookies: navegador }));

      expect(destino(respuesta)).toBe("http://localhost:3000/acceso?motivo=vencida&siguiente=%2Fciudades");
    });

    it("un Supabase caído va a «No disponible»: no es una sesión vencida y no la cierra", async () => {
      prenderLogin();
      const navegador = await conSesion();
      prenderSupabaseFalso({ tieneRol: () => errorDePostgrest(503, "PGRST000", "caído") });

      const respuesta = await proxy(pedido("/equipo", { cookies: navegador }));

      expect(destino(respuesta)).toBe("http://localhost:3000/acceso?motivo=no-disponible&siguiente=%2Fequipo");
      expect(respuesta.headers.getSetCookie()).toEqual([]);
    });

    it("sin red tampoco es una sesión vencida", async () => {
      prenderLogin();
      const navegador = await conSesion();
      prenderSupabaseFalso({
        tieneRol: () => {
          throw new TypeError("fetch failed");
        },
      });

      expect(destino(await proxy(pedido("/equipo", { cookies: navegador })))).toContain("motivo=no-disponible");
    });

    it("renueva el token vencido y lo deja en el pedido y en la respuesta, httpOnly", async () => {
      prenderLogin();
      const navegador = await conSesion();
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000);
      const { llamadas } = prenderSupabaseFalso();

      const respuesta = await proxy(pedido("/equipo", { cookies: navegador }));

      expect(respuesta.headers.get("x-middleware-next")).toBe("1");
      expect(llamadas.map((l) => l.ruta)).toEqual(["/auth/v1/token", "/rest/v1/rpc/tiene_rol", "/rest/v1/rpc/estado_cuenta"]);
      expect(llamadas[1].token).toBe("token-renovado");
      const cookies = respuesta.headers.getSetCookie();
      expect(cookies.length).toBeGreaterThan(0);
      for (const cookie of cookies) expect(cookie.toLowerCase()).toContain("httponly");
      expect(respuesta.headers.get("Cache-Control")).toContain("no-store");
    });

    it("las llamadas a server actions sin sesión se rechazan con 401 en vez de redirigir", async () => {
      prenderLogin();
      prenderSupabaseFalso();
      const respuesta = await proxy(pedido("/equipo", { metodo: "POST", cabeceras: { "next-action": "abc123" } }));
      expect(respuesta.status).toBe(401);
      expect(respuesta.headers.get("location")).toBeNull();
      // Next solo lee el texto de un rechazo si es exactamente `text/plain`: la pantalla se entera de por qué fue (#41, P3).
      expect(respuesta.headers.get("content-type")).toBe("text/plain");
      expect(await respuesta.text()).toBe(marcaDeRechazo("vencida"));
    });

    it("una server action rechazada lleva la marca con su motivo: sesión vencida, sin acceso y cuenta suspendida (#41, P3)", async () => {
      prenderLogin();
      const navegador = await conSesion();
      const accion = () => proxy(pedido("/equipo", { cookies: navegador, metodo: "POST", cabeceras: { "next-action": "abc" } }));

      prenderSupabaseFalso({ tieneRol: () => errorDePostgrest(401, "PGRST301", "JWT expired") });
      const vencida = await accion();
      expect(vencida.status).toBe(401);
      expect(vencida.headers.get("content-type")).toBe("text/plain");
      expect(await vencida.text()).toBe(marcaDeRechazo("vencida"));

      prenderSupabaseFalso({ tieneRol: () => json(false) });
      const sinAcceso = await accion();
      expect(sinAcceso.status).toBe(401);
      expect(sinAcceso.headers.get("content-type")).toBe("text/plain");
      expect(await sinAcceso.text()).toBe(marcaDeRechazo("sin-acceso"));

      prenderSupabaseFalso({ estadoCuenta: () => json("SUSPENDIDA") });
      const suspendida = await accion();
      expect(suspendida.status).toBe(401);
      expect(suspendida.headers.get("content-type")).toBe("text/plain");
      expect(await suspendida.text()).toBe(marcaDeRechazo("suspendida"));
    });

    it("con el Supabase caído, la server action recibe 503 y no 401", async () => {
      prenderLogin();
      const navegador = await conSesion();
      prenderSupabaseFalso({ tieneRol: () => errorDePostgrest(500, "XX000", "caído") });
      const respuesta = await proxy(pedido("/equipo", { cookies: navegador, metodo: "POST", cabeceras: { "next-action": "abc123" } }));
      expect(respuesta.status).toBe(503);
    });

    it("Stock y Cuentas ocultas se siguen cortando, pero solo para quien entró", async () => {
      prenderLogin();
      fijarFlags({ modoDev: false });
      const navegador = await conSesion();
      prenderSupabaseFalso();

      const conSesionAbierta = await proxy(pedido("/stock", { cookies: navegador }));
      expect(new URL(conSesionAbierta.headers.get("x-middleware-rewrite")!).pathname).toBe(RUTA_NO_DISPONIBLE);

      const sinSesion = await proxy(pedido("/stock"));
      expect(destino(sinSesion)).toBe("http://localhost:3000/acceso?siguiente=%2Fstock");
    });

    it("una cabecera «sin marco» que mande el cliente en otra pantalla se descarta", async () => {
      prenderLogin();
      const navegador = await conSesion();
      prenderSupabaseFalso();

      const respuesta = await proxy(pedido("/equipo", { cookies: navegador, cabeceras: { [CABECERA_SIN_MARCO]: "1" } }));

      expect(cabecerasPasadas(respuesta)).not.toContain(CABECERA_SIN_MARCO);
    });
  });

  describe("la pantalla de acceso", () => {
    it("se muestra sin pedir sesión y sin marco del panel", async () => {
      prenderLogin();
      const { llamadas } = prenderSupabaseFalso();

      const respuesta = await proxy(pedido("/acceso"));

      expect(respuesta.headers.get("x-middleware-next")).toBe("1");
      expect(respuesta.headers.get(`x-middleware-request-${CABECERA_SIN_MARCO}`)).toBe("1");
      expect(llamadas).toEqual([]);
    });

    it("con un motivo se muestra tal cual, aunque haya una sesión buena", async () => {
      prenderLogin();
      const navegador = await conSesion();
      const { llamadas } = prenderSupabaseFalso();

      for (const motivo of ["cerrada", "sin-acceso", "suspendida", "no-disponible", "vencida"]) {
        const respuesta = await proxy(pedido(`/acceso?motivo=${motivo}`, { cookies: navegador }));
        expect(respuesta.headers.get("x-middleware-next"), motivo).toBe("1");
      }
      expect(llamadas).toEqual([]);
    });

    it("quien ya entró y la abre sin motivo vuelve a donde iba", async () => {
      prenderLogin();
      const navegador = await conSesion();
      prenderSupabaseFalso();

      expect(destino(await proxy(pedido("/acceso?siguiente=%2Fequipo", { cookies: navegador })))).toBe("http://localhost:3000/equipo");
      expect(destino(await proxy(pedido("/acceso", { cookies: navegador })))).toBe("http://localhost:3000/inicio");
    });

    it("el destino tiene que ser una ruta del panel: nada de sitios ajenos", async () => {
      prenderLogin();
      const navegador = await conSesion();
      prenderSupabaseFalso();

      for (const malo of ["%2F%2Fsitio.malo", "https%3A%2F%2Fsitio.malo", "%2F%5Csitio.malo", "%2F.%2F%2Fsitio.malo", "%2F..%2F%2Fsitio.malo", "%2F%252e%2F%2Fsitio.malo"]) {
        expect(destino(await proxy(pedido(`/acceso?siguiente=${malo}`, { cookies: navegador }))), malo).toBe("http://localhost:3000/inicio");
      }
    });

    it("el envío del formulario (un POST) no se desvía aunque haya sesión", async () => {
      prenderLogin();
      const navegador = await conSesion();
      const { llamadas } = prenderSupabaseFalso();

      const respuesta = await proxy(pedido("/acceso", { cookies: navegador, metodo: "POST", cabeceras: { "next-action": "abc" } }));

      expect(respuesta.headers.get("x-middleware-next")).toBe("1");
      expect(llamadas).toEqual([]);
    });
  });

  describe("con las variables de Supabase mal puestas", () => {
    it("se bloquea todo (nunca datos simulados): a «No disponible», 503 para las server actions", async () => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://un-host-cualquiera.com");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", CONFIG_PRUEBA.anonKey);
      fijarFlags({ modoDev: true });

      expect(destino(await proxy(pedido("/equipo")))).toBe("http://localhost:3000/acceso?motivo=no-disponible");
      expect((await proxy(pedido("/equipo", { metodo: "POST", cabeceras: { "next-action": "x" } }))).status).toBe(503);
      expect((await proxy(pedido("/acceso?motivo=no-disponible"))).headers.get("x-middleware-next")).toBe("1");
    });

    it("también con la clave sola", async () => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", CONFIG_PRUEBA.anonKey);
      expect(destino(await proxy(pedido("/inicio")))).toContain("motivo=no-disponible");
    });
  });
});
