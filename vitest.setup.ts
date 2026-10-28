import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import { reiniciarTrabajoPendiente } from "@/shell/trabajo-pendiente";

// jsdom da por visible todo foco puesto por código (en un navegador, un clic del mouse no): por defecto el foco no es de
// teclado, así el plazo de «Deshacer» corre. Los tests de «Deshacer AA» lo prenden con `vi.mocked(tieneFocoVisible)`.
vi.mock("@/features/equipo/foco-visible", () => ({ tieneFocoVisible: vi.fn(() => false) }));

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
