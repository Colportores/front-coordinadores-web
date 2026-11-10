import { cn } from "@/lib/utils";

const PESTANAS = ["Casa editora", "Alquiler", "Tickets"] as const;
const ANCHOS_DE_BARRA = ["w-[88%]", "w-[72%]", "w-[80%]", "w-[64%]"] as const;

/**
 * Mientras se traen las cuentas (41B·04): el marco de la vista (la columna de ciudades, el título y las pestañas, con
 * «Alquiler» activa) y unas barras grises en el lugar de la tabla. Las pestañas y las ciudades son dibujo, no controles: todavía
 * no se sabe qué ciudades tiene la campaña. El texto «Cargando las cuentas…» es lo que anuncia el lector de pantalla.
 */
export function EsqueletoDeCuentas() {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)]">
      <div aria-hidden className="flex min-h-0 flex-col gap-2.5 border-r border-borde bg-superficie px-[18px] py-3">
        <span className="font-serif text-titulo font-semibold">Ciudades</span>
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-9 animate-pulse rounded-control bg-superficie-suave motion-reduce:animate-none" />
        ))}
      </div>
      <div className="flex min-h-0 min-w-0 flex-col gap-3 overflow-auto px-[22px] pt-[18px] pb-5">
        <h2 className="font-serif text-[22px] font-semibold">Cuentas</h2>
        <div aria-hidden className="flex flex-wrap gap-1.5">
          {PESTANAS.map((rotulo) => (
            <span
              key={rotulo}
              className={cn(
                "inline-flex min-h-8 items-center rounded-pastilla border px-3.5 text-chico font-semibold whitespace-nowrap",
                rotulo === "Alquiler" ? "border-marca bg-marca text-superficie" : "border-borde bg-superficie text-tinta-2",
              )}
            >
              {rotulo}
            </span>
          ))}
        </div>
        <p role="status" className="text-nav text-tinta-suave">
          Cargando las cuentas…
        </p>
        <div aria-busy="true" className="flex flex-col gap-4 rounded-tarjeta border border-borde bg-superficie px-[18px] py-4">
          {ANCHOS_DE_BARRA.map((ancho) => (
            <span key={ancho} aria-hidden className={cn("h-4 animate-pulse rounded-sm bg-superficie-suave motion-reduce:animate-none", ancho)} />
          ))}
        </div>
      </div>
    </div>
  );
}
