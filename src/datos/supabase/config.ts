/**
 * Conexión de desarrollo a Supabase (demo del 07/10, issue #45).
 *
 * El panel no habla con Supabase en staging ni en producción: ahí va el BFF (ADR-013). Esta
 * configuración solo existe para correr el panel en local contra el proyecto de la demo, con la
 * sesión de una cuenta de coordinador cargada en el servidor. Se ignora (devuelve `null`) cuando:
 *   - `NODE_ENV` es `production` (`next build` y `next start`: staging, producción y Pages), o
 *   - falta alguna de las cuatro variables.
 * Son variables del servidor (sin `NEXT_PUBLIC_`): la contraseña nunca llega al navegador.
 */
export interface ConfigSupabase {
  url: string;
  anonKey: string;
  email: string;
  password: string;
}

type Entorno = Record<string, string | undefined>;

export function leerConfigSupabase(env: Entorno = process.env): ConfigSupabase | null {
  if (env.NODE_ENV === "production") return null;

  const url = env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const anonKey = env.SUPABASE_ANON_KEY?.trim();
  const email = env.SUPABASE_COORDINADOR_EMAIL?.trim();
  const password = env.SUPABASE_COORDINADOR_PASSWORD;

  // La contraseña se usa tal cual (puede llevar espacios), pero una en blanco cuenta como ausente.
  if (!url || !anonKey || !email || !password?.trim()) return null;
  return { url, anonKey, email, password };
}
