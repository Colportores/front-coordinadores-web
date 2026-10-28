import type { SupabaseClient } from "@supabase/supabase-js";

import { crearSupabaseConCookies } from "@/auth/supabase-cookies";
import { configPublicaSupabase } from "@/datos/supabase/config-publica";
import { crearClienteRpc } from "@/datos/supabase/sdk";
import type { ClienteRpc } from "@/datos/supabase/cliente";

/**
 * El cliente de Supabase de un componente de servidor o una server action: la sesión sale de las cookies del pedido
 * (`next/headers`), así que la base ve a la persona que entró y no a la clave anónima. Un cliente por llamada.
 *
 * Escribir cookies (cuando se inicia o se cierra la sesión, o se renueva el token) solo se puede en una server action o un
 * route handler. En un componente de servidor `cookies().set` tira: se ignora, porque la renovación ya la hizo el proxy
 * (`src/proxy.ts`) antes de renderizar y dejó el token vigente en el pedido.
 *
 * Sin la configuración pública (`modoDeAcceso() !== "activo"`) tira: nadie llama a esto en ese caso.
 */
export async function crearSupabaseDeServidor(): Promise<SupabaseClient> {
  const config = configPublicaSupabase();
  if (!config) throw new Error("Falta la configuración de Supabase del panel (NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY).");
  // Import dinámico: este módulo cuelga de los `index.ts` de las fuentes, que no deben arrastrar `next/headers` a ningún bundle.
  const { cookies } = await import("next/headers");
  const almacen = await cookies();
  return crearSupabaseConCookies(config, {
    leer: () => almacen.getAll().map(({ name, value }) => ({ name, value })),
    escribir: (aEscribir) => {
      try {
        for (const { name, value, options } of aEscribir) almacen.set(name, value, options);
      } catch {
        // Componente de servidor: las cookies son de solo lectura. El proxy ya renovó la sesión de este pedido.
      }
    },
  });
}

/** El cliente de RPC con la sesión de quien hace el pedido; es el que usan las fuentes de datos (`src/datos/*`). */
export async function clienteRpcDeSesion(): Promise<ClienteRpc> {
  return crearClienteRpc(await crearSupabaseDeServidor());
}
