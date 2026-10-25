import Link from "next/link";

import type { AvisoDeStock } from "./modelo";

const CLASE_BOTON =
  "inline-flex min-h-8 flex-none items-center rounded-control border border-borde bg-superficie px-3 text-[11.5px] font-semibold whitespace-nowrap text-tinta-2 hover:bg-fondo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento";

/**
 * La franja de avisos: un producto que se agotó en la ciudad o que no alcanza para lo que hay por entregar. «Ver quién
 * tiene» abre esa fila en la tabla; «Ver pedidos» va a la vista 35 (pedidos y transferencias), donde se pide lo que falta.
 */
export function AvisosDeStock({ avisos, alVerQuienTiene }: { avisos: AvisoDeStock[]; alVerQuienTiene: (aviso: AvisoDeStock) => void }) {
  if (avisos.length === 0) return null;
  return (
    <ul aria-label="Avisos de stock" className="grid max-h-[148px] grid-cols-[repeat(auto-fit,minmax(380px,1fr))] gap-3 overflow-auto">
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
  );
}
