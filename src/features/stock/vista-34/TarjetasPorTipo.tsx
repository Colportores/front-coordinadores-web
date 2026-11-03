import { formatearCantidad, type TarjetaDeTipo } from "./modelo";

/** Las cuatro tarjetas de arriba: unidades en la ciudad por tipo de producto y cómo está cada tipo. */
export function TarjetasPorTipo({ tarjetas }: { tarjetas: TarjetaDeTipo[] }) {
  return (
    <ul aria-label="Resumen por tipo" className="grid grid-cols-4 gap-3.5">
      {tarjetas.map((t) => (
        <li key={t.tipo} className="flex min-w-0 flex-col gap-0.5 rounded-tarjeta border border-borde bg-superficie px-4 py-3">
          <span className="text-etiqueta font-semibold tracking-etiqueta text-tinta-suave">{t.etiqueta.toLocaleUpperCase("es")}</span>
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span className="font-serif text-[26px] font-semibold text-marca">{formatearCantidad(t.total)}</span>
            <span className="text-[11.5px] text-tinta-2">{t.extra}</span>
          </span>
          <span className="text-mini wrap-anywhere text-tinta-suave">{t.detalle}</span>
        </li>
      ))}
    </ul>
  );
}
