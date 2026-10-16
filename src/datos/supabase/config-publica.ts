/**
 * Conexión del panel a Supabase (issue #18, ADR-013 y ADR-015): la URL del proyecto y la clave anónima
 * (publishable), una por entorno. Son públicas por diseño: viajan en el navegador de cada coordinador y lo
 * que protege los datos es la RLS más lo que tiene `grant` a `authenticated`, no el secreto de esta clave.
 *
 * Por eso van como `NEXT_PUBLIC_*`, que Next incrusta en el build (cada acceso a `process.env` tiene que
 * ser literal, ver `src/config/flags.ts`). No tiene nada que ver con `config.ts`, que es el puente de
 * desarrollo de la demo (#45) con la contraseña de una cuenta cargada en el servidor.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=https://<proyecto>.supabase.co
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=<clave publishable o anon>
 *
 * Una clave que no es de las que se pueden publicar (`sb_secret_…` o un JWT con el rol `service_role`) no se
 * acepta: ese rol se saltea la RLS y, con el prefijo `NEXT_PUBLIC_`, iría a parar al navegador de todos.
 */
export interface ConfigPublicaSupabase {
  url: string;
  anonKey: string;
}

type Entorno = Record<string, string | undefined>;

function esClaveDeServicio(clave: string): boolean {
  if (clave.startsWith("sb_secret_")) return true;
  const partes = clave.split(".");
  if (partes.length !== 3) return false;
  try {
    const base64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    const carga = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))) as { role?: unknown };
    return carga.role === "service_role";
  } catch {
    // No es un JWT legible: no se puede afirmar que sea de servicio, y Supabase lo rechazará si no sirve.
    return false;
  }
}

function urlDelProyecto(valor: string | undefined): string | null {
  const texto = valor?.trim().replace(/\/+$/, "");
  if (!texto) return null;
  try {
    const url = new URL(texto);
    return url.protocol === "https:" || url.protocol === "http:" ? texto : null;
  } catch {
    return null;
  }
}

/** La configuración del entorno dado, o `null` si falta la URL o la clave, o la clave no es publicable. */
export function leerConfigPublicaSupabase(env: Entorno): ConfigPublicaSupabase | null {
  const url = urlDelProyecto(env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey || esClaveDeServicio(anonKey)) return null;
  return { url, anonKey };
}

/** La del entorno de este build. Los accesos son literales para que Next los incruste en el navegador. */
export function configPublicaSupabase(): ConfigPublicaSupabase | null {
  return leerConfigPublicaSupabase({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
