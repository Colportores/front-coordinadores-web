import { vi } from "vitest";

import type { CookieAEscribir, ManejadorDeCookies } from "@/auth/supabase-cookies";
import { CLAVE_PRUEBA, json, respuestaDeSesion, URL_PRUEBA, type LlamadaFalsa } from "@/test/supabase";

/**
 * Para probar el cliente de servidor (la sesión en cookies): un «navegador» que guarda las cookies que le escriben el
 * servidor (como haría un `Set-Cookie`) y se las vuelve a mandar, más un Supabase falso al que se le cambia lo que contesta.
 * El `supabase-js` y el `@supabase/ssr` son los de verdad: lo falso es solo el `fetch` global.
 */
export const CONFIG_PRUEBA = { url: URL_PRUEBA, anonKey: CLAVE_PRUEBA };

export interface NavegadorFalso extends ManejadorDeCookies {
  cookies: Map<string, string>;
  /** Todo lo que se escribió, en orden, con sus opciones (para mirar `httpOnly`). */
  escritas: CookieAEscribir[];
  cabeceras: Record<string, string>;
}

export function navegadorFalso(): NavegadorFalso {
  const cookies = new Map<string, string>();
  const navegador: NavegadorFalso = {
    cookies,
    escritas: [],
    cabeceras: {},
    leer: () => [...cookies].map(([name, value]) => ({ name, value })),
    escribir: (aEscribir, cabeceras) => {
      for (const cookie of aEscribir) {
        navegador.escritas.push(cookie);
        if (cookie.value) cookies.set(cookie.name, cookie.value);
        else cookies.delete(cookie.name);
      }
      Object.assign(navegador.cabeceras, cabeceras);
    },
  };
  return navegador;
}

type Contestacion = (llamada: LlamadaFalsa) => Response | Promise<Response>;

export interface ServidorSupabase {
  iniciar: Contestacion;
  renovar: Contestacion;
  revocar: Contestacion;
  tieneRol: Contestacion;
  estadoCuenta: Contestacion;
  usuario: Contestacion;
}

/** Prende un Supabase falso como `fetch` global (lo restaura `vi.unstubAllGlobals`/`restoreMocks`). */
export function prenderSupabaseFalso(cambios: Partial<ServidorSupabase> = {}) {
  const servidor: ServidorSupabase = {
    iniciar: () => respuestaDeSesion({ token: "token-1", usuarioId: "u-1" }),
    renovar: () => respuestaDeSesion({ token: "token-renovado" }),
    revocar: () => new Response(null, { status: 204 }),
    tieneRol: () => json(true),
    estadoCuenta: () => json("ACTIVA"),
    usuario: () => json({ id: "u-1", email: "coordinador@example.com", aud: "authenticated", role: "authenticated" }),
    ...cambios,
  };
  const llamadas: LlamadaFalsa[] = [];
  const falso = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(entrada instanceof Request ? entrada.url : String(entrada));
    const autorizacion = new Headers(init?.headers).get("Authorization");
    const texto = typeof init?.body === "string" ? init.body : null;
    const llamada: LlamadaFalsa = {
      metodo: init?.method ?? "GET",
      url,
      ruta: url.pathname,
      token: autorizacion?.startsWith("Bearer ") ? autorizacion.slice("Bearer ".length) : null,
      cuerpo: texto ? (JSON.parse(texto) as unknown) : null,
    };
    llamadas.push(llamada);
    switch (url.pathname) {
      case "/auth/v1/token":
        return url.searchParams.get("grant_type") === "refresh_token" ? servidor.renovar(llamada) : servidor.iniciar(llamada);
      case "/auth/v1/logout":
        return servidor.revocar(llamada);
      case "/auth/v1/user":
        return servidor.usuario(llamada);
      case "/rest/v1/rpc/tiene_rol":
        return servidor.tieneRol(llamada);
      case "/rest/v1/rpc/estado_cuenta":
        return servidor.estadoCuenta(llamada);
      default:
        throw new Error(`Ruta no prevista en el test: ${url.pathname}`);
    }
  });
  vi.stubGlobal("fetch", falso);
  return { servidor, llamadas };
}
