"use client";

import { AccionNoDisponible } from "@/components/AccionNoDisponible";
import { EncabezadoDeTabla, Pastilla, type ColumnaDeTabla } from "@/features/cuentas/TablaDeFilas";
import { formatMonto } from "@/features/cuentas/formato";
import {
  fechaDeTicket,
  textoDeDestino,
  textoDeEstado,
  textoDeMedio,
  textoDeNumero,
  type FilaDeTicket,
} from "@/features/cuentas/modelo";
import { cn } from "@/lib/utils";

const PLANTILLA = "grid-cols-[minmax(0,.6fr)_minmax(0,1.3fr)_minmax(0,1.6fr)_minmax(0,.9fr)_minmax(0,.9fr)_minmax(0,1fr)_96px]";
const PLANTILLA_DETALLE = "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)]";

const COLUMNAS: ColumnaDeTabla[] = [
  { rotulo: "FECHA" },
  { rotulo: "COLPORTOR" },
  { rotulo: "MEDIO" },
  { rotulo: "PARA QUÉ" },
  { rotulo: "MONTO", derecha: true },
  { rotulo: "ESTADO" },
  { rotulo: "" },
];

function EstadoDelTicket({ fila }: { fila: FilaDeTicket }) {
  const { ticket } = fila;
  if (ticket.estado === "PENDIENTE") return <Pastilla tono="alerta">◔ Por validar</Pastilla>;
  if (ticket.estado === "RECHAZADO") return <Pastilla tono="peligro">✕ Rechazado</Pastilla>;
  return <Pastilla tono="exito">✓ Validado</Pastilla>;
}

/**
 * El historial de tickets de la selección: foto, fecha, número, medio, destino, monto y estado. Cada fila se abre para ver el
 * detalle. Validar y rechazar se resuelven en «Validar tickets» (vista 29, issue #69): acá se ve el historial.
 */
export function TablaDeTickets({
  filas,
  ahoraIso,
  conCiudades,
  abiertos,
  alAlternar,
  textoVacio,
}: {
  filas: FilaDeTicket[];
  ahoraIso: string;
  conCiudades: boolean;
  abiertos: ReadonlySet<string>;
  alAlternar: (ticketId: string) => void;
  textoVacio: string;
}) {
  return (
    <div role="table" aria-label="Tickets" className="flex min-h-[280px] flex-1 flex-col overflow-hidden rounded-tarjeta border border-borde bg-superficie">
      <div className="min-h-0 flex-1 overflow-auto">
        <EncabezadoDeTabla nombre="tickets" columnas={COLUMNAS} plantilla={PLANTILLA} />
        {filas.length === 0 ? (
          <div role="row">
            <span role="cell" className="block px-[18px] py-6 text-cuerpo text-tinta-suave">
              {textoVacio}
            </span>
          </div>
        ) : (
          filas.map((fila) => {
            const { ticket, colportor, ciudad } = fila;
            const abierto = abiertos.has(ticket.id);
            const numero = textoDeNumero(ticket);
            return (
              <div key={ticket.id} role="rowgroup">
                <div
                  role="row"
                  className={cn(
                    "grid min-h-[46px] items-center gap-3 border-b border-borde-suave px-[18px] text-cuerpo",
                    PLANTILLA,
                    abierto && "bg-marca-clara/40",
                  )}
                >
                  <span role="cell" className="min-w-0 truncate font-mono">
                    {fechaDeTicket(ticket, ahoraIso)}
                  </span>
                  <span role="cell" className="flex min-w-0 flex-col">
                    <button
                      type="button"
                      aria-expanded={abierto}
                      aria-controls={`detalle-${ticket.id}`}
                      onClick={() => alAlternar(ticket.id)}
                      className="flex min-h-6 min-w-0 cursor-pointer items-baseline gap-1 rounded-sm text-left font-semibold focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none"
                    >
                      <span aria-hidden>{abierto ? "▾" : "▸"}</span>
                      <span className="truncate">{colportor.nombre}</span>
                    </button>
                    {conCiudades && <span className="truncate pl-3.5 text-[10.5px] text-tinta-suave">{ciudad.nombre}</span>}
                  </span>
                  <span role="cell" className="flex min-w-0 flex-col">
                    <span className="truncate">{textoDeMedio(ticket)}</span>
                    {numero && <span className="truncate text-[10.5px] text-tinta-suave">{numero}</span>}
                  </span>
                  <span role="cell" className="min-w-0 truncate">
                    {textoDeDestino(ticket.destino)}
                  </span>
                  <span role="cell" className="min-w-0 truncate text-right font-mono">
                    {formatMonto(ticket.monto)}
                  </span>
                  <span role="cell" className="flex min-w-0 flex-col items-start gap-0.5">
                    <EstadoDelTicket fila={fila} />
                    {ticket.estado === "RECHAZADO" && ticket.motivoRechazo && (
                      <span className="max-w-full truncate text-[10.5px] text-peligro" title={ticket.motivoRechazo}>
                        {ticket.motivoRechazo}
                      </span>
                    )}
                  </span>
                  <span role="cell" className="flex justify-end">
                    {ticket.estado === "PENDIENTE" && (
                      <AccionNoDisponible
                        aria-label={`Validar el ticket de ${colportor.nombre}`}
                        className="inline-flex min-h-8 items-center rounded-control border border-marca bg-marca px-3 text-[11.5px] font-semibold text-superficie"
                      >
                        Validar
                      </AccionNoDisponible>
                    )}
                  </span>
                </div>
                {abierto && (
                  <div
                    id={`detalle-${ticket.id}`}
                    role="row"
                    aria-label={`Detalle del ticket de ${colportor.nombre}`}
                    className="flex flex-col gap-1 border-b border-borde bg-marca-clara/30 py-2.5 pr-[18px] pl-[52px]"
                  >
                    <div role="cell" className="flex flex-col gap-1">
                      <div className={cn("grid gap-3 pb-1 text-etiqueta font-semibold tracking-[0.06em] text-tinta-suave", PLANTILLA_DETALLE)}>
                        <span>FOTO</span>
                        <span>FECHA</span>
                        <span>N° DE AUTORIZACIÓN</span>
                        <span>MEDIO</span>
                        <span>PARA QUÉ</span>
                      </div>
                      <div className={cn("grid min-h-[30px] items-center gap-3 border-t border-borde text-chico", PLANTILLA_DETALLE)}>
                        {ticket.tieneFoto ? (
                          <span className="flex items-center gap-1.5 text-marca-media">
                            <span className="font-mono text-tinta-suave">[ foto del ticket ]</span>
                            <AccionNoDisponible
                              aria-label={`Ver la foto del ticket de ${colportor.nombre}`}
                              className="inline-flex min-h-6 items-center rounded-sm px-1 font-semibold text-marca-media"
                            >
                              Ver
                            </AccionNoDisponible>
                          </span>
                        ) : (
                          <span className="text-tinta-suave">sin foto (retiro)</span>
                        )}
                        <span className="font-mono">{fechaDeTicket(ticket, ahoraIso)}</span>
                        <span className="truncate font-mono">{numero || "—"}</span>
                        <span className="truncate">{textoDeMedio(ticket)}</span>
                        <span className="truncate">{textoDeDestino(ticket.destino)}</span>
                      </div>
                      {ticket.estado === "RECHAZADO" && (
                        <p className="text-chico font-semibold text-peligro">{textoDeEstado(ticket)}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
