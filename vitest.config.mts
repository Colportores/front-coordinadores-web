import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
    restoreMocks: true,
    unstubEnvs: true,
    // Cobertura para SonarQube Cloud (docs/ci-sonarqube.md): solo con COVERAGE=1, así `npm run test` sigue siendo el
    // de siempre. Deja `coverage/lcov.info`, con rutas relativas a la raíz del repo.
    coverage: {
      enabled: process.env.COVERAGE === "1",
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      reportsDirectory: "coverage",
      // En el CI `coverage/` es un volumen montado: vitest no puede borrarlo (EBUSY) antes de escribir, solo sobrescribir.
      clean: false,
      // Política de cobertura de docs-organizacion (RA-MA02, convenciones-desarrollo §6.4 y arc42 §8.9): total >= 70 %,
      // dominio >= 90 %, datos >= 80 %, presentación >= 50 %. Solo se evalúa con COVERAGE=1 y una corrida completa
      // (en el CI): si la cobertura baja de estos pisos, `npm run check` falla. Hoy está en 96-99 %.
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 70,
        branches: 70,
        "src/{lib,auth,config}/**": { lines: 90 },
        "src/datos/**": { lines: 80 },
        "src/**/*.tsx": { lines: 50 },
      },
      include: ["src/**/*.{ts,tsx}", "scripts/**/*.mjs"],
      exclude: ["**/*.test.{ts,tsx,mjs}", "src/test/**", "src/**/*.d.ts"],
    },
  },
});
