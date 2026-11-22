import { useEffect, type RefObject } from "react";

/** Lo que marca a la fila elegida de una lista: `aria-pressed` (filtros) o `aria-current` (navegación). */
const SELECTOR_ELEGIDA = '[aria-pressed="true"], [aria-current="true"]';

/**
 * Mantiene a la vista, dentro de su lista con desplazamiento, la fila elegida. Con muchas ciudades (más de las que entran en la
 * columna) la elección que se recuerda de otra visita, o la que sigue marcada al contraer y volver a expandir la columna,
 * quedaba más abajo del borde sin que se viera cuál estaba elegida. `block: "nearest"` no mueve nada si la fila ya se ve y no
 * se pelea con el foco del teclado: solo desplaza lo justo.
 */
export function useMantenerVisible(lista: RefObject<HTMLElement | null>, clave: string): void {
  useEffect(() => {
    const elegida = lista.current?.querySelector<HTMLElement>(SELECTOR_ELEGIDA);
    elegida?.scrollIntoView?.({ block: "nearest" });
  }, [lista, clave]);
}
