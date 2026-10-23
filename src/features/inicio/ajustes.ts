import { useCallback, useMemo, useSyncExternalStore } from "react";

import { claveDe, seleccionDe, TODAS, type Seleccion } from "@/features/inicio/modelo";

/**
 * Lo que Inicio recuerda para la próxima vez que se abre el panel: la ciudad elegida y si las dos columnas de los
 * extremos están abiertas o colapsadas (vista 31). Es una comodidad de cada navegador: si el almacenamiento no está
 * (ventana privada, datos bloqueados) la vista anda igual y recuerda solo mientras la pestaña siga abierta.
 */

const CLAVE = "inicio-ajustes";

export interface Ajustes {
  seleccion: Seleccion;
  ciudadesCerrada: boolean;
  pendientesCerrada: boolean;
}

export const AJUSTES_POR_DEFECTO: Ajustes = { seleccion: TODAS, ciudadesCerrada: false, pendientesCerrada: false };

const oyentes = new Set<() => void>();
let respaldo: string | null = null;

function leerCrudo(): string | null {
  try {
    return window.localStorage.getItem(CLAVE);
  } catch {
    return respaldo;
  }
}

function escribirCrudo(texto: string) {
  respaldo = texto;
  try {
    window.localStorage.setItem(CLAVE, texto);
  } catch {
    // Sin almacenamiento: queda en `respaldo`.
  }
  oyentes.forEach((oyente) => oyente());
}

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  window.addEventListener("storage", oyente);
  return () => {
    oyentes.delete(oyente);
    window.removeEventListener("storage", oyente);
  };
}

export function interpretar(crudo: string | null): Ajustes {
  if (crudo === null) return AJUSTES_POR_DEFECTO;
  try {
    const datos: unknown = JSON.parse(crudo);
    if (typeof datos !== "object" || datos === null) return AJUSTES_POR_DEFECTO;
    const d = datos as Record<string, unknown>;
    return {
      seleccion: seleccionDe(d.seleccion),
      ciudadesCerrada: d.ciudadesCerrada === true,
      pendientesCerrada: d.pendientesCerrada === true,
    };
  } catch {
    return AJUSTES_POR_DEFECTO;
  }
}

/** Solo para los tests: olvida lo recordado en memoria. */
export function olvidarAjustes() {
  respaldo = null;
}

export function useAjustesDeInicio(): [Ajustes, (cambios: Partial<Ajustes>) => void] {
  // El texto crudo es un valor primitivo: `useSyncExternalStore` lo compara por valor. En el servidor, los de siempre.
  const crudo = useSyncExternalStore(suscribir, leerCrudo, () => null);
  const ajustes = useMemo(() => interpretar(crudo), [crudo]);

  const cambiar = useCallback((cambios: Partial<Ajustes>) => {
    const actuales = interpretar(leerCrudo());
    const nuevos = { ...actuales, ...cambios };
    escribirCrudo(
      JSON.stringify({
        seleccion: claveDe(nuevos.seleccion),
        ciudadesCerrada: nuevos.ciudadesCerrada,
        pendientesCerrada: nuevos.pendientesCerrada,
      }),
    );
  }, []);

  return [ajustes, cambiar];
}
