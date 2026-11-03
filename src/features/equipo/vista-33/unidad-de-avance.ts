"use client";

import { useCallback, useSyncExternalStore } from "react";

import { esUnidadDeAvance, UNIDAD_POR_DEFECTO, type UnidadDeAvance } from "./modelo";

/**
 * En qué medida se ve el avance de las becas («Ver avance en»): la elección se recuerda en este navegador (diseño 33,
 * «La elección se recuerda»). Si el navegador no deja guardar (modo privado, almacenamiento lleno), vale en memoria
 * mientras la pestaña siga abierta.
 */
const CLAVE = "panel.equipo.unidad-de-avance";

let enMemoria: UnidadDeAvance | null = null;
const oyentes = new Set<() => void>();

function leer(): UnidadDeAvance {
  if (enMemoria) return enMemoria;
  try {
    const guardada = window.localStorage.getItem(CLAVE);
    if (esUnidadDeAvance(guardada)) return guardada;
  } catch {
    // Sin almacenamiento: queda la de por defecto.
  }
  return UNIDAD_POR_DEFECTO;
}

function suscribir(avisar: () => void): () => void {
  oyentes.add(avisar);
  // Otra pestaña del panel cambió la elección.
  const alCambiarOtraPestana = (evento: StorageEvent) => {
    if (evento.key === CLAVE) {
      enMemoria = null;
      avisar();
    }
  };
  window.addEventListener("storage", alCambiarOtraPestana);
  return () => {
    oyentes.delete(avisar);
    window.removeEventListener("storage", alCambiarOtraPestana);
  };
}

export function guardarUnidadDeAvance(unidad: UnidadDeAvance): void {
  enMemoria = unidad;
  try {
    window.localStorage.setItem(CLAVE, unidad);
  } catch {
    // Vale en memoria.
  }
  oyentes.forEach((avisar) => avisar());
}

/** Solo para los tests: olvida lo que quedó en memoria de otro test. */
export function olvidarUnidadDeAvance(): void {
  enMemoria = null;
}

export function useUnidadDeAvance(): [UnidadDeAvance, (unidad: UnidadDeAvance) => void] {
  // En el servidor (y al hidratar) no hay almacenamiento: arranca en libros y pasa a lo guardado enseguida.
  const unidad = useSyncExternalStore(suscribir, leer, () => UNIDAD_POR_DEFECTO);
  const elegir = useCallback((nueva: UnidadDeAvance) => guardarUnidadDeAvance(nueva), []);
  return [unidad, elegir];
}
