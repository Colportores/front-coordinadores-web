/**
 * Tarjeta "Exportar": informe PDF y datos CSV. Sin diálogo diseñado todavía,
 * así que quedan como botones sin comportamiento (pendiente: ver el
 * comentario dejado en el issue #8).
 */
export function ExportarReportes() {
  return (
    <div className="flex flex-col gap-2.5 rounded-tarjeta border border-borde bg-superficie px-[18px] py-4">
      <span className="font-serif text-titulo font-semibold text-tinta">Exportar</span>
      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 rounded-control bg-marca py-[9px] text-center text-chico font-semibold text-superficie"
        >
          Informe PDF
        </button>
        <button
          type="button"
          className="flex-1 rounded-control border border-grafico-neutro py-[9px] text-center text-chico font-semibold text-marca"
        >
          Datos CSV
        </button>
      </div>
    </div>
  );
}
