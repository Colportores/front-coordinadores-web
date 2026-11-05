"use client";

import type { KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

import { NombreDeItem } from "./NombreDeItem";
import { ColumnasDePrecios, CLASE_DE_ENCABEZADO, TituloDeGrupo } from "./TablaGeneral";
import { agruparFilas, TEXTO_DE_ACCION, TEXTO_DE_ESTADO, type FilaDeCiudad, type TonoDeEstado } from "./modelo";

const CLASES_DE_ESTADO: Record<TonoDeEstado, string> = {
  excepcion: "bg-marca-clara text-marca-media",
  modificado: "bg-alerta-fondo text-alerta",
  invalido: "bg-peligro-fondo text-peligro",
  "sin-excepcion": "bg-alerta-fondo text-alerta",
  "no-se-ofrece": "bg-peligro-fondo text-peligro",
};

export interface AccionesDeFila {
  agregar: (clave: string, sugerido: number | null) => void;
  escribir: (clave: string, texto: string) => void;
  quitar: (clave: string) => void;
  revertir: (clave: string) => void;
  soltar: (clave: string) => void;
}

function FilaDelPrecio({ fila, ciudad, acciones }: { fila: FilaDeCiudad; ciudad: string; acciones: AccionesDeFila }) {
  const { item } = fila;
  const idDelError = `error-precio-${item.clave}`;

  function alTeclear(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === "Escape") {
      // Esc descarta el valor de la celda y no sale de ningún otro lado.
      evento.preventDefault();
      evento.stopPropagation();
      acciones.revertir(item.clave);
    } else if (evento.key === "Enter") {
      evento.preventDefault();
      acciones.soltar(item.clave);
    }
  }

  const fondo =
    fila.resaltada === "invalida" ? "bg-peligro-fondo/40" : fila.resaltada === "modificada" || fila.resaltada === "quitada" ? "bg-superficie-calida" : "bg-superficie";
  const barra = fila.resaltada === "modificada" || fila.resaltada === "quitada" ? "shadow-[inset_3px_0_0_var(--alerta-punto)]" : "";

  return (
    <>
      <tr className={cn("border-t border-borde-suave align-middle", fondo, barra)}>
        <th scope="row" className="px-3 py-2.5 text-left font-normal">
          <NombreDeItem item={item} />
        </th>
        <td className="px-3 py-2.5 font-mono text-chico wrap-anywhere text-tinta-suave">{item.codigo ?? "—"}</td>
        <td
          className={cn(
            "px-3 py-2.5 text-right text-cuerpo",
            fila.generalSinPrecio ? "font-semibold text-peligro" : fila.generalAtenuado ? "text-tinta-suave" : "text-tinta",
          )}
        >
          {fila.general}
        </td>
        <td className="px-3 py-2.5 text-right">
          {fila.campo.tipo === "entrada" ? (
            <span
              className={cn(
                "inline-flex min-h-8 w-full max-w-36 items-center justify-end gap-1 rounded-control bg-superficie px-2 focus-within:ring-[3px] focus-within:ring-acento/50",
                fila.campo.invalido ? "border-[1.5px] border-peligro" : fila.campo.marcado ? "border-[1.5px] border-marca-media" : "border border-grafico-neutro",
              )}
            >
              <span aria-hidden className="text-chico text-tinta-suave">
                $U
              </span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                data-precio={item.clave}
                aria-label={`Precio de ${item.nombre} en ${ciudad}`}
                aria-invalid={fila.campo.invalido || undefined}
                aria-describedby={fila.error ? idDelError : undefined}
                value={fila.campo.valor}
                onChange={(e) => acciones.escribir(item.clave, e.target.value)}
                onBlur={() => acciones.soltar(item.clave)}
                onKeyDown={alTeclear}
                className={cn(
                  "min-w-0 flex-1 bg-transparent py-1 text-right font-serif text-titulo font-semibold outline-none",
                  fila.campo.invalido ? "text-peligro" : "text-tinta",
                )}
              />
            </span>
          ) : (
            <span
              className={cn(
                "inline-flex min-h-8 w-full max-w-36 items-center justify-end rounded-control border border-dashed border-grafico-neutro px-2 text-cuerpo",
                fila.campo.texto === "—" ? "border-transparent" : "",
                "text-tinta-suave",
              )}
            >
              {fila.campo.texto}
            </span>
          )}
        </td>
        <td
          className={cn(
            "px-3 py-2.5 text-right text-chico",
            fila.diferencia ? (fila.diferencia.sube ? "text-exito" : "text-peligro") : "text-tinta-suave",
          )}
        >
          {fila.diferencia ? fila.diferencia.texto : ""}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {fila.estado && (
              <span className={cn("rounded-pastilla px-[7px] py-px text-mini font-semibold whitespace-nowrap", CLASES_DE_ESTADO[fila.estado])}>
                {TEXTO_DE_ESTADO[fila.estado]}
              </span>
            )}
            {fila.accion && (
              <button
                type="button"
                data-accion={item.clave}
                aria-label={`${TEXTO_DE_ACCION[fila.accion]}: ${item.nombre}`}
                onClick={() => {
                  if (fila.accion === "agregar") acciones.agregar(item.clave, item.precioGeneral);
                  else if (fila.accion === "quitar") acciones.quitar(item.clave);
                  else acciones.revertir(item.clave);
                }}
                className="inline-flex min-h-6 cursor-pointer items-center rounded-control px-1 text-chico font-semibold text-marca-media hover:text-marca focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none"
              >
                {TEXTO_DE_ACCION[fila.accion]}
              </button>
            )}
          </div>
        </td>
      </tr>
      {fila.error && (
        <tr className={fondo}>
          <td colSpan={6} className="px-3 pb-2">
            <div id={idDelError} role="alert" className="text-chico text-peligro">
              {fila.error}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** La pestaña de una ciudad (27G·02 a 27G·10): cada fila usa el general o lleva su excepción, editable en la misma tabla. */
export function TablaDeCiudad({ filas, ciudad, acciones }: { filas: FilaDeCiudad[]; ciudad: string; acciones: AccionesDeFila }) {
  return (
    <table className="w-full table-fixed border-collapse">
      <caption className="sr-only">Precio de cada producto y colección en {ciudad}: el general o su excepción</caption>
      <ColumnasDePrecios />
      <thead>
        <tr className="text-left">
          <th scope="col" className={CLASE_DE_ENCABEZADO}>
            PRODUCTO O COLECCIÓN
          </th>
          <th scope="col" className={CLASE_DE_ENCABEZADO}>
            CÓDIGO
          </th>
          <th scope="col" className={cn(CLASE_DE_ENCABEZADO, "text-right")}>
            GENERAL
          </th>
          <th scope="col" className={cn(CLASE_DE_ENCABEZADO, "text-right")}>
            PRECIO EN {ciudad.toLocaleUpperCase("es")}
          </th>
          <th scope="col" className={cn(CLASE_DE_ENCABEZADO, "text-right")}>
            DIFERENCIA
          </th>
          <th scope="col" className={CLASE_DE_ENCABEZADO}>
            <span className="sr-only">Estado y acciones</span>
          </th>
        </tr>
      </thead>
      {agruparFilas(filas).map((grupo) => (
        <tbody key={grupo.titulo}>
          <TituloDeGrupo texto={grupo.titulo} />
          {grupo.filas.map((fila) => (
            <FilaDelPrecio key={fila.item.clave} fila={fila} ciudad={ciudad} acciones={acciones} />
          ))}
        </tbody>
      ))}
    </table>
  );
}
