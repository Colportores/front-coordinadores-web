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
      include: ["src/**/*.{ts,tsx}", "scripts/**/*.mjs"],
      exclude: ["**/*.test.{ts,tsx,mjs}", "src/test/**", "src/**/*.d.ts"],
    },
  },
});
