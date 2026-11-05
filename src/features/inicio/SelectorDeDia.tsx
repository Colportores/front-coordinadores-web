import { rotuloDelDia, sumarDias } from "@/features/inicio/modelo";

const CLASE_FLECHA =
  "grid size-8 place-items-center text-nav text-tinta-2 focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none cursor-pointer hover:bg-marca-clara/50 aria-disabled:cursor-default aria-disabled:text-grafico-neutro aria-disabled:hover:bg-transparent";

/**
 * El control de día: «Hoy» y los anteriores (no hay días por venir). `hoy` es el día de Montevideo que contó el servidor, no
 * el del navegador. «›» en «Hoy» queda con `aria-disabled` (y no `disabled`) para no soltar el foco. Cada flecha parte del día que se eligió, no del que ya cargó, así dos toques seguidos avanzan dos días.
 */
export function SelectorDeDia({ dia, hoy, alElegir }: { dia: string; hoy: string; alElegir: (dia: string) => void }) {
  const rotulo = rotuloDelDia(dia, hoy);
  const esHoy = dia >= hoy;
  return (
    <div role="group" aria-label="Día" className="flex h-8 flex-none items-center rounded-control border border-borde bg-superficie">
      <button type="button" aria-label="Día anterior" title="Día anterior" onClick={() => alElegir(sumarDias(dia, -1))} className={`${CLASE_FLECHA} border-r border-borde`}>
        <span aria-hidden>‹</span>
      </button>
      <span aria-live="polite" className="px-3 text-cuerpo whitespace-nowrap">
        <b className="text-marca">{rotulo.fuerte}</b>
        {rotulo.resto && <span className="text-tinta-suave"> · {rotulo.resto}</span>}
      </span>
      <button type="button" aria-label="Día siguiente" title="Día siguiente" aria-disabled={esHoy} onClick={() => !esHoy && alElegir(sumarDias(dia, 1))} className={`${CLASE_FLECHA} border-l border-borde`}>
        <span aria-hidden>›</span>
      </button>
    </div>
  );
}
