import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// Tests herméticos: ningún flag del entorno (compose, CI) se filtra a los tests.
// Cada test prende lo que necesita con vi.stubEnv (unstubEnvs los restaura).
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_MODO_DEV", undefined);
  vi.stubEnv("NEXT_PUBLIC_PESTANA_STOCK", undefined);
  vi.stubEnv("NEXT_PUBLIC_PESTANA_CUENTAS", undefined);
});

afterEach(() => {
  cleanup();
  try {
    window.localStorage.clear();
  } catch {
    // jsdom sin localStorage: nada que limpiar.
  }
});
