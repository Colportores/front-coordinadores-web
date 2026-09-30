import type { CiudadDeCampania, ColportorDeCiudad } from "@/datos/ciudades/contrato";

function Colportores({ colportores, vacio }: { colportores: ColportorDeCiudad[]; vacio: string }) {
  if (colportores.length === 0) return <p className="text-mini text-tinta-suave">{vacio}</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {colportores.map((c) => (
        <li key={c.id} className="rounded-pastilla border border-borde px-2.5 py-[3px] text-mini text-tinta-2">
          {c.nombre}
        </li>
      ))}
    </ul>
  );
}

/** Vista mínima de solo lectura: cada ciudad de la campaña con sus zonas y sus colportores. */
export function ListaCiudades({ ciudades }: { ciudades: CiudadDeCampania[] }) {
  if (ciudades.length === 0) {
    return (
      <p className="rounded-tarjeta border border-borde bg-superficie px-4 py-6 text-center text-chico text-tinta-suave">
        Todavía no hay ciudades en esta campaña.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 items-start gap-4">
      {ciudades.map((ciudad) => (
        <section
          key={ciudad.id}
          aria-label={`Ciudad ${ciudad.nombre}`}
          className="overflow-hidden rounded-tarjeta border border-borde bg-superficie"
        >
          <h2 className="border-b border-borde px-4 pt-[14px] pb-2.5 font-serif text-titulo font-semibold text-tinta">
            {ciudad.nombre}
          </h2>
          <div className="flex flex-col gap-3 px-4 py-3">
            {ciudad.zonas.length === 0 ? (
              <p className="text-mini text-tinta-suave">Esta ciudad todavía no tiene zonas.</p>
            ) : (
              ciudad.zonas.map((zona) => (
                <div key={zona.id} className="flex flex-col gap-1.5">
                  <span className="text-cuerpo font-semibold text-tinta">
                    {zona.nombre} · {zona.colportores.length}
                  </span>
                  <Colportores colportores={zona.colportores} vacio="Sin colportores en esta zona." />
                </div>
              ))
            )}
            <div className="flex flex-col gap-1.5 border-t border-borde-suave pt-3">
              <span className="text-cuerpo font-semibold text-tinta">Sin asignar · {ciudad.sinAsignar.length}</span>
              <Colportores colportores={ciudad.sinAsignar} vacio="Todos los colportores tienen zona." />
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
