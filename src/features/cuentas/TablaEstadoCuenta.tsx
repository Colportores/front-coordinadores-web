import type { FilaEstadoCuenta, UltimoDeposito } from "@/datos/cuentas";
import { formatMonto } from "@/features/cuentas/formato";
import { cn } from "@/lib/utils";

const COLUMNAS = "grid-cols-[1.7fr_1.1fr_1.1fr_1.1fr_1.1fr_1.2fr]";

/**
 * Tabla de estado de cuenta del equipo: deuda, depositado, en mano, por
 * cobrar y último depósito (con alertas de atraso o ticket pendiente).
 * HU-CTA-005.
 */
export function TablaEstadoCuenta({ filas }: { filas: FilaEstadoCuenta[] }) {
  return (
    <div role="table" aria-label="Estado de cuenta del equipo" className="overflow-hidden rounded-tarjeta border border-borde bg-superficie">
      <div
        role="row"
        className={cn(
          "grid gap-2 border-b border-borde px-[18px] py-[10px] text-etiqueta font-semibold tracking-etiqueta text-tinta-suave",
          COLUMNAS,
        )}
      >
        <span role="columnheader">Colportor</span>
        <span role="columnheader">Deuda</span>
        <span role="columnheader">Depositado</span>
        <span role="columnheader">En mano</span>
        <span role="columnheader">Por cobrar</span>
        <span role="columnheader">Últ. depósito</span>
      </div>

      {filas.length === 0 ? (
        <p className="px-[18px] py-6 text-cuerpo text-tinta-suave">Ningún colportor tiene estado de cuenta todavía.</p>
      ) : (
        filas.map((fila, indice) => (
          <div
            key={fila.id}
            role="row"
            className={cn(
              "grid items-center gap-2 px-[18px] py-3 text-cuerpo",
              COLUMNAS,
              indice < filas.length - 1 && "border-b border-borde-suave",
              fila.ultimoDeposito.alerta === "atraso" && "bg-superficie-calida",
            )}
          >
            <span role="cell" className="font-semibold text-tinta">
              {fila.colportor}
            </span>
            <span role="cell" className="font-mono text-peligro">
              {formatMonto(fila.deuda)}
            </span>
            <span role="cell" className="font-mono text-tinta">
              {formatMonto(fila.depositado)}
            </span>
            <span role="cell" className="font-mono text-tinta">
              {formatMonto(fila.enMano)}
            </span>
            <span role="cell" className="font-mono text-tinta">
              {formatMonto(fila.porCobrar)}
            </span>
            <span role="cell">
              <UltimoDepositoTexto ultimoDeposito={fila.ultimoDeposito} />
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function UltimoDepositoTexto({ ultimoDeposito }: { ultimoDeposito: UltimoDeposito }) {
  if (ultimoDeposito.alerta === "ticket-pendiente") {
    return <span className="font-semibold text-alerta">ticket pend.</span>;
  }
  if (ultimoDeposito.alerta === "atraso") {
    return <span className="font-semibold text-peligro">⚠ {ultimoDeposito.fecha}</span>;
  }
  return <span className="text-tinta-suave">{ultimoDeposito.fecha}</span>;
}
