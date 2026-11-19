import { cn } from "@/lib/utils";

import type { ColumnaDeReporte, Tendencia } from "./calculo";
import { TendenciaDeCifra } from "./TendenciaDeCifra";

/** Una cifra de la tabla con su tendencia al lado. */
export interface CeldaDeTabla {
  clave: ColumnaDeReporte;
  /** La cifra ya formateada; «—» si no hay datos. */
  valor: string;
  /** La cifra sin formato (para exportar); `null` si no hay datos. */
  crudo: number | null;
  sinDatos: boolean;
  tendencia: Tendencia | null;
}

export type FilaDeTabla =
  | { tipo: "grupo"; clave: string; nombre: string; detalle: string }
  | {
      tipo: "fila";
      clave: string;
      nombre: string;
      /** Segunda línea: «en curso», «sin datos desde el 17/10». */
      nota: string | null;
      enCurso: boolean;
      /** Una por columna, en el mismo orden. */
      celdas: CeldaDeTabla[];
    };

/** Ancho mínimo de cada columna de cifras y de la primera, en píxeles: la tabla se desplaza hacia el costado antes de apretarlas. */
const ANCHO_DE_CIFRA = 160;
const ANCHO_MINIMO_PRIMERA_COLUMNA = 240;
/**
 * La primera columna (colportor o período) se queda con esta parte del ancho y las cifras se reparten el resto por igual (#188):
 * antes ella tomaba todo lo que sobraba y las cifras quedaban corridas a la derecha.
 */
const PARTE_DE_LA_PRIMERA_COLUMNA = "24%";
/** Las cifras con las que la flecha va en verde (alza) o rojo (baja); las demás columnas la dejan sin color. */
const COLUMNAS_CON_COLOR: ReadonlySet<ColumnaDeReporte> = new Set(["horas", "presentaciones", "ventas", "monto"]);
/** Lo que ocupa la tendencia al lado de la cifra: el encabezado reserva el mismo lugar para quedar justo sobre el número. */
const CLASE_DE_TENDENCIA = "min-w-[46px]";

/**
 * La tabla del reporte: una fila por colportor (agrupados por ciudad si el ámbito tiene varias) o, con un colportor
 * elegido, una fila por período. Cada cifra trae su tendencia al lado.
 */
export function TablaDeReporte({
  descripcion,
  primeraColumna,
  columnas,
  filas,
  mensajeVacio,
}: {
  /** Nombre accesible de la tabla. */
  descripcion: string;
  primeraColumna: string;
  columnas: { clave: ColumnaDeReporte; encabezado: string }[];
  filas: FilaDeTabla[];
  mensajeVacio: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-tarjeta border border-borde bg-superficie">
      {/* Con el desplazamiento horizontal el área tiene que poder alcanzarse con el teclado y decir qué es. */}
      <div
        tabIndex={0} // NOSONAR S6845: región con desplazamiento; sin tabIndex el teclado no la alcanza (WCAG 2.1.1)
        role="region"
        aria-label={descripcion}
        className="min-h-0 flex-1 overflow-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-acento"
      >
        <table
          aria-label={descripcion}
          className="w-full table-fixed border-collapse"
          style={{ minWidth: ANCHO_MINIMO_PRIMERA_COLUMNA + ANCHO_DE_CIFRA * columnas.length }}
        >
          <colgroup>
            <col style={{ width: PARTE_DE_LA_PRIMERA_COLUMNA }} />
            {columnas.map((columna) => (
              <col key={columna.clave} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10 bg-superficie-suave">
            <tr className="border-b border-borde text-etiqueta font-semibold tracking-[0.06em] text-tinta-2">
              <th scope="col" className="px-[18px] py-[9px] text-left font-semibold">
                {primeraColumna}
              </th>
              {columnas.map((columna) => (
                <th key={columna.clave} scope="col" className="border-l border-borde-suave px-3 py-[9px] text-right font-semibold">
                  {/* Misma estructura que la celda (cifra + lugar de la tendencia): el encabezado queda justo sobre el número. */}
                  <span className="flex items-baseline justify-end gap-2">
                    <span className="min-w-0 wrap-anywhere">{columna.encabezado}</span>
                    <span aria-hidden="true" className={CLASE_DE_TENDENCIA} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr>
                <td colSpan={columnas.length + 1} className="px-[18px] py-6 text-nav text-tinta-suave">
                  {mensajeVacio}
                </td>
              </tr>
            )}
            {filas.map((fila) =>
              fila.tipo === "grupo" ? (
                <tr key={fila.clave} className="border-b border-borde bg-superficie-suave">
                  <th scope="rowgroup" colSpan={columnas.length + 1} className="px-[18px] py-[7px] text-left">
                    <span className="mr-2.5 text-chico font-bold text-marca">{fila.nombre}</span>
                    <span className="text-mini font-normal text-tinta-suave">{fila.detalle}</span>
                  </th>
                </tr>
              ) : (
                <tr
                  key={fila.clave}
                  className={cn("min-h-10 border-b border-borde-suave text-cuerpo hover:bg-marca-clara/40", fila.enCurso && "bg-marca-clara/40")}
                >
                  <th scope="row" className="min-w-0 px-[18px] py-1.5 text-left font-normal">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-semibold text-tinta" title={fila.nombre}>
                        {fila.nombre}
                      </span>
                      {fila.nota && <span className="truncate font-mono text-[10.5px] text-tinta-suave">{fila.nota}</span>}
                    </span>
                  </th>
                  {fila.celdas.map((celda) => (
                    <td key={celda.clave} className="border-l border-borde-suave px-3 py-1.5">
                      <span className="flex items-baseline justify-end gap-2 whitespace-nowrap">
                        <span className={cn("font-mono", celda.sinDatos ? "text-tinta-suave" : "text-tinta")}>
                          {celda.valor}
                          {celda.sinDatos && <span className="sr-only"> sin datos</span>}
                        </span>
                        <span className={cn(CLASE_DE_TENDENCIA, "text-right font-mono text-[10.5px] text-tinta-2")}>
                          <TendenciaDeCifra tendencia={celda.tendencia} conColor={COLUMNAS_CON_COLOR.has(celda.clave)} />
                        </span>
                      </span>
                    </td>
                  ))}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
