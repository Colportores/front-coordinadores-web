// Guardas del artefacto de pruebas de demo (issue #123): el panel compilado y conectado al Supabase de DESARROLLO, de uso
// interno, que el CI de develop sube a Actions (.github/workflows/demo-supabase-dev.yml). A diferencia del sitio de Pages
// (scripts/lib/guardia-pages.mjs: datos simulados, ninguna clave) este lleva dos cosas públicas por diseño, la URL del
// proyecto dev y la clave ANÓNIMA, y nada más: la autoridad es la RLS. Funciones puras: las usa
// scripts/build-demo-supabase.mjs y las prueba scripts/lib/guardia-demo-supabase.test.mjs. Ningún mensaje lleva un valor.

export const URL_PROYECTO_DEV = "https://ohdsavwpasfpapbyutrv.supabase.co";
export const HOST_PROYECTO_DEV = "ohdsavwpasfpapbyutrv.supabase.co";

/** Texto pedido por Cristian (28/10); el panel lo pinta en `src/shell/AvisoVersionDePrueba.tsx`. */
export const AVISO_DEMO_TEXTO = "Versión de prueba conectada a Supabase dev (datos de demostración)";

export const CUENTA_DEMO = Object.freeze({ correo: "coordinador.demo@example.com", contrasena: "Demo2026!" });

/** Las dos únicas variables de conexión que entran al build. */
export const VARIABLES_DE_CONEXION = Object.freeze(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]);

/** Nombres que delatan una credencial; los de conexión están exentos (son públicos por diseño). */
const NOMBRES_PROHIBIDOS = /SUPABASE|SERVICE_ROLE|ANON_KEY|BFF|DATABASE_URL|SECRET|PASSWORD|PRIVATE_KEY|API_KEY|ACCESS_KEY/i;

/** Flags del panel que se toleran en el entorno (el build fija los suyos). */
const NEXT_PUBLIC_TOLERADAS = new Set(["NEXT_PUBLIC_MODO_DEV", "NEXT_PUBLIC_PESTANA_STOCK", "NEXT_PUBLIC_PESTANA_CUENTAS", "NEXT_PUBLIC_DEMO_SUPABASE_DEV"]);

/** Lo único del entorno de quien lo lanza que llega a `next build` (nada de credenciales por descuido). */
const ENTORNO_PERMITIDO = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "LC_CTYPE", "TZ", "CI", "SYSTEMROOT", "NODE_OPTIONS"];

/** Lo que fija el build: panel conectado, como staging (Stock y Cuentas ocultas), servidor autónomo, aviso y noindex. */
export const VARIABLES_DEL_BUILD = Object.freeze({
  NEXT_PUBLIC_DEMO_SUPABASE_DEV: "1",
  NEXT_PUBLIC_MODO_DEV: "0",
  // Si la conexión no quedara válida, el build falla en vez de caer a datos simulados (#101).
  PANEL_EXIGIR_SUPABASE: "1",
  NEXT_TELEMETRY_DISABLED: "1",
});

