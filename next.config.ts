import type { NextConfig } from "next";

// En Docker el código entra por un bind mount desde Windows/macOS, que no
// propaga eventos de archivos: el dev server tiene que sondear. Turbopack
// (Next 16) ignora WATCHPACK_POLLING; usa watchOptions.pollIntervalMs.
// compose.dev.yml define NEXT_WATCH_POLL_MS; fuera de Docker no se sondea.
const intervaloSondeo = Number(process.env.NEXT_WATCH_POLL_MS) || undefined;

const nextConfig: NextConfig = {
  ...(intervaloSondeo ? { watchOptions: { pollIntervalMs: intervaloSondeo } } : {}),
};

export default nextConfig;
