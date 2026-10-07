import type { ConfigSupabase } from "@/datos/supabase/config";

export class ErrorSupabase extends Error {
  constructor(
    mensaje: string,
    readonly estado: number,
  ) {
    super(mensaje);
    this.name = "ErrorSupabase";
  }
}

export interface ClienteSupabase {
  /** GET a PostgREST. `consulta` es lo que va después de `/rest/v1/`: la tabla y sus filtros. */
  consultar<T>(consulta: string): Promise<T>;
  /** POST a `/rest/v1/rpc/<nombre>` con los argumentos como JSON. */
  llamarRpc<T>(nombre: string, argumentos: Record<string, unknown>): Promise<T>;
}

/** Se renueva la sesión un minuto antes de que venza, para no mandar un token a punto de caducar. */
const MARGEN_RENOVACION_MS = 60_000;
const DURACION_POR_DEFECTO_S = 3600;

interface Sesion {
  token: string;
  venceEn: number;
}

async function errorDe(respuesta: Response): Promise<ErrorSupabase> {
  let detalle = respuesta.statusText;
  try {
    const cuerpo = (await respuesta.json()) as { message?: string; code?: string };
    detalle = [cuerpo.message, cuerpo.code && `(${cuerpo.code})`].filter(Boolean).join(" ") || detalle;
  } catch {
    // La respuesta no era JSON: queda el texto del estado HTTP.
  }
  return new ErrorSupabase(`Supabase respondió ${respuesta.status}: ${detalle}`, respuesta.status);
}

/**
 * Cliente mínimo de Supabase por `fetch`, sin dependencias: inicia sesión con la cuenta del coordinador
 * de `config` (GoTrue, correo y contraseña) y manda ese token en cada consulta, así que las políticas
 * RLS ven al coordinador y no a la clave anónima. Reutiliza la sesión hasta que vence y, si una consulta
 * vuelve con 401, inicia otra una sola vez.
 */
export function crearClienteSupabase(
  config: ConfigSupabase,
  fetchFn: typeof fetch = fetch,
  ahora: () => number = Date.now,
): ClienteSupabase {
  let sesion: Sesion | null = null;
  let iniciando: Promise<Sesion> | null = null;

  async function iniciarSesion(): Promise<Sesion> {
    const respuesta = await fetchFn(`${config.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: config.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: config.email, password: config.password }),
      cache: "no-store",
    });
    if (!respuesta.ok) {
      throw new ErrorSupabase(
        "No se pudo iniciar sesión con la cuenta del coordinador de la demo: revisá SUPABASE_COORDINADOR_EMAIL y SUPABASE_COORDINADOR_PASSWORD.",
        respuesta.status,
      );
    }
    const cuerpo = (await respuesta.json()) as { access_token?: string; expires_in?: number };
    if (!cuerpo.access_token) {
      throw new ErrorSupabase("Supabase no devolvió un token al iniciar sesión.", respuesta.status);
    }
    const duracionMs = (cuerpo.expires_in ?? DURACION_POR_DEFECTO_S) * 1000;
    return { token: cuerpo.access_token, venceEn: ahora() + Math.max(duracionMs - MARGEN_RENOVACION_MS, 0) };
  }

  async function obtenerToken(renovar: boolean): Promise<string> {
    if (!renovar && sesion && ahora() < sesion.venceEn) return sesion.token;
    // Varias lecturas a la vez comparten un solo inicio de sesión.
    iniciando ??= iniciarSesion().finally(() => {
      iniciando = null;
    });
    sesion = await iniciando;
    return sesion.token;
  }

  function enviar(ruta: string, init: RequestInit, token: string): Promise<Response> {
    return fetchFn(`${config.url}/rest/v1/${ruta}`, {
      ...init,
      headers: {
        ...init.headers,
        apikey: config.anonKey,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  }

  async function pedir<T>(ruta: string, init: RequestInit): Promise<T> {
    let respuesta = await enviar(ruta, init, await obtenerToken(false));
    if (respuesta.status === 401) respuesta = await enviar(ruta, init, await obtenerToken(true));
    if (!respuesta.ok) throw await errorDe(respuesta);
    return (await respuesta.json()) as T;
  }

  return {
    consultar: <T>(consulta: string) => pedir<T>(consulta, { method: "GET" }),
    llamarRpc: <T>(nombre: string, argumentos: Record<string, unknown>) =>
      pedir<T>(`rpc/${nombre}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(argumentos),
      }),
  };
}
