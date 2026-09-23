import { AccionNoDisponible } from "@/components/AccionNoDisponible";
import type { PrecioProductoZona } from "@/datos/equipo/contrato";

/** Precio base de cada producto contra el precio configurado para la zona. */
export function PreciosPorZona({ productos }: { productos: PrecioProductoZona[] }) {
  return (
    <div className="overflow-hidden rounded-tarjeta border border-borde bg-superficie">
      <div className="flex items-baseline justify-between border-b border-borde px-4 pt-[14px] pb-2.5">
        <span className="font-serif text-titulo font-semibold text-tinta">Precios por zona</span>
        {/* El formulario para editar precios todavía no está diseñado: queda sin comportamiento. */}
        <AccionNoDisponible className="text-mini font-semibold text-marca-media hover:underline">
          Editar
        </AccionNoDisponible>
      </div>
      {productos.length === 0 ? (
        <p className="px-4 py-4 text-chico text-tinta-suave">No hay precios configurados para esta zona.</p>
      ) : (
        <div className="flex flex-col px-4 pt-2 pb-3">
          {productos.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between border-b border-borde-suave py-[9px] last:border-b-0"
            >
              <div className="flex flex-col">
                <span className="text-cuerpo font-semibold text-tinta">{p.producto}</span>
                <span className="text-mini text-tinta-tenue">base {p.precioBase}</span>
              </div>
              <span className="font-mono text-cuerpo text-tinta">{p.precioZona}</span>
            </div>
          ))}
        </div>
      )}
      <div className="border-t border-borde bg-superficie-suave px-4 py-3 text-[11.5px] leading-relaxed text-tinta-2">
        El precio de venta se define por zona dentro de la campaña y se distribuye por delta-sync a los dispositivos.
      </div>
    </div>
  );
}
