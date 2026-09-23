import { AccionNoDisponible } from "@/components/AccionNoDisponible";
import { Badge } from "@/components/ui/badge";
import type { ListaTicketsPorValidar, TicketPorValidar } from "@/datos/cuentas";
import { ChipHu } from "@/dev/ChipHu";
import { formatMonto } from "@/features/cuentas/formato";

/**
 * Tarjeta "Tickets por validar": tickets cargados por colportores, con
 * acciones de validar / rechazar / revisar sin comportamiento (sus diálogos
 * se definen al conectar la HU). HU-COB-008.
 *
 * El ticket con foto de comprobante (depósito bancario) lleva además el chip
 * de HU-CTA-006 ("cargar comprobante de depósito bancario"): es el mismo
 * dato mostrándose desde dos historias distintas, así que se marca sin
 * envolverlo de nuevo (ver docs/PESTANAS.md, `ChipHu`).
 */
export function TicketsPorValidar({ lista }: { lista: ListaTicketsPorValidar }) {
  const { tickets, totalPendientes } = lista;

  return (
    <div className="flex flex-col overflow-hidden rounded-tarjeta border border-borde bg-superficie">
      <div className="flex items-baseline justify-between border-b border-borde px-4 pt-[14px] pb-[10px]">
        <span className="font-serif text-titulo font-semibold text-tinta">Tickets por validar</span>
        {tickets.length > 0 && totalPendientes > 0 && (
          <Badge className="bg-alerta-fondo font-semibold text-alerta">{totalPendientes}</Badge>
        )}
      </div>

      <div className="flex flex-col gap-2.5 px-4 py-3">
        {tickets.length === 0 ? (
          <p className="text-cuerpo text-tinta-suave">No hay tickets pendientes de validar.</p>
        ) : (
          <>
            {tickets.map((ticket) => (
              <TarjetaTicket key={ticket.id} ticket={ticket} />
            ))}
            {totalPendientes > tickets.length && (
              <AccionNoDisponible className="px-px py-0.5 text-left text-mini font-semibold text-marca-media">
                Ver los {totalPendientes} tickets →
              </AccionNoDisponible>
            )}
          </>
        )}
      </div>

      <div className="border-t border-borde bg-superficie-suave px-4 py-3 text-mini leading-relaxed text-tinta-2">
        Al validar un ticket se acredita el depósito y baja la deuda del colportor. Las fotos se guardan máx. 4 meses.
      </div>
    </div>
  );
}

function TarjetaTicket({ ticket }: { ticket: TicketPorValidar }) {
  const partesDetalle = [ticket.medioDetalle, ticket.fecha];
  if (ticket.recibo) {
    partesDetalle.push(`recibo ${ticket.recibo}`);
  } else if (!ticket.tieneFoto) {
    partesDetalle.push("sin foto");
  }
  const detalle = partesDetalle.join(" · ");

  return (
    <div className="relative flex flex-col gap-1.5 rounded-control border border-borde px-3 py-[11px]">
      {ticket.tieneFoto && <ChipHu hu="HU-CTA-006" className="absolute -top-2.5 right-2 z-10" />}
      <div className="flex justify-between text-cuerpo">
        <span className="font-semibold text-tinta">{ticket.colportor}</span>
        <span className="font-mono text-tinta">{formatMonto(ticket.monto)}</span>
      </div>

      {ticket.tieneFoto && (
        <div className="grid h-[74px] place-items-center rounded-sm bg-superficie-mapa font-mono text-mini text-tinta-tenue">
          [ foto ticket depósito ]
        </div>
      )}

      <div className="text-mini text-tinta-suave">{detalle}</div>

      <div className="mt-0.5 flex gap-2">
        {ticket.tieneFoto ? (
          <>
            <AccionNoDisponible size="sm" className="bg-exito text-superficie hover:bg-exito/90">
              ✓ Validar
            </AccionNoDisponible>
            <AccionNoDisponible size="sm" variant="outline" className="text-peligro hover:text-peligro">
              Rechazar
            </AccionNoDisponible>
          </>
        ) : (
          <AccionNoDisponible size="sm" variant="outline" className="text-tinta-2">
            Revisar
          </AccionNoDisponible>
        )}
      </div>
    </div>
  );
}
