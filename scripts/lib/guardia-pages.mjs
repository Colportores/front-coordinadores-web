// Guardas del build del sitio de prueba (GitHub Pages, issue #42): ese sitio
// publica datos simulados y nada más. Nunca debe llevar claves, URLs de
// Supabase ni de producción. Funciones puras: las usa scripts/build-pages.mjs
// y las prueba scripts/lib/guardia-pages.test.mjs.

/** Nombres de variables que delatan un backend o una credencial real. */
const NOMBRES_PROHIBIDOS = /SUPABASE|SERVICE_ROLE|ANON_KEY|BFF|DATABASE_URL|SECRET|PASSWORD|PRIVATE_KEY|API_KEY|ACCESS_KEY/i;

/** Los flags del panel que existen hoy: se toleran en el entorno, pero el build de Pages los fija él. */
const NEXT_PUBLIC_TOLERADAS = new Set(["NEXT_PUBLIC_MODO_DEV", "NEXT_PUBLIC_PESTANA_STOCK", "NEXT_PUBLIC_PESTANA_CUENTAS"]);

/** Lo único del entorno de quien lo lanza que llega a `next build` (nada de credenciales por descuido). */
const ENTORNO_PERMITIDO = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "LC_CTYPE", "TZ", "CI", "SYSTEMROOT", "NODE_OPTIONS"];

/** Lo que fija el build de Pages: datos simulados, todas las pestañas visibles, export estático. */
export const VARIABLES_DEL_BUILD = Object.freeze({
  DEPLOY_PAGES: "1",
  NEXT_PUBLIC_MODO_DEV: "1",
  NEXT_TELEMETRY_DISABLED: "1",
});

/** Variables del entorno que no pueden estar en el build de Pages. Devuelve sus nombres. */
export function variablesProhibidas(env) {
  return Object.keys(env)
    .filter((nombre) => {
      if (NOMBRES_PROHIBIDOS.test(nombre)) return true;
      return nombre.startsWith("NEXT_PUBLIC_") && !NEXT_PUBLIC_TOLERADAS.has(nombre);
    })
    .sort();
}

/** Entorno con el que corre `next build`: lo permitido del entorno actual más lo que fija el build. */
export function entornoDelBuild(env) {
  const limpio = {};
  for (const nombre of ENTORNO_PERMITIDO) {
    if (env[nombre] !== undefined) limpio[nombre] = env[nombre];
  }
  return { ...limpio, ...VARIABLES_DEL_BUILD };
}

/** Archivos `.env*` que Next leería en el build (se ignoran en git; solo los hay en una máquina local). */
export function archivosEnvProhibidos(nombresDeArchivos) {
  return nombresDeArchivos
    .filter((nombre) => nombre === ".env" || nombre.startsWith(".env."))
    .filter((nombre) => !/\.(example|sample)$/.test(nombre))
    .sort();
}

const PATRONES_EN_SALIDA = [
  { motivo: "un JWT (clave de Supabase o de sesión)", patron: /eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/ },
  { motivo: "una clave de Supabase (sb_secret_/sb_publishable_)", patron: /\bsb_(secret|publishable)_[A-Za-z0-9_-]{8,}/ },
  { motivo: "una URL de proyecto de Supabase", patron: /[a-z0-9-]+\.supabase\.(co|in)\b/i },
  { motivo: "el rol de servicio de Supabase", patron: /service_role/i },
];

/** Lo que el texto de un archivo de la salida no debería tener. Devuelve los motivos encontrados. */
export function hallazgosEnTexto(texto) {
  return PATRONES_EN_SALIDA.filter(({ patron }) => patron.test(texto)).map(({ motivo }) => motivo);
}

/** Contenido de `out/robots.txt`: el sitio de prueba no se indexa. */
export const ROBOTS_TXT = "User-agent: *\nDisallow: /\n";
