"use client";

import { Fragment } from "react";

import { cn } from "@/lib/utils";

import { formatearCantidad, type EstadoDeUnidad, type FilaDeUnidad, type GrupoDeFilas } from "./modelo";

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

function Detalle({ fila, id, nombreDelLugar }: { fila: FilaDeUnidad; id: string; nombreDelLugar: string }) {
  return (
    <tr id={id}>
      <td colSpan={COLUMNAS} className="p-0">
        <div className="border-b border-borde bg-marca-clara/40 py-2.5 pr-[18px] pb-3 pl-[52px]">
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
                </tr>
              </thead>
              <tbody>
                {fila.quien.map((q) => (
                  <tr key={q.id} className="min-h-[30px] border-t border-borde text-chico">
                    <th scope="row" className="py-1.5 pr-3 text-left font-semibold text-tinta">
                      <span className="block wrap-anywhere">{q.nombre}</span>
                      <span className="block text-mini font-normal wrap-anywhere text-tinta-suave">{q.sincronizo}</span>
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
                  </tr>
                ))}
              </tbody>
            </table>
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
