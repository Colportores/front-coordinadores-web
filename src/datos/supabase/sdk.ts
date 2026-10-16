import { createClient, type SupabaseClient, type SupabaseClientOptions } from "@supabase/supabase-js";

import { ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import type { ConfigPublicaSupabase } from "@/datos/supabase/config-publica";

/**
 * El cliente de `supabase-js` del panel (ADR-015): inicia sesión, renueva el token y manda el JWT del
 * coordinador en cada llamada, así que la RLS ve a la persona y no a la clave anónima.
 *
 * No elige dónde se guarda la sesión (el navegador, cookies): eso lo decide quien lo crea con `opciones.auth`
 * (`storage`…). Dos valores sí quedan fijos de entrada:
 * - `autoRefreshToken`: el token se renueva solo antes de vencer.
 * - `detectSessionInUrl` apagado: el panel no tiene inicio de sesión por enlace ni OAuth, y una sesión que
 *   llega en el fragmento de la URL no es una entrada que haya que aceptar.
 */
export function crearSupabase(config: ConfigPublicaSupabase, opciones: SupabaseClientOptions<"public"> = {}): SupabaseClient {
  return createClient(config.url, config.anonKey, {
    ...opciones,
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, ...opciones.auth },
  });
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
      if (error) throw new ErrorSupabase(error.message || `Supabase rechazó ${nombre}.`, status, error.code);
      return data as T;
    },
  };
}
