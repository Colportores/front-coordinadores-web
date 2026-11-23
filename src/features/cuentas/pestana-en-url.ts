/** Las pestañas de Cuentas (vista 36). */
export type PestanaDeCuentas = "casa-editora" | "alquiler" | "tickets";

/** El parámetro de la dirección con el que la pestaña elegida viaja en la página: `/cuentas?pestana=tickets` (39B·05). */
export const PARAMETRO_PESTANA = "pestana";

/** La pestaña con la que abre la vista cuando la dirección no trae una válida. */
export const PESTANA_POR_DEFECTO: PestanaDeCuentas = "casa-editora";

const VALIDAS: ReadonlySet<string> = new Set<PestanaDeCuentas>(["casa-editora", "alquiler", "tickets"]);

/** La pestaña que pide la dirección, o `null` si no pide ninguna o pide una que no existe (se ignora, sin romper nada). */
export function pestanaDeUrl(valor: string | null | undefined): PestanaDeCuentas | null {
  return valor != null && VALIDAS.has(valor) ? (valor as PestanaDeCuentas) : null;
}

/**
 * Deja la pestaña elegida en la dirección de la página, sin sumar una entrada al historial y respetando el resto de los
 * parámetros (por ejemplo `?colportor=`, que la vista quita sola después de usarlo).
 */
export function escribirPestanaEnUrl(pestana: PestanaDeCuentas): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set(PARAMETRO_PESTANA, pestana);
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
}
