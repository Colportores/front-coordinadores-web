import { cn } from "@/lib/utils";

import type { Tendencia } from "./calculo";
import { TendenciaDeCifra } from "./TendenciaDeCifra";

export type FilaDeTabla =
  | { tipo: "grupo"; clave: string; nombre: string; detalle: string }
  | {
      tipo: "fila";
      clave: string;
      nombre: string;
      /** Segunda línea: «en curso», «sin datos desde el 17/10». */
      nota: string | null;
      /** La cifra ya formateada; «—» si no hay datos. */
      valor: string;
      sinDatos: boolean;
      enCurso: boolean;
      tendencia: Tendencia | null;
    };

/**
 * La tabla del reporte: una fila por colportor (agrupados por ciudad si el ámbito tiene varias) o, con un colportor
 * elegido, una fila por período. Cada cifra trae su tendencia al lado. Hoy tiene una sola columna, HORAS; las demás
 * cifras de la vista 32 son de otras HU.
 */
export function TablaDeHoras({
  descripcion,
  primeraColumna,
  columna,
  filas,
  mensajeVacio,
}: {
  /** Nombre accesible de la tabla. */
  descripcion: string;
  primeraColumna: string;
  columna: string;
  filas: FilaDeTabla[];
  mensajeVacio: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-tarjeta border border-borde bg-superficie">
      <div className="min-h-0 flex-1 overflow-auto">
        <table aria-label={descripcion} className="w-full table-fixed border-collapse">
          <colgroup>
            <col />
            <col className="w-[38%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-superficie">
            <tr className="border-b border-borde text-etiqueta font-semibold tracking-[0.06em] text-tinta-suave">
              <th scope="col" className="px-[18px] py-[9px] text-left font-semibold">
                {primeraColumna}
              </th>
              <th scope="col" className="px-[18px] py-[9px] text-right font-semibold">
                {columna}
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr>
                <td colSpan={2} className="px-[18px] py-6 text-nav text-tinta-suave">
                  {mensajeVacio}
                </td>
              </tr>
            )}
            {filas.map((fila) =>
              fila.tipo === "grupo" ? (
                <tr key={fila.clave} className="border-b border-borde bg-superficie-suave">
                  <th scope="rowgroup" colSpan={2} className="px-[18px] py-[7px] text-left">
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
                  <td className="px-[18px] py-1.5">
                    <span className="flex items-baseline justify-end gap-2 whitespace-nowrap">
                      <span className={cn("font-mono", fila.sinDatos ? "text-tinta-suave" : "text-tinta")}>
                        {fila.valor}
                        {fila.sinDatos && <span className="sr-only"> sin datos</span>}
                      </span>
                      <span className="min-w-[46px] text-right font-mono text-[10.5px] text-tinta-2">
                        <TendenciaDeCifra tendencia={fila.tendencia} />
                      </span>
                    </span>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
