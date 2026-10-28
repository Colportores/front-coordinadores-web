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
 *
 * Dos chequeos, porque Next incrusta `NEXT_PUBLIC_*` en el build **antes** de que corra este módulo:
 * - `verificarEntornoSupabase` frena `next dev` y `next build` (lo llama `next.config.ts`) si la clave es de
 *   servicio: así nunca llega a un archivo del navegador.
 * - `leerConfigPublicaSupabase` la rechaza también al usarla (defensa en profundidad: si el build se hizo por
 *   otro camino, la conexión queda apagada en vez de usarla).
 * Ninguno escribe la clave en un mensaje ni en un log.
 *
 * La URL solo puede ser `https://`, salvo para el Supabase local (`localhost`, `127.0.0.1`, `[::1]`): con
 * `http://` a otro host, el correo y la contraseña saldrían en claro en el primer pedido.
 */
export interface ConfigPublicaSupabase {
  url: string;
  anonKey: string;
}

type Entorno = Record<string, string | undefined>;

export function esClaveDeServicio(clave: string): boolean {
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

/** Los únicos hosts donde se acepta `http://`: el Supabase local de `supabase start`. */
const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "[::1]"]);

function urlDelProyecto(valor: string | undefined): string | null {
  const texto = valor?.trim().replace(/\/+$/, "");
  if (!texto) return null;
  try {
    const url = new URL(texto);
    if (url.protocol === "https:") return texto;
    return url.protocol === "http:" && HOSTS_LOCALES.has(url.hostname) ? texto : null;
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

/**
 * Corta el arranque (`next dev`, `next build`) si `NEXT_PUBLIC_SUPABASE_ANON_KEY` es una clave de servicio. Se
 * llama desde `next.config.ts`, antes de que Next incruste la variable en los archivos del navegador. El mensaje
 * dice qué variable es y qué hacer, no la clave.
 */
export function verificarEntornoSupabase(env: Entorno): void {
  const clave = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (clave && esClaveDeServicio(clave)) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY tiene una clave de servicio (sb_secret_… o rol service_role): con el prefijo " +
        "NEXT_PUBLIC_ viajaría en el navegador de todos y se saltea la RLS. Usá la clave publishable o anon del proyecto.",
    );
  }
}

const VALORES_VERDADEROS = new Set(["1", "true", "si", "sí", "on"]);
const VALORES_FALSOS = new Set(["0", "false", "no", "off", ""]);
const activa = (valor: string | undefined) => VALORES_VERDADEROS.has(valor?.trim().toLowerCase() ?? "");

/**
 * Corta el build de producción si faltan las variables de Supabase y nadie pidió el modo simulado (issue #101, decisión
 * «Sin env» de Cristian, 27/10): en producción no se cae a datos de ejemplo por un descuido de configuración.
 *
 * - Se arma con `PANEL_EXIGIR_SUPABASE=1` (variable del servidor de build, sin `NEXT_PUBLIC_`). **Sin ella no hace nada**: hasta
 *   que exista el Supabase de producción (diciembre) el build de staging y el CI siguen como siempre, con el aviso de datos
 *   simulados (`src/config/datos-simulados.ts`). Cuando exista, se prende en el build de producción y no se toca el código.
 * - El modo simulado se prende solo con una variable explícita: `PANEL_DATOS_SIMULADOS=1` o el build del sitio de prueba
 *   (`DEPLOY_PAGES=1`; `build:pages` carga ambas).
 * - Se llama desde `next.config.ts`, junto a `verificarEntornoSupabase`. El mensaje dice qué falta y qué hacer, nunca el valor.
 */
export function verificarEntornoDeProduccion(env: Entorno): void {
  // Un valor que no es ni verdadero ni falso («yes», un typo) no desarma el chequeo en silencio: frena el build (QA de #101).
  const pedido = env.PANEL_EXIGIR_SUPABASE?.trim().toLowerCase();
  if (pedido !== undefined && !VALORES_VERDADEROS.has(pedido) && !VALORES_FALSOS.has(pedido)) {
    throw new Error(
      "PANEL_EXIGIR_SUPABASE tiene un valor que no se reconoce. Usá 1, true, si, sí u on para exigir Supabase, o 0, false, no, off o vacía para no exigirlo.",
    );
  }
  if (!activa(env.PANEL_EXIGIR_SUPABASE)) return;
  if (activa(env.PANEL_DATOS_SIMULADOS) || env.DEPLOY_PAGES === "1") return;
  if (leerConfigPublicaSupabase(env)) return;

  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const clave = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const que = !url && !clave
    ? "faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY"
    : !url
      ? "falta NEXT_PUBLIC_SUPABASE_URL"
      : !clave
        ? "falta NEXT_PUBLIC_SUPABASE_ANON_KEY"
        : "NEXT_PUBLIC_SUPABASE_URL no es una URL https:// válida (http:// solo vale para localhost) o la clave no se puede publicar";
  throw new Error(
    `El build de producción exige la conexión a Supabase (PANEL_EXIGIR_SUPABASE): ${que}. Cargalas o, si este build es una ` +
      "demo con datos de ejemplo, prendé PANEL_DATOS_SIMULADOS=1.",
  );
}
