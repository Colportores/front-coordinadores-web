import type { TicketDeCuentas } from "@/datos/cuentas";
import {
  estadoDelCobro,
  notaDeAnulacionDisponible,
  notaDeCobroAnulado,
  notaFueraDePlazo,
  NOTA_SIN_CONEXION,
  TEXTO_ANULAR_COBRO,
  textoDeCobroRegistrado,
  textoDeCuandoSeAnulo,
  textoDeMotivo,
  textoDeQuienAnulo,
} from "@/features/cuentas/anular-cobro";
import { cn } from "@/lib/utils";

/** Lo que la tabla de tickets necesita para ofrecer «Anular cobro» (vista 39). */
export interface AnularDesdeLaTabla {
  enLinea: boolean;
  /** Tickets cuyo plazo el servidor ya dio por vencido (39B·02), aunque el reloj de la página todavía no lo diga. */
  vencidos: ReadonlySet<string>;
  /** Hay una escritura en camino: la segunda no se ofrece (39A·05). */
  ocupado: boolean;
  alAnular: (ticketId: string) => void;
}

const PLANTILLA_DEL_COBRO = "grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)]";

/**
 * Lo que va debajo del detalle de un ticket con cobro (vista 39): si el cobro está anulado, cuándo, por qué y quién (39A·06,
 * 39A·07); si no, «Anular cobro» con lo que dice el plazo (39A·01), apagado y con su razón si pasaron las 72 h (39B·01) o no hay
 * conexión (39B·04). Un ticket sin cobro (un depósito) no muestra nada.
 */
export function DetalleDelCobro({
  ticket,
  nombre,
  ahoraIso,
  anular,
}: {
  ticket: TicketDeCuentas;
  nombre: string;
  ahoraIso: string;
  anular: AnularDesdeLaTabla;
}) {
  const cobro = ticket.cobro;
  const estado = estadoDelCobro(ticket, ahoraIso, anular.enLinea, anular.vencidos.has(ticket.id));
  if (!cobro || estado === "sin-cobro") return null;

  if (cobro.anulado) {
    const a = cobro.anulado;
    return (
      <div className="flex flex-col gap-1">
        <div className={cn("grid gap-3 pb-1 text-etiqueta font-semibold tracking-[0.06em] text-tinta-suave", PLANTILLA_DEL_COBRO)}>
          <span>COBRO REGISTRADO</span>
          <span>MOTIVO</span>
          <span>ANULADO POR</span>
          <span>CUÁNDO</span>
        </div>
        <div className={cn("grid min-h-[30px] items-center gap-3 border-t border-borde text-chico", PLANTILLA_DEL_COBRO)}>
          <span className="font-mono">{textoDeCobroRegistrado(ticket)}</span>
          <span className="font-semibold [overflow-wrap:anywhere]">{textoDeMotivo(a.motivo, a.detalle)}</span>
          <span className="[overflow-wrap:anywhere]">{textoDeQuienAnulo(a.por, a.origen)}</span>
          <span className="font-mono">{textoDeCuandoSeAnulo(a.en)}</span>
        </div>
        <p className="border-t border-borde pt-2 text-chico font-semibold text-peligro">{notaDeCobroAnulado(nombre)}</p>
      </div>
    );
  }

  const apagado = estado !== "disponible" || anular.ocupado;
  const nota =
    estado === "fuera-de-plazo"
      ? notaFueraDePlazo(cobro.fecha)
      : estado === "sin-conexion"
        ? NOTA_SIN_CONEXION
        : notaDeAnulacionDisponible(cobro.fecha);
  const idDeNota = `nota-cobro-${ticket.id}`;
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-borde pt-2.5">
      <button
        type="button"
        data-foco={`anular-${ticket.id}`}
        aria-disabled={apagado}
        aria-describedby={idDeNota}
        aria-label={`${TEXTO_ANULAR_COBRO} de ${nombre}`}
        onClick={() => {
          if (!apagado) anular.alAnular(ticket.id);
        }}
        className={cn(
          "inline-flex min-h-8 cursor-pointer items-center rounded-control border border-peligro bg-superficie px-3 text-[11.5px] font-semibold whitespace-nowrap text-peligro focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none",
          apagado && "cursor-not-allowed border-borde text-tinta-tenue",
        )}
      >
        {TEXTO_ANULAR_COBRO}
      </button>
      <p id={idDeNota} className={cn("min-w-0 flex-1 text-[12px] leading-[1.45] text-pretty [overflow-wrap:anywhere]", estado === "disponible" ? "text-tinta-suave" : "text-peligro")}>
        {nota}
      </p>
    </div>
  );
}
