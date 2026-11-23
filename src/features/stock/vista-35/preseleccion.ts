import type { Pestana } from "./modelo";

/** Los parámetros de la URL con los que Stock (vista 34) manda a Pedidos y transferencias: la ciudad del aviso y la pestaña. */
export const PARAMETRO_CIUDAD = "ciudad";
export const PARAMETRO_PESTANA = "pestana";
const VALOR_TRANSFERENCIAS = "transferencias";

/** «Ver pedidos» del aviso de Stock: la vista 35 con esa ciudad elegida (sin ciudad, la vista abre como siempre). */
export function hrefPedidos(ciudadId: string | null = null): string {
  return ciudadId === null ? "/stock/pedidos" : `/stock/pedidos?${PARAMETRO_CIUDAD}=${encodeURIComponent(ciudadId)}`;
}

/** «Ver transferencias» tras armar una: la vista 35 en su pestaña «Transferencias». */
export function hrefTransferencias(): string {
  return `/stock/pedidos?${PARAMETRO_PESTANA}=${VALOR_TRANSFERENCIAS}`;
}

/** La pestaña que pide la URL; cualquier otro valor deja la de siempre («Por autorizar»). */
export function pestanaDeUrl(valor: string | null): Pestana | null {
  return valor === VALOR_TRANSFERENCIAS ? "TRF" : null;
}
