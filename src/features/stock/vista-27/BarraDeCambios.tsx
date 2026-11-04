"use client";

import type { RefObject } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { textoDeAplicacion, textoDeCambios, textoDeCorregir } from "./modelo";

export const TEXTO_SALIR_CON_CAMBIOS = "Tenés cambios sin guardar. Guardalos o descartalos para poder salir.";

/**
 * La barra de abajo (27G·03, 04, 08, 09 y 10): cuántos cambios hay sin guardar en la ciudad, «Descartar» y «Guardar cambios»
 * (o «Reintentar» si falló). Y, encima, el aviso de que se guardó (27G·10). El botón de guardar se frena con un precio inválido,
 * sin conexión o mientras otro guardado está en camino.
 */
export function BarraDeCambios({
  ciudad,
  cambios,
  invalidos,
  guardando,
  reintentar,
  sinConexion,
  errorAlGuardar,
  intentoDeSalir,
  aviso,
  botonDeGuardar,
  alGuardar,
  alDescartar,
}: {
  ciudad: string;
  cambios: number;
  invalidos: number;
  guardando: boolean;
  reintentar: boolean;
  sinConexion: boolean;
  errorAlGuardar: boolean;
  intentoDeSalir: boolean;
  /** «Guardamos 2 precios de Montevideo. Valen para las ventas nuevas.» después de guardar. */
  aviso: string | null;
  botonDeGuardar: RefObject<HTMLButtonElement | null>;
  alGuardar: () => void;
  alDescartar: () => void;
}) {
  const frenado = invalidos > 0 || sinConexion || guardando || cambios === 0;
  const subtitulo = sinConexion
    ? "Sin conexión"
    : invalidos > 0
      ? textoDeCorregir(invalidos)
      : errorAlGuardar
        ? `Se aplican a las ventas nuevas de ${ciudad}.`
        : textoDeAplicacion(ciudad);

  return (
    <div className="sticky bottom-0 z-10 -mx-[22px] -mb-5 flex flex-col gap-2 px-[22px] pb-4">
      {aviso && (
        <div
          role="status"
          className="flex items-center gap-2 self-center rounded-pastilla bg-exito px-4 py-2 text-nav font-semibold text-superficie shadow-md"
        >
          <span aria-hidden>✓</span>
          {aviso}
        </div>
      )}
      {cambios > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-tarjeta border border-borde bg-superficie px-[18px] py-3 shadow-md">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-nav font-semibold text-tinta">{textoDeCambios(cambios)}</span>
            <span className={cn("text-chico", invalidos > 0 ? "text-peligro" : "text-tinta-suave")}>{subtitulo}</span>
            {intentoDeSalir && (
              <span role="alert" className="text-chico font-semibold text-alerta">
                {TEXTO_SALIR_CON_CAMBIOS}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={alDescartar} disabled={guardando} className="text-nav font-semibold">
              Descartar
            </Button>
            <Button
              ref={botonDeGuardar}
              type="button"
              data-guardar
              aria-disabled={frenado || undefined}
              onClick={() => {
                if (!frenado) alGuardar();
              }}
              className="text-nav font-semibold aria-disabled:cursor-not-allowed aria-disabled:bg-tinta-tenue aria-disabled:hover:bg-tinta-tenue"
            >
              {guardando ? "Guardando…" : reintentar ? "Reintentar" : "Guardar cambios"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
