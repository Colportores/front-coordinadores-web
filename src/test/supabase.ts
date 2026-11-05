import type { SupabaseClient } from "@supabase/supabase-js";

import { crearSupabase } from "@/datos/supabase/sdk";

/**
 * Un Supabase falso para los tests: el cliente es el `supabase-js` de verdad (con su sesión, su renovación y
 * su manejo de errores) y lo único falso es el `fetch` de abajo, que contesta lo que decide `responder`.
 * Así los tests prueban lo que hace el SDK con cada respuesta, no lo que creemos que hace.
 */
export const URL_PRUEBA = "https://proyecto.supabase.co";
export const CLAVE_PRUEBA = "sb_publishable_prueba";

export interface LlamadaFalsa {
  metodo: string;
  url: URL;
  /** `/auth/v1/token`, `/rest/v1/rpc/tiene_rol`… */
  ruta: string;
  token: string | null;
  cuerpo: unknown;
}

export const json = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { "Content-Type": "application/json" } });

/** La respuesta de GoTrue a un inicio de sesión o a una renovación. */
export function respuestaDeSesion({ token = "token-1", usuarioId = "usuario-1", expiraEn = 3600 } = {}) {
  return json({
    access_token: token,
    token_type: "bearer",
    expires_in: expiraEn,
    refresh_token: `renovacion-de-${token}`,
    user: {
      id: usuarioId,
      aud: "authenticated",
      role: "authenticated",
      email: "coordinador@example.com",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-01-01T00:00:00Z",
    },
  });
}

/** Un error de GoTrue (`error_code`) o de PostgREST (`code`), con el estado HTTP que le toca. */
export const errorDeAuth = (estado: number, codigo: string, mensaje: string) =>
  json({ code: estado, error_code: codigo, msg: mensaje }, estado);
export const errorDePostgrest = (estado: number, codigo: string, mensaje: string, detalle: string | null = null) =>
  json({ code: codigo, message: mensaje, details: detalle, hint: null }, estado);

let cuenta = 0;

export function crearSupabasePrueba(responder: (llamada: LlamadaFalsa) => Response | Promise<Response>) {
  const llamadas: LlamadaFalsa[] = [];
  const fetchFalso = async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(entrada instanceof Request ? entrada.url : String(entrada));
    const cabeceras = new Headers(init?.headers);
    const autorizacion = cabeceras.get("Authorization");
    const texto = typeof init?.body === "string" ? init.body : null;
    const llamada: LlamadaFalsa = {
      metodo: init?.method ?? "GET",
      url,
      ruta: url.pathname,
      token: autorizacion?.startsWith("Bearer ") ? autorizacion.slice("Bearer ".length) : null,
      cuerpo: texto ? (JSON.parse(texto) as unknown) : null,
    };
    llamadas.push(llamada);
    return responder(llamada);
  };

  // El almacén es un `Map` propio de cada cliente: la sesión se guarda como en el navegador (y los tests pueden ver
  // si quedó algo guardado), sin tocar el `localStorage` ni compartir nada entre tests.
  const almacen = new Map<string, string>();
  const supabase: SupabaseClient = crearSupabase(
    { url: URL_PRUEBA, anonKey: CLAVE_PRUEBA },
    // Sin temporizadores de fondo: cada test arranca limpio. La clave de almacenamiento es propia de cada cliente
    // (el SDK avisa si dos clientes de la misma ventana comparten una).
    {
      auth: {
        autoRefreshToken: false,
        storageKey: `sb-prueba-${++cuenta}-auth-token`,
        storage: {
          getItem: (clave) => almacen.get(clave) ?? null,
          setItem: (clave, valor) => void almacen.set(clave, valor),
          removeItem: (clave) => void almacen.delete(clave),
        },
      },
      global: { fetch: fetchFalso as typeof fetch },
    },
  );
  return { supabase, llamadas, almacen };
}
