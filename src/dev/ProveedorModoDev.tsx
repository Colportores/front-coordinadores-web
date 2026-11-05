"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";

export const CLAVE_CHIPS_VISIBLES = "colportaje.panel.modoDev.chipsVisibles";

interface ValorModoDev {
  /** Modo dev prendido (NEXT_PUBLIC_MODO_DEV). */
  activo: boolean;
  /** Chips de HU visibles. Se apagan para sacar capturas limpias. */
  chipsVisibles: boolean;
  cambiarChipsVisibles: (visibles: boolean) => void;
}

const ContextoModoDev = createContext<ValorModoDev>({
  activo: false,
  chipsVisibles: false,
  cambiarChipsVisibles: () => {},
});

// Preferencia guardada en localStorage. Si el navegador no deja usarlo
// (modo privado, datos bloqueados) se recuerda en memoria mientras dure la pestaña.
let preferenciaEnMemoria: boolean | undefined;
const suscriptores = new Set<() => void>();

function leerChipsVisibles(): boolean {
  try {
    const valor = window.localStorage.getItem(CLAVE_CHIPS_VISIBLES);
    if (valor === "1") return true;
    if (valor === "0") return false;
    return preferenciaEnMemoria ?? true;
  } catch {
    return preferenciaEnMemoria ?? true;
  }
}

function guardarChipsVisibles(visibles: boolean) {
  try {
    window.localStorage.setItem(CLAVE_CHIPS_VISIBLES, visibles ? "1" : "0");
    preferenciaEnMemoria = undefined;
  } catch {
    // Sin localStorage (o sin permiso de escritura): queda solo en memoria.
    preferenciaEnMemoria = visibles;
  }
  suscriptores.forEach((avisar) => avisar());
}

function suscribir(avisar: () => void) {
  suscriptores.add(avisar);
  window.addEventListener("storage", avisar);
  return () => {
    suscriptores.delete(avisar);
    window.removeEventListener("storage", avisar);
  };
}

export function ProveedorModoDev({ activo, children }: { activo: boolean; children: ReactNode }) {
  // En el servidor no hay localStorage: se renderiza con los chips visibles.
  const chipsVisibles = useSyncExternalStore(suscribir, leerChipsVisibles, () => true);

  const cambiarChipsVisibles = useCallback((visibles: boolean) => guardarChipsVisibles(visibles), []);

  const valor = useMemo(
    () => ({ activo, chipsVisibles: activo && chipsVisibles, cambiarChipsVisibles }),
    [activo, chipsVisibles, cambiarChipsVisibles],
  );

  return <ContextoModoDev.Provider value={valor}>{children}</ContextoModoDev.Provider>;
}

export function useModoDev(): ValorModoDev {
  return useContext(ContextoModoDev);
}
