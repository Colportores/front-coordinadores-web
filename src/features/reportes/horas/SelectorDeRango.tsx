"use client";

import type { LimitesDelRango } from "./rango";

const CLASES_DEL_CAMPO =
  "min-h-8 rounded-control border border-grafico-neutro bg-superficie px-2.5 text-chico text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento aria-invalid:border-peligro";

/**
 * Los dos campos de fecha del rango libre (issue #107, «Rango horas»): «Desde» y «Hasta», con los límites de la campaña
 * como mínimo y máximo del selector del navegador. Lo que se escribe se guarda tal cual: si no sirve (vacío, al revés,
 * fuera de la campaña) la vista lo dice (`idDelAviso`) en vez de corregirlo sin avisar.
 */
export function SelectorDeRango({
  desde,
  hasta,
  limites,
  hayProblema,
  idDelAviso,
  alCambiar,
}: {
  desde: string;
  hasta: string;
  limites: LimitesDelRango;
  hayProblema: boolean;
  /** El elemento que explica el problema: los campos lo citan como descripción. */
  idDelAviso: string;
  alCambiar: (cambio: { desde?: string; hasta?: string }) => void;
}) {
  return (
    <div role="group" aria-label="Rango de fechas" className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-etiqueta font-semibold tracking-etiqueta text-tinta-suave">DESDE</span>
        <input
          type="date"
          value={desde}
          min={limites.primero}
          max={limites.ultimo}
          aria-invalid={hayProblema || undefined}
          aria-describedby={hayProblema ? idDelAviso : undefined}
          onChange={(e) => alCambiar({ desde: e.target.value })}
          className={CLASES_DEL_CAMPO}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-etiqueta font-semibold tracking-etiqueta text-tinta-suave">HASTA</span>
        <input
          type="date"
          value={hasta}
          min={limites.primero}
          max={limites.ultimo}
          aria-invalid={hayProblema || undefined}
          aria-describedby={hayProblema ? idDelAviso : undefined}
          onChange={(e) => alCambiar({ hasta: e.target.value })}
          className={CLASES_DEL_CAMPO}
        />
      </label>
    </div>
  );
}
