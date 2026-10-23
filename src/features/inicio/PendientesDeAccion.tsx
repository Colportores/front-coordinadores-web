import Link from "next/link";

import { AccionNoDisponible } from "@/components/AccionNoDisponible";
import { pestanaVisible } from "@/config/flags";
import { BotonAlternar } from "@/features/inicio/ListaDeCiudades";
import type { AccionDeTarjeta, TarjetaPendiente } from "@/features/inicio/modelo";
import { cn } from "@/lib/utils";

const CLASE_ACCION = "inline-flex min-h-8 items-center rounded-control border px-3 text-[11.5px] font-semibold";
const CLASE_PRIMARIA = "border-marca bg-marca text-superficie";
const CLASE_PELIGRO = "border-borde bg-superficie text-peligro";

function Accion({ accion }: { accion: AccionDeTarjeta }) {
  const clases = cn(CLASE_ACCION, accion.tono === "primaria" ? CLASE_PRIMARIA : CLASE_PELIGRO);
  // Sin formulario diseñado (autorizar, rechazar) o con la pestaña apagada: el botón se ve atenuado y no hace nada.
  if (accion.destino && pestanaVisible(accion.destino.pestana)) {
    return (
      <Link href={accion.destino.href} className={cn(clases, "focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none")}>
        {accion.texto}
      </Link>
    );
  }
  return <AccionNoDisponible className={clases}>{accion.texto}</AccionNoDisponible>;
}

/**
 * «Pendientes de acción» de la ciudad elegida: lo que espera a la coordinadora en otras pestañas, en forma compacta y con
 * su acción. Quién no inició la jornada no va acá: se ve en la tabla.
 */
export function PendientesDeAccion({
  tarjetas,
  vacio,
  alContraer,
}: {
  tarjetas: TarjetaPendiente[];
  vacio: string;
  alContraer: () => void;
}) {
  return (
    <section
      id="columna-pendientes"
      aria-labelledby="titulo-pendientes"
      className="flex max-h-full min-h-0 flex-col self-start overflow-hidden rounded-tarjeta border border-borde bg-superficie"
    >
      <div className="flex items-center justify-between gap-2 border-b border-borde py-[9px] pr-2.5 pl-4">
        <h2 id="titulo-pendientes" className="font-serif text-titulo font-semibold">
          Pendientes de acción
        </h2>
        <BotonAlternar
          etiqueta="Contraer pendientes"
          simbolo="»"
          foco="alternar-pendientes"
          expandido
          controla="columna-pendientes"
          onClick={alContraer}
        />
      </div>
      <div className="flex flex-col gap-2.5 overflow-auto px-3.5 py-3">
        {tarjetas.map((tarjeta) => (
          <article key={tarjeta.id} className="flex flex-col gap-1.5 rounded-control border border-borde px-3 py-2.5">
            <div className="flex items-start gap-2">
              <span className="mt-px shrink-0 rounded-sm bg-marca-clara px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-marca-media">
                {tarjeta.etiqueta}
              </span>
              <h3 className="text-cuerpo font-semibold [overflow-wrap:anywhere] text-pretty">{tarjeta.titulo}</h3>
            </div>
            {tarjeta.detalle && <p className="text-[11.5px] text-tinta-suave [overflow-wrap:anywhere] text-pretty">{tarjeta.detalle}</p>}
            {tarjeta.personas && (
              <ul className="flex flex-col">
                {tarjeta.personas.map((persona) => (
                  <li key={persona.id} className="flex justify-between gap-2 border-b border-borde-suave py-1 text-[11.5px]">
                    <b className="font-semibold [overflow-wrap:anywhere]">{persona.nombre}</b>
                    <span className="shrink-0 text-tinta-2">{persona.cuando}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {tarjeta.acciones.map((accion) => (
                <Accion key={accion.texto} accion={accion} />
              ))}
            </div>
          </article>
        ))}
        {tarjetas.length === 0 && <p className="text-chico text-tinta-suave">{vacio}</p>}
      </div>
    </section>
  );
}

/** Los pendientes colapsados: una barra con la cantidad. */
export function BarraDePendientes({ cantidad, alExpandir }: { cantidad: number; alExpandir: () => void }) {
  return (
    <section
      id="columna-pendientes"
      aria-label="Pendientes de acción"
      className="flex flex-col items-center gap-2.5 self-start rounded-tarjeta border border-borde bg-superficie pt-[9px] pb-3.5"
    >
      <BotonAlternar
        etiqueta="Expandir pendientes"
        simbolo="«"
        foco="alternar-pendientes"
        expandido={false}
        controla="columna-pendientes"
        onClick={alExpandir}
      />
      <span className="grid h-[22px] min-w-[22px] place-items-center rounded-pastilla bg-marca px-1.5 font-mono text-mini text-superficie">
        {cantidad}
        <span className="sr-only"> {cantidad === 1 ? "pendiente" : "pendientes"}</span>
      </span>
      <span aria-hidden className="text-mini font-semibold tracking-[0.14em] text-tinta-2 [transform:rotate(180deg)] [writing-mode:vertical-rl]">
        PENDIENTES DE ACCIÓN
      </span>
    </section>
  );
}
