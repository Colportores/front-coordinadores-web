"use client";

import type { ReactNode } from "react";

import type { CiudadDeCuentas } from "@/datos/cuentas";
import { plural, type ColumnaOrdenable, type FilaDeCuenta, type Orden } from "@/features/cuentas/modelo";
import { cn } from "@/lib/utils";

export interface ColumnaDeTabla {
  rotulo: string;
  derecha?: boolean;
  /** Si la cabecera ordena la tabla (la cifra más alta primero, la primera vez). */
  ordenable?: ColumnaOrdenable;
}

const TONOS = {
  exito: "bg-exito-fondo text-exito",
  alerta: "bg-alerta-fondo text-alerta",
  peligro: "bg-peligro-fondo text-peligro",
  marca: "bg-marca-clara text-marca-media",
} as const;

/** La pastilla de estado de una fila (✓ Pagado, ◔ Por validar…). El símbolo y el texto dicen lo mismo que el color. */
export function Pastilla({ tono, children }: { tono: keyof typeof TONOS; children: ReactNode }) {
  return (
    <span className={cn("inline-flex w-max items-center gap-[5px] rounded-pastilla px-2 py-[3px] text-mini font-semibold", TONOS[tono])}>
      {children}
    </span>
  );
}

export function EncabezadoDeTabla({
  nombre,
  columnas,
  plantilla,
  orden,
  alOrdenar,
}: {
  nombre: string;
  columnas: ColumnaDeTabla[];
  plantilla: string;
  orden?: Orden | null;
  alOrdenar?: (columna: ColumnaOrdenable) => void;
}) {
  return (
    <div
      role="row"
      className={cn(
        "sticky top-0 z-[1] grid gap-3 border-b border-borde bg-superficie px-[18px] py-[9px] text-etiqueta font-semibold tracking-[0.06em] text-tinta-suave",
        plantilla,
      )}
    >
      {columnas.map((columna, indice) => {
        const ordenable = columna.ordenable;
        const activa = ordenable !== undefined && orden?.columna === ordenable;
        return (
          <span
            key={`${columna.rotulo}-${indice}`}
            role="columnheader"
            aria-sort={ordenable ? (activa ? (orden?.sentido === "asc" ? "ascending" : "descending") : "none") : undefined}
            className={cn("min-w-0", columna.derecha && "text-right")}
          >
            {ordenable && alOrdenar ? (
              <button
                type="button"
                onClick={() => alOrdenar(ordenable)}
                aria-label={`Ordenar ${nombre} por ${columna.rotulo.toLowerCase()}`}
                className={cn(
                  "inline-flex min-h-6 max-w-full cursor-pointer items-center gap-1 rounded-sm px-0.5 whitespace-nowrap uppercase hover:text-tinta focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none",
                  columna.derecha && "flex-row-reverse",
                  activa && "text-tinta",
                )}
              >
                <span className="truncate">{columna.rotulo}</span>
                {activa && (
                  <span aria-hidden>{orden?.sentido === "asc" ? "▲" : "▼"}</span>
                )}
              </button>
            ) : (
              <span className="block truncate whitespace-nowrap">{columna.rotulo}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Una tabla por colportor (Casa editora y Alquiler): cabecera fija, una franja con el nombre de la ciudad cuando la selección
 * abarca más de una, y las cifras en JetBrains Mono. Las celdas las arma quien la usa.
 */
export function TablaDeFilas({
  nombre,
  columnas,
  plantilla,
  filas,
  conCiudades,
  orden,
  alOrdenar,
  celdas,
  textoVacio,
}: {
  nombre: string;
  columnas: ColumnaDeTabla[];
  /** Clase de Tailwind con las columnas (`grid-cols-[…]`). */
  plantilla: string;
  filas: FilaDeCuenta[];
  conCiudades: boolean;
  orden: Orden | null;
  alOrdenar: (columna: ColumnaOrdenable) => void;
  celdas: (fila: FilaDeCuenta) => ReactNode[];
  textoVacio: string;
}) {
  const grupos: Array<{ ciudad: CiudadDeCuentas; filas: FilaDeCuenta[] }> = [];
  for (const fila of filas) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.ciudad.id === fila.ciudad.id) ultimo.filas.push(fila);
    else grupos.push({ ciudad: fila.ciudad, filas: [fila] });
  }

  return (
    <div
      role="table"
      aria-label={nombre}
      className="flex min-h-[280px] flex-1 flex-col overflow-hidden rounded-tarjeta border border-borde bg-superficie"
    >
      <div className="min-h-0 flex-1 overflow-auto">
        <EncabezadoDeTabla nombre={nombre} columnas={columnas} plantilla={plantilla} orden={orden} alOrdenar={alOrdenar} />
        {filas.length === 0 ? (
          <div role="row">
            <span role="cell" className="block px-[18px] py-6 text-cuerpo text-tinta-suave">
              {textoVacio}
            </span>
          </div>
        ) : (
          grupos.map((grupo) => (
            <div key={grupo.ciudad.id} role="rowgroup">
              {conCiudades && (
                <div role="row" className="flex items-baseline gap-2.5 border-b border-borde bg-superficie-suave px-[18px] py-[7px]">
                  <span role="cell" className="text-chico font-bold text-marca">
                    {grupo.ciudad.nombre}
                  </span>
                  <span role="cell" className="text-mini text-tinta-suave">
                    {plural(grupo.filas.length, "colportor", "colportores")}
                  </span>
                </div>
              )}
              {grupo.filas.map((fila) => (
                <div
                  key={fila.colportor.id}
                  role="row"
                  className={cn("grid min-h-[46px] items-center gap-3 border-b border-borde-suave px-[18px] text-cuerpo", plantilla)}
                >
                  {celdas(fila).map((contenido, indice) => (
                    <span
                      key={indice}
                      role="cell"
                      className={cn("min-w-0 truncate", columnas[indice]?.derecha && "text-right")}
                    >
                      {contenido}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
