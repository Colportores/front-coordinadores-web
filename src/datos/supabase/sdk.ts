import { createClient, type SupabaseClient, type SupabaseClientOptions } from "@supabase/supabase-js";

import { ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import type { ConfigPublicaSupabase } from "@/datos/supabase/config-publica";
import { crearFetchDeAuth } from "@/datos/supabase/fetch-auth";

/** Lo mismo que `Storage` del navegador, pero también admite uno asíncrono (cookies, IndexedDB). */
type AlmacenDeSesion = NonNullable<NonNullable<SupabaseClientOptions<"public">["auth"]>["storage"]>;

/** Dónde quedó guardada la sesión de cada cliente, para poder borrarla aunque el SDK no llegue a hacerlo. */
const sesionesGuardadas = new WeakMap<SupabaseClient, { almacen: AlmacenDeSesion; clave: string }>();

function almacenEnMemoria(): AlmacenDeSesion {
  const datos = new Map<string, string>();
  return {
    getItem: (clave) => datos.get(clave) ?? null,
    setItem: (clave, valor) => void datos.set(clave, valor),
    removeItem: (clave) => void datos.delete(clave),
  };
}

/** El del navegador si se puede usar (puede estar bloqueado) y, si no, uno en memoria: la sesión dura lo que la pestaña. */
function almacenPorDefecto(): AlmacenDeSesion {
  try {
    if (globalThis.localStorage) return globalThis.localStorage;
  } catch {
    // Acceso bloqueado por el navegador.
  }
  return almacenEnMemoria();
}

/** La clave con la que `supabase-js` guarda la sesión si nadie le da otra: `sb-<proyecto>-auth-token`. */
function claveDeAlmacenamiento(urlDelProyecto: string): string {
  return `sb-${new URL(urlDelProyecto).hostname.split(".")[0]}-auth-token`;
}

/**
 * El cliente de `supabase-js` del panel (ADR-015): inicia sesión, renueva el token y manda el JWT del
 * coordinador en cada llamada, así que la RLS ve a la persona y no a la clave anónima.
 *
 * No elige dónde se guarda la sesión (el navegador, cookies): eso lo decide quien lo crea con `opciones.auth`
 * (`storage`, `storageKey`…); sin nada, el `localStorage` del navegador o la memoria. Lo que sí hace es
 * quedarse con ese lugar (`borrarSesionGuardada`) y poner el `fetch` de `fetch-auth.ts`. Valores fijos de entrada:
 * - `autoRefreshToken`: el token se renueva solo antes de vencer.
 * - `detectSessionInUrl` apagado: el panel no tiene inicio de sesión por enlace ni OAuth, y una sesión que
 *   llega en el fragmento de la URL no es una entrada que haya que aceptar.
 *
 * Con `persistSession: false` el SDK guarda la sesión en una memoria propia, a la que desde afuera no se llega:
 * un cliente así (solo lo usaría un test) no se puede limpiar con `borrarSesionGuardada`.
 */
export function crearSupabase(config: ConfigPublicaSupabase, opciones: SupabaseClientOptions<"public"> = {}): SupabaseClient {
  const persistir = opciones.auth?.persistSession !== false;
  const almacen = opciones.auth?.storage ?? almacenPorDefecto();
  const clave = opciones.auth?.storageKey ?? claveDeAlmacenamiento(config.url);
  const fetchBase: typeof fetch = opciones.global?.fetch ?? ((...argumentos) => globalThis.fetch(...argumentos));

  const supabase = createClient(config.url, config.anonKey, {
    ...opciones,
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, ...opciones.auth, storage: almacen, storageKey: clave },
    global: {
      ...opciones.global,
      fetch: crearFetchDeAuth(fetchBase, {
        haySesionGuardada: async () => (persistir ? (await almacen.getItem(clave)) !== null : true),
      }),
    },
  });
  if (persistir) sesionesGuardadas.set(supabase, { almacen, clave });
  return supabase;
}

/**
 * Borra de este navegador la sesión guardada y el verificador de código, sin hablar con el servidor. Es el
 * último recurso de «cerrar sesión» cuando `supabase.auth.signOut()` no llega a hacerlo (token vencido sin red,
 * cierre colgado): el SDK, ante una falla al renovar o al revocar, deja la sesión guardada. Una renovación en
 * camino no la vuelve a guardar (`fetch-auth.ts`). No avisa a quien escuche `onAuthStateChange`.
 */
export async function borrarSesionGuardada(supabase: SupabaseClient): Promise<void> {
  const guardada = sesionesGuardadas.get(supabase);
  if (!guardada) return;
  for (const clave of [guardada.clave, `${guardada.clave}-code-verifier`]) {
    try {
      await guardada.almacen.removeItem(clave);
    } catch {
      // Un almacén que falla al borrar no deja nada más por hacer desde acá.
    }
  }
}

/**
 * El cliente que comparten las fuentes de datos de `src/datos/*`: solo RPC (ADR-013, nunca `.from()` sobre
 * tablas), con la sesión de `supabase`. Un rechazo sale como `ErrorSupabase` con el estado HTTP y el código
 * que mandó la base, para que cada fuente lo traduzca al aviso de su pantalla; `causaDe` dice si fue la
 * sesión, la conexión o la regla de negocio.
 */
export function crearClienteRpc(supabase: SupabaseClient): ClienteRpc {
  return {
    async llamarRpc<T>(nombre: string, argumentos: Record<string, unknown>): Promise<T> {
      const { data, error, status } = await supabase.rpc(nombre, argumentos);
      if (error) {
        throw new ErrorSupabase(error.message || `Supabase rechazó ${nombre}.`, status, error.code, error.details ?? "");
      }
      return data as T;
    },
  };
}
