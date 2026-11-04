/**
 * Mientras se traen los precios (27G·06): el texto «Cargando precios…» y unas barras en el lugar de las filas. Las pestañas no
 * se dibujan porque todavía no se sabe qué ciudades tiene la campaña.
 */
export function EsqueletoDePrecios() {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-0.5">
        <span className="font-serif text-[22px] font-semibold text-tinta">Precios de venta</span>
      </div>
      <div role="status" className="flex flex-col gap-2.5 rounded-tarjeta border border-borde bg-superficie px-[18px] py-4">
        <span className="text-nav text-tinta-suave">Cargando precios…</span>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} aria-hidden className="h-9 animate-pulse rounded-control bg-superficie-suave motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  );
}
