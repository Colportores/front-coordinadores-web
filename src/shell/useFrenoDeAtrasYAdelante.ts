"use client";

import { useEffect } from "react";

import { esperarYSalir, estaEsperando, hayQueEsperar } from "@/shell/trabajo-pendiente";

/**
 * Lo mínimo que se usa de la Navigation API (TypeScript todavía no la trae toda): el evento `navigate` y `traverseTo`.
 * https://developer.mozilla.org/docs/Web/API/Navigation_API
 */
interface EventoNavigate extends Event {
  navigationType?: string;
  destination?: { key?: string };
}

interface NavegacionDelNavegador extends EventTarget {
  traverseTo: (clave: string) => { committed?: Promise<unknown>; finished?: Promise<unknown> } | undefined;
}

function navegacionDelNavegador(): NavegacionDelNavegador | null {
  const candidata = (window as unknown as { navigation?: NavegacionDelNavegador }).navigation;
  return candidata && typeof candidata.addEventListener === "function" && typeof candidata.traverseTo === "function"
    ? candidata
    : null;
}

/**
 * Atrás y adelante del navegador con trabajo a medio mandar (decisión del 16/10 en #55, pendiente P1 de la revisión):
 * se frenan, se mandan las inscripciones, se espera la respuesta (mismo tope y mismo estado que el menú, «‹ Equipo» y Esc)
 * y recién entonces se va al destino que eligió, con `traverseTo`, así que el historial queda como si no se hubiera frenado.
 * Si algo falla, se queda en la vista con su aviso. Una sola espera a la vez: un segundo atrás durante la espera se ignora.
 *
 * Solo funciona donde el navegador deja frenar un `traverse` (`cancelable`, que Chromium pide con una interacción previa
 * de la persona en la página). Donde no (sin Navigation API, o un `traverse` que no se puede cancelar) queda como antes: la
 * vista manda lo que tenía dentro del plazo al irse, pero un rechazo no se puede mostrar.
 *
 * Dos límites de Chromium que esto no resuelve (re-revisión de #55, R2):
 * - Deja frenar un solo `traverse` por interacción: un segundo atrás durante la espera sale `no cancelable` y pasa. La vista
 *   se desmonta, la inscripción ya estaba mandada, pero un rechazo no se ve. `esperarYSalir` evita al menos que la respuesta
 *   tardía devuelva a la persona a la entrada que había elegido antes.
 * - Si la entrada anterior es de otro documento (F5, entrada por la URL), el atrás no dispara `navigate`: no se frena y queda
 *   solo el aviso de `beforeunload`; si la persona acepta irse, la cuenta que estaba dentro del plazo no se manda.
 */
export function useFrenoDeAtrasYAdelante(): void {
  useEffect(() => {
    const navegacion = navegacionDelNavegador();
    if (!navegacion) return;

    function alNavegar(evento: Event) {
      const { navigationType, destination } = evento as EventoNavigate;
      if (navigationType !== "traverse" || !evento.cancelable) return;
      // Sin clave no hay a dónde volver con `traverseTo`: no se frena.
      const clave = destination?.key;
      if (!clave) return;
      if (!estaEsperando() && !hayQueEsperar()) return;
      evento.preventDefault();
      // Si mientras se espera la persona se va por su cuenta (Chromium deja frenar un solo atrás por interacción: el
      // segundo pasa), `esperarYSalir` no la devuelve a la entrada que había elegido al empezar.
      void esperarYSalir(() => {
        try {
          const resultado = navegacion?.traverseTo(clave);
          // Si esa entrada del historial ya no existe, no hay nada que hacer: la persona sigue donde estaba.
          resultado?.committed?.catch(() => undefined);
          resultado?.finished?.catch(() => undefined);
        } catch {
          // Ídem.
        }
      });
    }

    navegacion.addEventListener("navigate", alNavegar);
    return () => navegacion.removeEventListener("navigate", alNavegar);
  }, []);
}
