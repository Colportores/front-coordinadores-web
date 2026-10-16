import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import { reiniciarTrabajoPendiente } from "@/shell/trabajo-pendiente";

// Tests herméticos: ningún flag del entorno (compose, CI) se filtra a los tests.
// Cada test prende lo que necesita con vi.stubEnv (unstubEnvs los restaura).
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_MODO_DEV", undefined);
  vi.stubEnv("NEXT_PUBLIC_PESTANA_STOCK", undefined);
  vi.stubEnv("NEXT_PUBLIC_PESTANA_CUENTAS", undefined);
  vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", undefined);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", undefined);
});

afterEach(() => {
  cleanup();
  // Ninguna inscripción sin contestar de un test se arrastra al siguiente (ni su aviso de cerrar la pestaña).
  reiniciarTrabajoPendiente();
  try {
    window.localStorage.clear();
  } catch {
    // jsdom sin localStorage: nada que limpiar.
  }
});
