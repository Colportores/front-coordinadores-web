import { claveDe, jornadaTexto, horasTexto, type ElementoDeLista, type Seleccion } from "@/features/inicio/modelo";
import { cn } from "@/lib/utils";

const CLASE_ALTERNAR =
  "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-control border border-borde bg-superficie text-nav text-marca-media hover:bg-marca-clara/50 focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none";

/** El botón ««» / «»» de las columnas de los extremos. */
export function BotonAlternar({
  etiqueta,
  simbolo,
  foco,
  expandido,
  controla,
  onClick,
  className,
}: {
  etiqueta: string;
  simbolo: string;
  foco: string;
  expandido: boolean;
  controla: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={etiqueta}
      aria-label={etiqueta}
      aria-expanded={expandido}
      aria-controls={controla}
      data-foco={foco}
      onClick={onClick}
      className={cn(CLASE_ALTERNAR, className)}
    >
      <span aria-hidden>{simbolo}</span>
    </button>
  );
}

/**
 * La lista de ciudades agrupada por departamento: es el filtro y, a la vez, el resumen del día de cada una. Queda siempre
 * a la vista con sus cifras.
 */
export function ListaDeCiudades({
  elementos,
  seleccionada,
  alElegir,
  alContraer,
}: {
  elementos: ElementoDeLista[];
  seleccionada: Seleccion;
  alElegir: (seleccion: Seleccion) => void;
  alContraer: () => void;
}) {
  const clave = claveDe(seleccionada);
  return (
    <section id="columna-ciudades" aria-labelledby="titulo-ciudades" className="flex min-h-0 min-w-0 flex-col border-r border-borde bg-superficie">
      <div className="flex items-center justify-between py-3 pr-3 pl-[18px]">
        <h2 id="titulo-ciudades" className="font-serif text-titulo font-semibold">
          Ciudades
        </h2>
        <BotonAlternar
          etiqueta="Contraer ciudades"
          simbolo="«"
          foco="alternar-ciudades"
          expandido
          controla="columna-ciudades"
          onClick={alContraer}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto px-2.5 pb-3.5">
        {elementos.map((elemento) =>
          elemento.tipo === "grupo" ? (
            <p key={elemento.clave} className="px-2 pt-3.5 pb-1.5 font-mono text-etiqueta tracking-[0.14em] text-tinta-suave">
              {elemento.etiqueta}
            </p>
          ) : (
            <button
              key={elemento.clave}
              type="button"
              aria-pressed={elemento.clave === clave}
              onClick={() => alElegir(elemento.seleccion)}
              className={cn(
                "flex cursor-pointer flex-col gap-[7px] rounded-control px-3 py-[11px] text-left focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none",
                elemento.clave === clave ? "bg-marca-clara shadow-[inset_3px_0_0_var(--marca-media)]" : "hover:bg-superficie-calida",
              )}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 text-nav font-semibold [overflow-wrap:anywhere]">{elemento.nombre}</span>{" "}
                <span className="shrink-0 text-mini text-tinta-suave">{jornadaTexto(elemento.resumen)}</span>
              </span>
              <span className="grid grid-cols-[1fr_1.2fr_1fr] gap-1.5">
                <Cifra valor={horasTexto(elemento.resumen.horas)} rotulo="Horas" />{" "}
                <Cifra valor={String(elemento.resumen.presentaciones)} rotulo="Presentaciones" />{" "}
                <Cifra valor={String(elemento.resumen.ventas)} rotulo="Ventas" />
              </span>
            </button>
          ),
        )}
      </div>
    </section>
  );
}

function Cifra({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <span className="flex flex-col gap-px">
      <span className="font-mono text-nav font-medium">{valor}</span>{" "}
      <span className="text-[9.5px] font-semibold tracking-[0.06em] text-tinta-suave uppercase">{rotulo}</span>
    </span>
  );
}

/** La columna de ciudades colapsada: una barra con la sigla de cada ciudad y cuántos están en jornada. Sigue siendo el filtro. */
export function BarraDeCiudades({
  elementos,
  seleccionada,
  alElegir,
  alExpandir,
}: {
  elementos: ElementoDeLista[];
  seleccionada: Seleccion;
  alElegir: (seleccion: Seleccion) => void;
  alExpandir: () => void;
}) {
  const clave = claveDe(seleccionada);
  return (
    <section id="columna-ciudades" aria-label="Ciudades" className="flex min-h-0 flex-col items-center gap-1.5 overflow-auto border-r border-borde bg-superficie py-3">
      <BotonAlternar
        etiqueta="Expandir ciudades"
        simbolo="»"
        foco="alternar-ciudades"
        expandido={false}
        controla="columna-ciudades"
        onClick={alExpandir}
        className="mb-1.5"
      />
      {elementos.map((elemento) =>
        elemento.tipo === "grupo" ? (
          <span key={elemento.clave} aria-hidden className="my-1.5 h-px w-7 bg-borde" />
        ) : (
          <button
            key={elemento.clave}
            type="button"
            title={elemento.nombre}
            aria-label={`${elemento.nombre}: ${jornadaTexto(elemento.resumen)}`}
            aria-pressed={elemento.clave === clave}
            onClick={() => alElegir(elemento.seleccion)}
            className={cn(
              "flex min-h-11 w-[52px] shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-control focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none",
              elemento.clave === clave ? "bg-marca-clara shadow-[inset_3px_0_0_var(--marca-media)]" : "hover:bg-superficie-calida",
            )}
          >
            <span aria-hidden className="text-[11.5px] font-semibold">
              {elemento.sigla}
            </span>
            <span aria-hidden className="font-mono text-etiqueta text-tinta-suave">
              {elemento.resumen.enJornada}/{elemento.resumen.colportores}
            </span>
          </button>
        ),
      )}
    </section>
  );
}
