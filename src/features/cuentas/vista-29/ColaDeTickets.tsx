"use client";

import type { ItemPorValidar } from "@/datos/cuentas/validar";
import { textoFechaDeTicket } from "@/datos/cuentas/fechas";
import { Pastilla } from "@/features/cuentas/TablaDeFilas";
import { formatMonto } from "@/features/cuentas/formato";
import { cn } from "@/lib/utils";

import { detalleDeMedio, etiquetaDeEstado, textoDeMedio } from "./modelo";

const PLANTILLA = "grid-cols-[72px_minmax(0,1.3fr)_minmax(0,1.5fr)_96px_124px]";

/**
 * La cola (29 A·01, con las columnas de 36R): fecha, colportor, medio, monto y estado. La fila abierta queda marcada y cada
 * fila es un botón que la abre al costado; ↑ ↓ cambian de fila (lo maneja la vista). El rechazado muestra su motivo sin
 * abrirlo (36R·04).
 */
export function ColaDeTickets({
  cola,
  abierto,
  ahoraIso,
  alElegir,
}: {
  cola: readonly ItemPorValidar[];
  abierto: string | null;
  ahoraIso: string;
  alElegir: (id: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-tarjeta border border-borde bg-superficie">
      <div aria-hidden="true" className={cn("grid gap-3 border-b border-borde px-4 py-2 text-etiqueta font-semibold tracking-etiqueta text-tinta-suave", PLANTILLA)}>
        <span>FECHA</span>
        <span>COLPORTOR</span>
        <span>MEDIO</span>
        <span className="text-right">MONTO</span>
        <span>ESTADO</span>
      </div>
      <ul aria-label="Tickets y retiros" className="m-0 min-h-0 flex-1 list-none overflow-auto p-0">
        {cola.map((item) => {
          const elegido = item.id === abierto;
          const estado = etiquetaDeEstado(item);
          const fecha = textoFechaDeTicket(item.fecha, ahoraIso);
          const sub = [item.ciudad, item.esVos ? "vos" : null].filter(Boolean).join(" · ");
          const detalle = detalleDeMedio(item);
          const motivo = item.estado === "RECHAZADO" ? item.motivoRechazo : undefined;
          return (
            <li key={item.id} className="border-b border-borde-suave">
              <button
                type="button"
                data-foco={`fila:${item.id}`}
                aria-current={elegido ? "true" : undefined}
                aria-label={[fecha, item.colportorNombre + (item.esVos ? " (vos)" : ""), textoDeMedio(item), formatMonto(item.monto), estado.texto.slice(2), motivo ? `Motivo: ${motivo}` : null]
                  .filter(Boolean)
                  .join(", ")}
                onClick={() => alElegir(item.id)}
                className={cn(
                  "flex w-full cursor-pointer flex-col gap-1 px-4 py-2 text-left text-cuerpo hover:bg-marca-clara focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-marca-media",
                  elegido && "bg-marca-clara shadow-[inset_3px_0_0_var(--marca-media)]",
                )}
              >
                <span aria-hidden="true" className={cn("grid min-h-9 w-full items-center gap-3", PLANTILLA)}>
                  <span className="truncate font-mono">{fecha}</span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold" title={item.colportorNombre}>
                      {elegido ? "▸ " : ""}
                      {item.colportorNombre}
                    </span>
                    {sub && <span className="truncate text-[10.5px] text-tinta-suave">{sub}</span>}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{textoDeMedio(item)}</span>
                    {detalle && <span className="truncate text-[10.5px] text-tinta-suave">{detalle}</span>}
                  </span>
                  <span className="text-right font-mono whitespace-nowrap">{formatMonto(item.monto)}</span>
                  <span>
                    <Pastilla tono={estado.tono}>{estado.texto}</Pastilla>
                  </span>
                </span>
                {motivo && (
                  <span aria-hidden="true" className="line-clamp-2 pl-[84px] text-[11.5px] wrap-anywhere text-peligro">
                    Motivo: {motivo}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
