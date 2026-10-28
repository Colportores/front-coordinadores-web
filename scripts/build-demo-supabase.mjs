// Artefacto de pruebas de demo (issue #123): el panel compilado y conectado al Supabase de DESARROLLO, de uso interno. Lo corre
// .github/workflows/demo-supabase-dev.yml en develop y sube `panel-supabase-dev/` como artefacto de Actions (7 días). También
// corre igual en Docker:
//
//   docker compose -f compose.dev.yml run --rm -e NEXT_PUBLIC_SUPABASE_URL -e NEXT_PUBLIC_SUPABASE_ANON_KEY app npm run build:demo-supabase
//
// 1. Falla si la URL no es la del proyecto dev, si la clave no es anónima/publishable, si el entorno trae otras variables de
//    credenciales o si hay archivos `.env*`. Ningún mensaje lleva un valor.
// 2. `next build` con entorno limpio y NEXT_PUBLIC_DEMO_SUPABASE_DEV=1 (servidor autónomo `standalone`, aviso, noindex).
//    El panel conectado necesita servidor (proxy, cookies, server actions): NO es un export estático (a diferencia de Pages).
// 3. Arma `panel-supabase-dev/` (server.js, .next, public, robots.txt, README.md con cómo servirlo y el correo de la cuenta demo, sin contraseña).
// 4. Revisa los archivos del artefacto (sin node_modules): solo la URL dev y la clave anónima; ni JWT de servicio ni secretos.
// 5. Levanta el servidor armado y comprueba el aviso, `noindex`, robots.txt y que una ruta protegida manda a iniciar sesión.
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  archivosEnvProhibidos,
  AVISO_DEMO_TEXTO,
  entornoDelBuild,
  hallazgosEnArchivoDeTexto,
  hallazgosEnTexto,
  problemasDelEntorno,
  readmeDelArtefacto,
  ROBOTS_TXT,
} from "./lib/guardia-demo-supabase.mjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const salida = join(raiz, "panel-supabase-dev");

function fallar(mensaje) {
  console.error(`build-demo-supabase: FALLA\n${mensaje}`);
  process.exit(1);
}

const problemas = problemasDelEntorno(process.env);
if (problemas.length > 0) fallar(`- ${problemas.join("\n- ")}`);

const archivosEnv = archivosEnvProhibidos(readdirSync(raiz));
if (archivosEnv.length > 0) fallar(`Hay archivos de entorno que Next leería en el build: ${archivosEnv.join(", ")}. Sacalos de la carpeta y reintentá.`);

const env = entornoDelBuild(process.env);

function correr(comando, argumentos) {
  const resultado = spawnSync(comando, argumentos, { cwd: raiz, env, stdio: "inherit" });
  if (resultado.status !== 0) process.exit(resultado.status ?? 1);
}

// `next build` directo (no `npm run build`): el hook `prebuild` no corre, así que se copia el worker de MapLibre acá.
correr(process.execPath, [join(raiz, "scripts", "copiar-worker-maplibre.mjs")]);
correr(process.execPath, [join(raiz, "node_modules", "next", "dist", "bin", "next"), "build"]);

const standalone = join(raiz, ".next", "standalone");
if (!existsSync(join(standalone, "server.js"))) fallar("`next build` no dejó .next/standalone/server.js (¿output: standalone?).");

rmSync(salida, { recursive: true, force: true });
cpSync(standalone, salida, { recursive: true });
mkdirSync(join(salida, ".next"), { recursive: true });
cpSync(join(raiz, ".next", "static"), join(salida, ".next", "static"), { recursive: true });
if (existsSync(join(raiz, "public"))) cpSync(join(raiz, "public"), join(salida, "public"), { recursive: true });
mkdirSync(join(salida, "public"), { recursive: true });

const commit = (process.env.GITHUB_SHA ?? spawnSync("git", ["rev-parse", "HEAD"], { cwd: raiz, encoding: "utf8" }).stdout ?? "").trim() || "desconocido";
writeFileSync(join(salida, "public", "robots.txt"), ROBOTS_TXT);
writeFileSync(join(salida, "README.md"), readmeDelArtefacto({ commit, fecha: new Date().toISOString() }));

// --- Revisión de lo que se va a subir ---
const EXTENSIONES_DE_TEXTO = /\.(html|js|mjs|cjs|css|json|txt|map|xml|svg|rsc|body|meta)$/i;
const hallazgos = [];
let avisoEnElBuild = false;

