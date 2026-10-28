import { configPublicaSupabase } from "@/datos/supabase/config-publica";

/**
 * Si el panel pide iniciar sesión (issue #18).
 *
 * - `activo`: están `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Todas las pantallas piden sesión de
 *   coordinador (`src/proxy.ts`) y las fuentes de datos hablan con las RPC de Supabase con el JWT de quien entró.
 * - `mal-configurado`: alguna de las dos variables está y no sirve (falta la otra, la URL no es `https://`, la clave es de
 *   servicio). **Ante la duda se bloquea:** el panel no muestra nada y la pantalla de acceso dice que no está disponible; nunca
 *   cae a datos simulados ni deja entrar a nadie.
 * - `apagado`: ninguna de las dos. Es el panel de siempre, sin login: el sitio de prueba de Pages (datos simulados, nunca
 *   lleva login), el desarrollo local sin variables y el puente de la demo (`src/datos/supabase/config.ts`).
 *
 * Los accesos a `process.env` son literales para que Next los incruste (ver `src/config/flags.ts`).
 */
export type ModoDeAcceso = "activo" | "mal-configurado" | "apagado";

export function modoDeAcceso(): ModoDeAcceso {
  // El sitio de prueba es un export estático con datos simulados: no tiene servidor donde guardar una sesión.
  if (process.env.NEXT_PUBLIC_DEPLOY_PAGES === "1") return "apagado";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url && !clave) return "apagado";
  return configPublicaSupabase() ? "activo" : "mal-configurado";
}
