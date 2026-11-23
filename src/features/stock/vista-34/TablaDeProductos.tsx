"use client";

import Link from "next/link";
import { Fragment } from "react";

import { hrefCuentasDe } from "@/features/cuentas/preseleccion";
import { cn } from "@/lib/utils";

import { formatearCantidad, type AjusteDeUnidad, type EstadoDeUnidad, type FilaDeUnidad, type GrupoDeFilas } from "./modelo";

const COLUMNAS = 8;

/** Ayuda del encabezado «POR COBRAR» (decisión del 28/10, nota del canvas 34): el número llega ya proporcional del servidor. */
const AYUDA_POR_COBRAR = "Unidades entregadas que todavía no se pagaron, en proporción al saldo de cada venta.";

const CLASES_ESTADO: Record<EstadoDeUnidad["tipo"], string> = {
  agotado: "bg-peligro-fondo text-peligro",
  faltan: "bg-alerta-fondo text-alerta",
  alcanza: "bg-exito-fondo text-exito",
};

function Cifra({ valor, negrita = false }: { valor: number; negrita?: boolean }) {
  return <span className={cn("font-mono", valor === 0 ? "text-tinta-suave" : "text-tinta", negrita && "font-semibold")}>{formatearCantidad(valor)}</span>;
}

/**
 * Los ajustes de stock que cargó la colportora de este producto (HU-STK-010, decisión de Cristian del 28/10, «Ajuste stock»):
 * cuánto entró o salió, por qué (la lista cerrada: «Stock inicial», «Libros dañados», «Conteo»), cuándo y quién lo cargó. Los
 * más nuevos primero; con muchos, la lista se desplaza dentro de su alto.
 */