function decodificarJwt(jwt) {
  const partes = jwt.split(".");
  if (partes.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/** `true` solo para una clave que se puede publicar: `sb_publishable_…` o un JWT con rol `anon`. Nunca `sb_secret_…` ni `service_role`. */
export function esClaveAnonima(clave) {
  if (typeof clave !== "string") return false;
  if (/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(clave)) return true;
  return decodificarJwt(clave)?.role === "anon";
}

/** Problemas del entorno de quien lanza el build (sin valores). Lista vacía = se puede construir. */
export function problemasDelEntorno(env) {
  const problemas = [];
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const clave = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url) problemas.push("falta NEXT_PUBLIC_SUPABASE_URL (variable del repo SUPABASE_URL)");
  else if (url !== URL_PROYECTO_DEV) problemas.push(`NEXT_PUBLIC_SUPABASE_URL no es la del proyecto de desarrollo (${URL_PROYECTO_DEV})`);
  if (!clave) problemas.push("falta NEXT_PUBLIC_SUPABASE_ANON_KEY (variable del repo SUPABASE_ANON_KEY)");
  else if (!esClaveAnonima(clave)) problemas.push("NEXT_PUBLIC_SUPABASE_ANON_KEY no es una clave anónima/publishable (¿una clave de servicio?)");

  const otras = Object.keys(env)
    .filter((nombre) => !VARIABLES_DE_CONEXION.includes(nombre))
    .filter((nombre) => NOMBRES_PROHIBIDOS.test(nombre) || (nombre.startsWith("NEXT_PUBLIC_") && !NEXT_PUBLIC_TOLERADAS.has(nombre)))
    .sort();
  if (otras.length > 0) problemas.push(`el entorno trae variables que este build no admite: ${otras.join(", ")}`);
  return problemas;
}

/** Entorno con el que corre `next build`: lo permitido del actual, la conexión pública y lo que fija el build. */
export function entornoDelBuild(env) {
  const limpio = {};
  for (const nombre of ENTORNO_PERMITIDO) {
    if (env[nombre] !== undefined) limpio[nombre] = env[nombre];
  }
  return {
    ...limpio,
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL.trim().replace(/\/+$/, ""),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim(),
    ...VARIABLES_DEL_BUILD,
  };
}

/** Archivos `.env*` que Next leería en el build (se ignoran en git; solo los hay en una máquina local). */
export function archivosEnvProhibidos(nombresDeArchivos) {
  return nombresDeArchivos
    .filter((nombre) => nombre === ".env" || nombre.startsWith(".env."))
    .filter((nombre) => !/\.(example|sample)$/.test(nombre))
    .sort();
}

const PATRON_JWT = /eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/g;
const PATRON_HOST_SUPABASE = /([a-z0-9-]+)\.supabase\.(?:co|in)\b/gi;

/**
 * Lo que el texto de un archivo del artefacto no debería tener. Acepta la URL del proyecto dev y las claves anónimas
 * (un JWT con rol `anon`, o `sb_publishable_…`); rechaza el resto. Devuelve los motivos, sin valores.
 */
export function hallazgosEnTexto(texto) {
  const motivos = new Set();
  for (const jwt of texto.match(PATRON_JWT) ?? []) {
    if (decodificarJwt(jwt)?.role !== "anon") motivos.add("un JWT que no es de la clave anónima (clave de servicio o de sesión)");
  }
  if (/\bsb_secret_[A-Za-z0-9_-]{8,}/.test(texto)) motivos.add("una clave secreta de Supabase (sb_secret_)");
  for (const [coincidencia] of texto.matchAll(PATRON_HOST_SUPABASE)) {
    if (coincidencia.toLowerCase() !== HOST_PROYECTO_DEV) motivos.add("la URL de un proyecto de Supabase que no es el de desarrollo");
  }
  // El nombre de la variable de la clave de servicio, no la palabra `service_role` suelta (ver guardia-pages.mjs).
  if (/SERVICE_ROLE_KEY/i.test(texto)) motivos.add("la variable de la clave de servicio de Supabase");
  if (texto.includes(CUENTA_DEMO.contrasena)) motivos.add("la contraseña de la cuenta demo (solo va en el README del artefacto)");
  return [...motivos];
}

/** Contenido de `robots.txt` del artefacto: no se indexa. */
export const ROBOTS_TXT = "User-agent: *\nDisallow: /\n";

/** README que viaja dentro del artefacto: qué es, cómo servirlo y las cuentas demo. */
export function readmeDelArtefacto({ commit, fecha }) {
  return `# Panel de coordinadores · versión de prueba conectada a Supabase dev

${AVISO_DEMO_TEXTO}. Uso interno de Cristian: no es un sitio público, no se indexa y no se publica en ningún hosting.

- Commit: ${commit}
- Generado: ${fecha}
- Conexión: proyecto Supabase de desarrollo (URL pública + clave anónima; la autoridad es la RLS). Sin clave de servicio ni secretos.
- Caduca a los 7 días (retención del artefacto de Actions).

## Cómo servirlo

Este panel necesita un servidor Node (inicio de sesión con cookies, server actions y guarda de rutas): **no es un export
estático**, así que \`npx serve\` o \`python -m http.server\` no sirven. Hace falta Node 24 (o Docker).

\`\`\`sh
# 1. Descomprimí el artefacto y entrá a la carpeta (la que tiene server.js)
cd panel-supabase-dev

# 2. Servidor autónomo en http://localhost:3000
PORT=3000 HOSTNAME=127.0.0.1 node server.js

# Alternativa con Docker, sin instalar Node
docker run --rm -p 3000:3000 -v "$PWD":/app -w /app -e HOSTNAME=0.0.0.0 node:24-slim node server.js
\`\`\`

Abrilo siempre como **http://localhost:3000**: la cookie de sesión es \`Secure\` y los navegadores solo la aceptan por HTTP en
\`localhost\`. Desde otro equipo hace falta HTTPS (por ejemplo un túnel). Si GitHub descomprime sin respetar las carpetas
ocultas, comprobá que existe \`.next/\` junto a \`server.js\`.

## Cuentas demo (datos de demostración)

- Correo: ${CUENTA_DEMO.correo}
- Contraseña: ${CUENTA_DEMO.contrasena}

Lo que se haga se guarda en la base de desarrollo (datos de demostración, no hay personas reales).
`;
}
