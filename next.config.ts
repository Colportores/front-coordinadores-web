import type { NextConfig } from "next";

// En Docker el código entra por un bind mount desde Windows/macOS, que no
// propaga eventos de archivos: el dev server tiene que sondear. Turbopack
// (Next 16) ignora WATCHPACK_POLLING; usa watchOptions.pollIntervalMs.
// compose.dev.yml define NEXT_WATCH_POLL_MS; fuera de Docker no se sondea.
const intervaloSondeo = Number(process.env.NEXT_WATCH_POLL_MS) || undefined;

// Sitio de prueba en GitHub Pages (issue #42): export estático con datos
// simulados, solo desde develop. Lo prende `npm run build:pages`
// (scripts/build-pages.mjs); sin DEPLOY_PAGES el build es el de siempre.
const BASE_PATH_PAGES = "/front-coordinadores-web";
const buildDePages = process.env.DEPLOY_PAGES === "1";

const nextConfig: NextConfig = {
  ...(intervaloSondeo ? { watchOptions: { pollIntervalMs: intervaloSondeo } } : {}),
  ...(buildDePages
    ? {
        output: "export",
        basePath: BASE_PATH_PAGES,
        assetPrefix: BASE_PATH_PAGES,
        // /equipo/ -> equipo/index.html: Pages sirve las rutas profundas y su recarga sin reglas de reescritura.
        trailingSlash: true,
        images: { unoptimized: true },
        // Variables que el código lee con `process.env.NEXT_PUBLIC_*` (se incrustan en el build; las condiciones
        // literales sobre ellas podan el código que solo sirve con servidor, como las server actions).
        env: { NEXT_PUBLIC_DEPLOY_PAGES: "1", NEXT_PUBLIC_BASE_PATH: BASE_PATH_PAGES },
      }
    : {}),
};

export default nextConfig;
