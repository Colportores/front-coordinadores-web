// Build del sitio de prueba del panel (GitHub Pages, issue #42): export
// estático con datos simulados, publicado solo desde develop por
// .github/workflows/deploy-pages.yml. Se corre igual en Docker:
//
//   docker compose -f compose.dev.yml run --rm app npm run build:pages
//
// 1. Falla si el entorno trae variables de un backend o una credencial real
//    (SUPABASE, SERVICE_ROLE, BFF, SECRET, ...) o si hay archivos `.env*`.
// 2. Corre `next build` con un entorno limpio: DEPLOY_PAGES=1 (export estático,
//    basePath /front-coordinadores-web, ver next.config.ts) y modo dev prendido.
// 3. Escribe robots.txt y .nojekyll en `out/` y falla si algún archivo de `out/`
//    parece llevar una clave o una URL de Supabase, o si alguna página HTML no
//    lleva `<meta name="robots" content="noindex, nofollow">` ni el aviso de
//    «Versión de prueba con datos simulados».
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
  archivosEnvProhibidos,
  entornoDelBuild,
  hallazgosEnTexto,
  ROBOTS_TXT,
  variablesProhibidas,
} from "./lib/guardia-pages.mjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const salida = join(raiz, "out");

function fallar(mensaje) {
  console.error(`build-pages: FALLA\n${mensaje}`);
  process.exit(1);
}

const variables = variablesProhibidas(process.env);
if (variables.length > 0) {
  fallar(
    `El build del sitio de prueba no admite estas variables del entorno: ${variables.join(", ")}.\n` +
      "Solo lleva datos simulados: sin claves ni URLs de Supabase ni de producción.",
  );
}

const archivosEnv = archivosEnvProhibidos(readdirSync(raiz));
if (archivosEnv.length > 0) {
  fallar(`Hay archivos de entorno que Next leería en el build: ${archivosEnv.join(", ")}. Sacalos de la carpeta y reintentá.`);
}

function correr(comando, argumentos, env) {
  const resultado = spawnSync(comando, argumentos, { cwd: raiz, env, stdio: "inherit" });
  if (resultado.status !== 0) process.exit(resultado.status ?? 1);
}

const env = entornoDelBuild(process.env);
// `next build` directo (no `npm run build`): el hook `prebuild` no corre, así que se copia el worker de MapLibre acá.
correr(process.execPath, [join(raiz, "scripts", "copiar-worker-maplibre.mjs")], env);
correr(process.execPath, [join(raiz, "node_modules", "next", "dist", "bin", "next"), "build"], env);

if (!existsSync(join(salida, "index.html"))) fallar("`next build` no dejó out/index.html.");

writeFileSync(join(salida, "robots.txt"), ROBOTS_TXT);
// Pages sirve los artefactos sin Jekyll; el archivo deja explícito que `_next/` no se filtra.
writeFileSync(join(salida, ".nojekyll"), "");

const EXTENSIONES_DE_TEXTO = /\.(html|js|mjs|css|json|txt|map|xml|svg)$/i;
const META_ROBOTS = /<meta name="robots" content="noindex, nofollow"\s*\/?>/;
// Ver src/shell/AvisoVersionDePrueba.tsx (texto de la decisión del 02/10, PR #43).
const AVISO_ROL = /<div role="note"/;
const REDIRECCION_A_INICIO = /NEXT_REDIRECT;replace;\/inicio;/;
const AVISO_TEXTO = /Versión de prueba con datos simulados\.<\/strong> Lo que hagas no se guarda: al recargar la página vuelve a los datos de ejemplo\./;
const hallazgos = [];

function recorrer(carpeta) {
  for (const nombre of readdirSync(carpeta)) {
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) {
      recorrer(ruta);
    } else if (EXTENSIONES_DE_TEXTO.test(nombre)) {
      const texto = readFileSync(ruta, "utf8");
      for (const motivo of hallazgosEnTexto(texto)) {
        hallazgos.push(`${relative(salida, ruta)}: ${motivo}`);
      }
      if (nombre.endsWith(".html") && !META_ROBOTS.test(texto)) {
        hallazgos.push(`${relative(salida, ruta)}: falta <meta name="robots" content="noindex, nofollow">`);
      }
      // Cada pantalla (también 404.html) lleva el aviso de versión de prueba: franja fija, sin botón para cerrarla.
      // La única excepción es out/index.html: la raíz solo redirige a /inicio (no pinta el panel).
      if (nombre.endsWith(".html")) {
        const esRedireccionDeLaRaiz = ruta === join(salida, "index.html") && REDIRECCION_A_INICIO.test(texto);
        if (!esRedireccionDeLaRaiz && !(AVISO_ROL.test(texto) && AVISO_TEXTO.test(texto))) {
          hallazgos.push(`${relative(salida, ruta)}: falta el aviso «Versión de prueba con datos simulados.»`);
        }
      }
    }
  }
}
recorrer(salida);

if (hallazgos.length > 0) {
  fallar(`La salida del sitio de prueba no pasa las guardas:\n- ${hallazgos.join("\n- ")}`);
}

console.log("build-pages: OK (out/ con datos simulados, sin credenciales; robots.txt bloquea todo)");