function recorrer(carpeta) {
  for (const nombre of readdirSync(carpeta)) {
    const ruta = join(carpeta, nombre);
    // node_modules es de terceros (supabase-js trae URLs de ejemplo en sus textos); lo nuestro es el resto.
    if (nombre === "node_modules") continue;
    if (statSync(ruta).isDirectory()) {
      recorrer(ruta);
    } else if (nombre === ".env" || nombre.startsWith(".env.")) {
      hallazgos.push(`${relative(salida, ruta)}: archivo de entorno dentro del artefacto`);
    } else if (EXTENSIONES_DE_TEXTO.test(nombre) || nombre === "server.js") {
      const texto = readFileSync(ruta, "utf8");
      // Fuera del código compilado (`.next/`), incluido el README, tampoco puede haber una contraseña escrita (el repo es público).
      const enElCompilado = relative(salida, ruta).split(sep)[0] === ".next";
      const motivos = enElCompilado ? hallazgosEnTexto(texto) : hallazgosEnArchivoDeTexto(texto);
      for (const motivo of motivos) hallazgos.push(`${relative(salida, ruta)}: ${motivo}`);
      if (texto.includes(AVISO_DEMO_TEXTO)) avisoEnElBuild = true;
    }
  }
}
recorrer(salida);
if (!avisoEnElBuild) hallazgos.push(`ningún archivo del build lleva el aviso «${AVISO_DEMO_TEXTO}»`);
if (hallazgos.length > 0) fallar(`El artefacto no pasa las guardas:\n- ${hallazgos.join("\n- ")}`);

// --- Prueba de humo: el servidor armado, tal cual se va a usar ---
const PUERTO = Number(process.env.PANEL_DEMO_PUERTO) || 3987;
const base = `http://127.0.0.1:${PUERTO}`;
const servidor = spawn(process.execPath, ["server.js"], {
  cwd: salida,
  env: { PATH: process.env.PATH ?? "", PORT: String(PUERTO), HOSTNAME: "127.0.0.1", NEXT_TELEMETRY_DISABLED: "1" },
  stdio: "ignore",
});

async function esperarServidor() {
  for (let intento = 0; intento < 60; intento++) {
    try {
      await fetch(`${base}/robots.txt`);
      return;
    } catch {
      await new Promise((resolver) => setTimeout(resolver, 500));
    }
  }
  throw new Error("el servidor del artefacto no arrancó en 30 s");
}

async function humo() {
  await esperarServidor();
  const fallos = [];

  const acceso = await fetch(`${base}/acceso`);
  const html = await acceso.text();
  if (acceso.status !== 200) fallos.push(`/acceso respondió ${acceso.status}`);
  if (!html.includes(AVISO_DEMO_TEXTO)) fallos.push("/acceso no lleva el aviso de versión de prueba");
  if (!/<meta name="robots" content="noindex, nofollow"\s*\/?>/.test(html)) fallos.push("/acceso no lleva la meta robots noindex");
  if (!/noindex/i.test(acceso.headers.get("x-robots-tag") ?? "")) fallos.push("/acceso no lleva la cabecera X-Robots-Tag noindex");
  for (const motivo of hallazgosEnTexto(html)) fallos.push(`/acceso: ${motivo}`);

  const robots = await (await fetch(`${base}/robots.txt`)).text();
  if (robots !== ROBOTS_TXT) fallos.push("/robots.txt no bloquea todo");

  // Sin sesión, una pantalla del panel manda a iniciar sesión (el panel está conectado: no cae a datos simulados).
  const inicio = await fetch(`${base}/inicio`, { redirect: "manual" });
  const destino = inicio.headers.get("location") ?? "";
  if (![302, 303, 307, 308].includes(inicio.status) || !destino.includes("/acceso")) fallos.push(`/inicio sin sesión respondió ${inicio.status} en vez de mandar a /acceso`);
  return fallos;
}

let fallos;
try {
  fallos = await humo();
} catch (error) {
  fallos = [error instanceof Error ? error.message : "error en la prueba de humo"];
} finally {
  servidor.kill();
}
if (fallos.length > 0) fallar(`La prueba de humo del servidor falló:\n- ${fallos.join("\n- ")}`);

console.log(`build-demo-supabase: OK (${relative(raiz, salida).split(sep).join("/")}/ conectado a Supabase dev, solo la clave anónima, noindex, con aviso y README)`);
