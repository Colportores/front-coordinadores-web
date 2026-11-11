import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import { ESPERAS } from "@/features/equipo/zonas/esperas";
import { reiniciarTrabajoPendiente } from "@/shell/trabajo-pendiente";

// jsdom da por visible todo foco puesto por código (en un navegador, un clic del mouse no): por defecto el foco no es de
// teclado, así el plazo de «Deshacer» corre. Los tests de «Deshacer AA» lo prenden con `vi.mocked(tieneFocoVisible)`.
vi.mock("@/features/equipo/foco-visible", () => ({ tieneFocoVisible: vi.fn(() => false) }));

// El borde de una zona por esquinas se calcula un rato después de la última esquina marcada (#182). En los tests no se
// espera: se calcula en el momento, salvo en los que prueban la espera, que la vuelven a poner.
const ESPERA_DEL_BORDE_MS = ESPERAS.bordeMs;
beforeEach(() => {
  ESPERAS.bordeMs = 0;
});
afterEach(() => {
  ESPERAS.bordeMs = ESPERA_DEL_BORDE_MS;
});

// Tests herméticos: ningún flag del entorno (compose, CI) se filtra a los tests.
// Cada test prende lo que necesita con vi.stubEnv (unstubEnvs los restaura).
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_MODO_DEV", undefined);
  vi.stubEnv("NEXT_PUBLIC_PESTANA_STOCK", undefined);
  vi.stubEnv("NEXT_PUBLIC_PESTANA_CUENTAS", undefined);
  vi.stubEnv("NEXT_PUBLIC_EQUIPO_BECAS", undefined);
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
