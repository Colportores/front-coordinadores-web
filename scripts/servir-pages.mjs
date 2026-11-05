// Sirve `out/` (el resultado de `npm run build:pages`) bajo /front-coordinadores-web/,
// como lo hace GitHub Pages: /ruta/ -> ruta/index.html, /ruta -> redirige a /ruta/
// y lo que no existe responde 404 con 404.html. Sirve para probar el sitio de
// prueba en local antes de publicarlo:
//
//   docker compose -f compose.dev.yml run --rm --service-ports app sh -c "npm run build:pages && npm run servir:pages"
//   → http://localhost:3000/front-coordinadores-web/
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "/front-coordinadores-web";
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
const puerto = Number(process.env.PORT) || 3000;

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

if (!existsSync(join(raiz, "index.html"))) {
  console.error("servir-pages: no hay out/index.html; corré antes `npm run build:pages`.");
  process.exit(1);
}

function enviar(respuesta, estado, archivo) {
  respuesta.writeHead(estado, { "Content-Type": TIPOS[extname(archivo)] ?? "application/octet-stream" });
  respuesta.end(readFileSync(archivo));
}

createServer((peticion, respuesta) => {
  const { pathname } = new URL(peticion.url ?? "/", "http://localhost");
  const ruta = decodeURIComponent(pathname);

  if (ruta === "/") {
    respuesta.writeHead(302, { Location: `${BASE}/` }).end();
    return;
  }
  if (ruta !== BASE && !ruta.startsWith(`${BASE}/`)) return enviar(respuesta, 404, join(raiz, "404.html"));

  const relativa = normalize(ruta.slice(BASE.length)).replace(/^[/\\]+/, "");
  const archivo = join(raiz, relativa);
  if (archivo !== raiz && !archivo.startsWith(raiz + sep)) return enviar(respuesta, 404, join(raiz, "404.html"));

  if (existsSync(archivo) && statSync(archivo).isDirectory()) {
    if (!ruta.endsWith("/")) {
      respuesta.writeHead(301, { Location: `${ruta}/` }).end();
      return;
    }
    const indice = join(archivo, "index.html");
    if (existsSync(indice)) return enviar(respuesta, 200, indice);
  } else if (existsSync(archivo)) {
    return enviar(respuesta, 200, archivo);
  } else if (existsSync(`${archivo}.html`)) {
    return enviar(respuesta, 200, `${archivo}.html`);
  }
  enviar(respuesta, 404, join(raiz, "404.html"));
}).listen(puerto, "0.0.0.0", () => {
  console.log(`servir-pages: http://localhost:${puerto}${BASE}/ (Ctrl+C para cortar)`);
});
