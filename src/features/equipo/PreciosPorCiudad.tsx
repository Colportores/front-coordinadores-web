import { AccionNoDisponible } from "@/components/AccionNoDisponible";
import type { PreciosDeCiudad } from "@/datos/equipo/contrato";

/** Precio de cada producto frente al precio base, por ciudad de la campaña. */
export function PreciosPorCiudad({ ciudades }: { ciudades: PreciosDeCiudad[] }) {
  return (
    <div className="overflow-hidden rounded-tarjeta border border-borde bg-superficie">
      <div className="flex items-baseline justify-between border-b border-borde px-4 pt-[14px] pb-2.5">
        <span className="font-serif text-titulo font-semibold text-tinta">Precios por ciudad</span>
        {/* El formulario para editar precios todavía no está diseñado: queda sin comportamiento. */}
        <AccionNoDisponible className="text-mini font-semibold text-marca-media hover:underline">
          Editar
        </AccionNoDisponible>
      </div>
      {ciudades.length === 0 ? (
        <p className="px-4 py-4 text-chico text-tinta-suave">No hay precios configurados para esta campaña.</p>
      ) : (
        <div className="flex flex-col gap-1 px-4 pt-2 pb-3">
          {ciudades.map((ciudad) => (
            <section key={ciudad.ciudadId} aria-label={`Precios de ${ciudad.ciudadNombre}`} className="flex flex-col">
              <h3 className="pt-2 text-etiqueta font-semibold tracking-etiqueta text-tinta-suave">
                {ciudad.ciudadNombre}
              </h3>
              {ciudad.productos.length === 0 ? (
                <p className="py-2 text-mini text-tinta-suave">No hay precios configurados para esta ciudad.</p>
              ) : (
                ciudad.productos.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between border-b border-borde-suave py-[9px] last:border-b-0"
                  >
                    <div className="flex flex-col">
                      <span className="text-cuerpo font-semibold text-tinta">{p.producto}</span>
                      <span className="text-mini text-tinta-tenue">base {p.precioBase}</span>
                    </div>
                    <span className="font-mono text-cuerpo text-tinta">{p.precioCiudad}</span>
                  </div>
                ))
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
