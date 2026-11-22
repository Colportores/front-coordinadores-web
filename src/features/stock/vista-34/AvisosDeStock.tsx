import Link from "next/link";

import type { AvisoDeStock } from "./modelo";

const ID_CUENTA = "avisos-de-stock-cuenta";

const CLASE_BOTON =
  "inline-flex min-h-8 flex-none items-center rounded-control border border-borde bg-superficie px-3 text-[11.5px] font-semibold whitespace-nowrap text-tinta-2 hover:bg-fondo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento";

/**
 * La franja de avisos: un producto que se agotó en la ciudad o que no alcanza para lo que hay por entregar. «Ver quién
 * tiene» abre esa fila en la tabla; «Ver pedidos» va a la vista 35 (pedidos y transferencias), donde se pide lo que falta.
 */
export function AvisosDeStock({ avisos, alVerQuienTiene }: { avisos: AvisoDeStock[]; alVerQuienTiene: (aviso: AvisoDeStock) => void }) {
  if (avisos.length === 0) return null;
  const cuenta = avisos.length === 1 ? "1 aviso" : `${avisos.length} avisos`;
  return (
    <div className="flex flex-col gap-1.5">
      {/* La cuenta se ve arriba y la lee el lector como descripción de la lista: el alto tope esconde los que no entran. */}
      <p id={ID_CUENTA} aria-hidden="true" className="text-chico font-semibold text-tinta-suave">
        {cuenta}
      </p>
      <ul
        aria-label="Avisos de stock"
        aria-describedby={ID_CUENTA}
        tabIndex={0} // NOSONAR S6845: región con desplazamiento; sin tabIndex el teclado no la alcanza (WCAG 2.1.1)
        className="grid max-h-[148px] grid-cols-[repeat(auto-fit,minmax(380px,1fr))] gap-3 overflow-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
      >
      {avisos.map((aviso) => {
        const contexto = `${aviso.negrita}${aviso.nombraCiudad ? ` en ${aviso.ciudadNombre}` : ""}`;
        return (
          <li
            key={aviso.clave}
            className="flex min-h-[46px] min-w-0 items-center gap-2.5 rounded-tarjeta border border-borde bg-superficie py-1.5 pr-1.5 pl-3"
          >
            <span className="flex-none rounded-sm bg-marca-clara px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-marca-media">
              STOCK
            </span>
            <span className="min-w-0 flex-1 text-cuerpo wrap-anywhere text-tinta">
              <b className="font-semibold">{aviso.negrita}</b> {aviso.texto}
            </span>
            {aviso.boton === "Ver quién tiene" ? (
              <button type="button" aria-label={`Ver quién tiene ${contexto}`} onClick={() => alVerQuienTiene(aviso)} className={CLASE_BOTON}>
                {aviso.boton}
              </button>
            ) : (
              <Link href="/stock/pedidos" aria-label={`Ver pedidos de ${contexto}`} className={CLASE_BOTON}>
                {aviso.boton}
              </Link>
            )}
          </li>
        );
      })}
      </ul>
    </div>
  );
}