function Ajustes({ ajustes, fila, nombreDelLugar }: { ajustes: AjusteDeUnidad[]; fila: FilaDeUnidad; nombreDelLugar: string }) {
  return (
    <div className="mt-2.5 flex flex-col gap-1">
      <p className="text-etiqueta font-semibold tracking-[0.06em] text-tinta-suave">AJUSTES DE STOCK</p>
      <ul
        aria-label={`Ajustes de stock de ${fila.nombre} en ${nombreDelLugar}`}
        tabIndex={0} // NOSONAR S6845: región con desplazamiento; sin tabIndex el teclado no la alcanza (WCAG 2.1.1)
        className="flex max-h-[132px] flex-col divide-y divide-borde overflow-auto border-t border-borde focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
      >
        {ajustes.map((a) => (
          <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5 text-chico">
            <span className="font-semibold wrap-anywhere text-tinta">{a.colportor}</span>
            {a.producto && <span className="wrap-anywhere text-tinta-2">· {a.producto}</span>}
            <span className={cn("font-semibold", a.entrada ? "text-exito" : "text-peligro")}>
              <span aria-hidden="true" className="mr-0.5 font-mono">
                {a.entrada ? "+" : "−"}
              </span>
              {a.entrada ? "Entrada" : "Salida"} de {formatearCantidad(a.unidades)}
            </span>
            <span className="text-tinta-2">· {a.motivo}</span>
            {a.cuandoTexto && <span className="text-tinta-suave">· {a.cuandoTexto}</span>}
            <span className="text-tinta-suave">· Lo cargó {a.cargadoPor}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Detalle({ fila, id, nombreDelLugar }: { fila: FilaDeUnidad; id: string; nombreDelLugar: string }) {
  return (
    <tr id={id}>
      <td colSpan={COLUMNAS} className="p-0">
        <div className="border-b border-borde bg-marca-clara/40 py-2.5 pr-[18px] pb-3 pl-[52px]">
          {fila.quien.length === 0 && fila.ajustes.length === 0 ? (
            <p className="text-chico text-tinta-suave">{fila.sinNadie}</p>
          ) : (
            <>
              {fila.quien.length === 0 ? (
                <p className="text-chico text-tinta-suave">{fila.sinNadie}</p>
              ) : (
            <table aria-label={`Quién tiene ${fila.nombre} en ${nombreDelLugar}`} className="w-full table-fixed border-collapse">
              <colgroup>
                <col className="w-[28%]" />
                <col />
                <col />
                <col />
                <col />
                <col />
                <col className="w-[148px]" />
              </colgroup>
              <thead>
                <tr className="text-etiqueta font-semibold tracking-[0.06em] text-tinta-suave">
                  <th scope="col" className="pb-1 text-left font-semibold">
                    QUIÉN LO TIENE O DEBE ENTREGARLO
                  </th>
                  <th scope="col" className="pb-1 text-right font-semibold">
                    TIENE
                  </th>
                  <th scope="col" className="pb-1 text-right font-semibold">
                    POR ENTREGAR
                  </th>
                  <th scope="col" className="pb-1 text-right font-semibold">
                    ENTREGADOS
                  </th>
                  <th scope="col" className="pb-1 text-right font-semibold">
                    DEVUELTOS
                  </th>
                  <th scope="col" title={AYUDA_POR_COBRAR} className="pb-1 text-right font-semibold">
                    POR COBRAR
                  </th>
                  <th scope="col" className="pb-1 text-right font-semibold">
                    <span className="sr-only">CUENTAS</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {fila.quien.map((q) => (
                  <tr key={q.id} className="min-h-[30px] border-t border-borde text-chico">
                    <th scope="row" className="py-1.5 pr-3 text-left font-semibold text-tinta">
                      <span className="block wrap-anywhere">{q.nombre}</span>
                      <span className={cn("block text-mini font-normal wrap-anywhere", q.sincronizoViejo ? "font-semibold text-peligro" : "text-tinta-suave")}>
                        {q.sincronizoViejo && <span aria-hidden="true">△ </span>}
                        {q.sincronizo}
                        {q.sincronizoViejo && <span className="sr-only"> (hace más de dos días)</span>}
                      </span>
                    </th>
                    <td className="py-1.5 text-right">
                      <Cifra valor={q.tiene} />
                    </td>
                    <td className="py-1.5 text-right">
                      <Cifra valor={q.porEntregar} />
                    </td>
                    <td className="py-1.5 text-right font-mono text-tinta">{formatearCantidad(q.entregados)}</td>
                    <td className="py-1.5 text-right">
                      <Cifra valor={q.devueltos} />
                    </td>
                    <td className="py-1.5 text-right font-mono text-tinta">{formatearCantidad(q.porCobrar)}</td>
                    <td className="py-1.5 text-right">
                      <Link
                        href={hrefCuentasDe(q.id)}
                        aria-label={`Ver en Cuentas la plata de ${q.nombre}`}
                        className="inline-flex min-h-8 items-center justify-end gap-1 text-chico font-semibold whitespace-nowrap text-marca-media hover:text-marca focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
                      >
                        Ver en Cuentas <span aria-hidden="true">→</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
              )}
              {fila.ajustes.length > 0 && <Ajustes ajustes={fila.ajustes} fila={fila} nombreDelLugar={nombreDelLugar} />}
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

/**
 * La tabla de la vista 34: una fila por producto (libros y material) o por categoría (revistas y misioneros). Cada fila se
 * abre para ver quién tiene el producto o debe entregarlo; se pueden abrir varias. El estado lleva un símbolo además del
 * color («⊘ Agotado», «△ Faltan», «✓ Alcanza»).
 */
export function TablaDeProductos({
  grupos,
  abiertas,
  nombreDelLugar,
  alAlternar,
}: {
  grupos: GrupoDeFilas[];
  abiertas: ReadonlySet<string>;
  nombreDelLugar: string;
  alAlternar: (clave: string) => void;
}) {
  return (
    <table aria-label={`Stock por producto en ${nombreDelLugar}`} className="w-full table-fixed border-collapse">
      <colgroup>
        <col className="w-[22%]" />
        <col className="w-[9%]" />
        <col className="w-[10%]" />
        <col className="w-[10%]" />
        <col className="w-[10%]" />
        <col className="w-[9%]" />
        <col className="w-[9%]" />
        <col />
      </colgroup>
      <thead className="sticky top-0 z-10 bg-superficie">
        <tr className="border-b border-borde text-etiqueta font-semibold tracking-[0.06em] text-tinta-suave">
          <th scope="col" className="px-[18px] py-[9px] text-left font-semibold">
            PRODUCTO
          </th>
          <th scope="col" className="px-2 py-[9px] text-right font-semibold">
            EN LA CIUDAD
          </th>
          <th scope="col" className="px-2 py-[9px] text-right font-semibold">
            EN MANOS DE
          </th>
          <th scope="col" className="px-2 py-[9px] text-right font-semibold">
            POR ENTREGAR
          </th>
          <th scope="col" className="px-2 py-[9px] text-right font-semibold">
            ENTREGADOS
          </th>
          <th scope="col" className="px-2 py-[9px] text-right font-semibold">
            DEVUELTOS
          </th>
          <th scope="col" title={AYUDA_POR_COBRAR} className="px-2 py-[9px] text-right font-semibold">
            POR COBRAR
          </th>
          <th scope="col" className="py-[9px] pr-[18px] pl-2 text-left font-semibold">
            ESTADO
          </th>
        </tr>
      </thead>
      <tbody>
        {grupos.map((grupo) => (
          <Fragment key={grupo.tipo}>
            <tr className="border-b border-borde bg-superficie-suave">
              <th scope="colgroup" colSpan={COLUMNAS} className="px-[18px] py-[7px] text-left font-normal">
                <span className="mr-2.5 text-chico font-bold text-marca">{grupo.titulo}</span>
                <span className="text-mini text-tinta-suave">{grupo.detalle}</span>
              </th>
            </tr>
            {grupo.filas.map((fila) => {
              const abierta = abiertas.has(fila.clave);
              const idDetalle = `detalle-${fila.clave.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
              return (
                <Fragment key={fila.clave}>
                  <tr
                    onClick={(evento) => {
                      // Todo el renglón abre el detalle con el mouse; el botón de adentro lo hace con teclado y lector de pantalla.
                      if ((evento.target as HTMLElement).closest("button")) return;
                      alAlternar(fila.clave);
                    }}
                    className={cn("min-h-[46px] cursor-pointer border-b border-borde-suave text-cuerpo", abierta && "bg-marca-clara/40")}
                  >
                    <th scope="row" className="px-[18px] py-1.5 text-left align-middle font-semibold text-tinta">
                      <button
                        type="button"
                        data-foco={`fila:${fila.clave}`}
                        aria-expanded={abierta}
                        aria-controls={abierta ? idDetalle : undefined}
                        onClick={() => alAlternar(fila.clave)}
                        className="flex min-h-8 w-full min-w-0 items-center gap-1.5 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
                      >
                        <span aria-hidden="true" className="flex-none">
                          {abierta ? "▾" : "▸"}
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="wrap-anywhere">{fila.nombre}</span>
                          {fila.nota && <span className="text-[10.5px] font-normal wrap-anywhere text-tinta-suave">{fila.nota}</span>}
                        </span>
                      </button>
                    </th>
                    <td className="px-2 py-1.5 text-right align-middle">
                      <Cifra valor={fila.tiene} negrita />
                    </td>
                    <td className={cn("px-2 py-1.5 text-right align-middle", fila.poseedores === 0 ? "text-tinta-suave" : "text-tinta")}>
                      {fila.poseedores > 0 ? `${fila.poseedores} de ${fila.totalPersonas}` : "nadie"}
                    </td>
                    <td className="px-2 py-1.5 text-right align-middle">
                      <Cifra valor={fila.porEntregar} />
                    </td>
                    <td className="px-2 py-1.5 text-right align-middle">
                      <Cifra valor={fila.entregados} />
                    </td>
                    <td className="px-2 py-1.5 text-right align-middle">
                      <Cifra valor={fila.devueltos} />
                    </td>
                    <td className="px-2 py-1.5 text-right align-middle">
                      <Cifra valor={fila.porCobrar} />
                    </td>
                    <td className="py-1.5 pr-[18px] pl-2 align-middle">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-pastilla px-2 py-[3px] text-[11.5px] font-semibold",
                          CLASES_ESTADO[fila.estado.tipo],
                        )}
                      >
                        <span aria-hidden="true">{fila.estado.simbolo}</span>
                        <span className="wrap-anywhere">{fila.estado.texto}</span>
                      </span>
                    </td>
                  </tr>
                  {abierta && <Detalle fila={fila} id={idDetalle} nombreDelLugar={nombreDelLugar} />}
                </Fragment>
              );
            })}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}
