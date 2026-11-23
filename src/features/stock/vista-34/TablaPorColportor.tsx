import Link from "next/link";

import { hrefCuentasDe } from "@/features/cuentas/preseleccion";
import { cn } from "@/lib/utils";

import { LineaDeSincronizacion } from "./LineaDeSincronizacion";
import { formatearCantidad, type FilaDeColportor } from "./modelo";

/**
 * La tabla del retoque 42B·01: una fila por colportor con lo que tiene de cada tipo, cuándo sincronizó (en rojo pasados dos
 * días) y «Ver en Cuentas →». La plata no está acá: es de Cuentas.
 */
export function TablaPorColportor({ filas, nombreDelLugar }: { filas: FilaDeColportor[]; nombreDelLugar: string }) {
  const tipos = filas[0]?.porTipo ?? [];
  return (
    <table aria-label={`Stock por colportor en ${nombreDelLugar}`} className="w-full table-fixed border-collapse">
      <colgroup>
        <col className="w-[34%]" />
        {tipos.map((t) => (
          <col key={t.tipo} />
        ))}
        <col className="w-[160px]" />
      </colgroup>
      <thead className="sticky top-0 z-10 bg-superficie">
        <tr className="border-b border-borde text-etiqueta font-semibold tracking-[0.06em] text-tinta-suave">
          <th scope="col" className="px-[18px] py-[9px] text-left font-semibold">
            COLPORTOR
          </th>
          {tipos.map((t) => (
            <th key={t.tipo} scope="col" className="px-2 py-[9px] text-right font-semibold">
              {t.etiqueta.toLocaleUpperCase("es")}
            </th>
          ))}
          <th scope="col" className="py-[9px] pr-[18px] pl-2 text-right font-semibold">
            <span className="sr-only">CUENTAS</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.id} className="min-h-[46px] border-b border-borde-suave text-cuerpo">
            <th scope="row" className="px-[18px] py-1.5 text-left align-middle font-semibold text-tinta">
              <span className="block wrap-anywhere">{f.nombre}</span>
              <LineaDeSincronizacion texto={f.sincronizo} vieja={f.sincronizoViejo} />
            </th>
            {f.porTipo.map((t) => (
              <td key={t.tipo} className="px-2 py-1.5 text-right align-middle">
                <span className={cn("font-mono", t.tiene === 0 ? "text-tinta-suave" : "text-tinta")}>{formatearCantidad(t.tiene)}</span>
              </td>
            ))}
            <td className="py-1.5 pr-[18px] pl-2 text-right align-middle">
              <Link
                href={hrefCuentasDe(f.id)}
                aria-label={`Ver en Cuentas la plata de ${f.nombre}`}
                className="inline-flex min-h-8 items-center justify-end gap-1 text-chico font-semibold whitespace-nowrap text-marca-media hover:text-marca focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
              >
                Ver en Cuentas <span aria-hidden="true">→</span>
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
