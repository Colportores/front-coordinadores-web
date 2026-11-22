import { useSyncExternalStore } from "react";

function suscribir(avisar: () => void): () => void {
  window.addEventListener("online", avisar);
  window.addEventListener("offline", avisar);
  return () => {
    window.removeEventListener("online", avisar);
    window.removeEventListener("offline", avisar);
  };
}

const leer = () => navigator.onLine;

/**
 * Si el navegador dice que hay conexión (`navigator.onLine`, que cambia con los eventos `online`/`offline`). En el servidor se
 * supone que sí: la vista se arma con conexión y el aviso aparece recién cuando el navegador la pierde.
 */
export function useEnLinea(): boolean {
  return useSyncExternalStore(suscribir, leer, () => true);
}
