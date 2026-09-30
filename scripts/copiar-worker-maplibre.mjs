// MapLibre carga su worker por URL y, bajo Turbopack, no puede deducirla
// (import.meta.url no es http). Se sirve desde /maplibre/ y el mapa la fija con setWorkerUrl.
// Corre antes de `dev` y de `build`; los archivos generados no se versionan (ver .gitignore).
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origen = join(raiz, "node_modules", "maplibre-gl", "dist");
const destino = join(raiz, "public", "maplibre");

mkdirSync(destino, { recursive: true });
// El worker importa el módulo compartido con una ruta relativa: van juntos.
for (const archivo of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(origen, archivo), join(destino, archivo));
}
