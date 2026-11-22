"use client";

import { useSyncExternalStore } from "react";

function suscribir(avisar: () => void): () => void {
  window.addEventListener("online", avisar);
  window.addEventListener("offline", avisar);
  return () => {
    window.removeEventListener("online", avisar);
    window.removeEventListener("offline", avisar);
  };
}

/** Si el navegador dice que hay conexión. Es una pista, no una garantía: quien la usa igual maneja que el pedido falle. */
export function useEnLinea(): boolean {
  return useSyncExternalStore(
    suscribir,
    () => navigator.onLine,
    () => true,
  );
}
