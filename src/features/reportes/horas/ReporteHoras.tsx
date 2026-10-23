"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AccionNoDisponible } from "@/components/AccionNoDisponible";
import type { DatosHoras } from "@/datos/reportes/contrato";
import { cn } from "@/lib/utils";

import { AMBITO_TODAS, construirLista, construirRiel, mismoAmbito, type Ambito } from "./ambito";
import { armarReporte, textoSinDatosDesde } from "./armado";
import type { Granularidad } from "./calculo";
import { ListaDeCiudades, RielDeCiudades } from "./ListaDeCiudades";
import { TablaDeHoras } from "./TablaDeHoras";
import { TarjetaDeCifra } from "./TarjetaDeCifra";

const GRANULARIDADES: { valor: Granularidad; etiqueta: string }[] = [
  { valor: "dia", etiqueta: "Días" },
  { valor: "semana", etiqueta: "Semanas" },
  { valor: "mes", etiqueta: "Meses" },
];

/**
 * Vista 32 (HU-REP-001): el reporte de horas por ciudad y colportor. A la izquierda la lista de ciudades por
 * departamento (que se contrae); a la derecha la cifra de horas con su tendencia y la tabla, en días, semanas o meses.
 * Todo se calcula en el navegador a partir de las horas de cada día: cambiar de ámbito o de período no pide nada al
 * servidor, así que no hay nada que pueda quedar a medias.
 */
export function ReporteHoras({ datos }: { datos: DatosHoras }) {
  const [ambito, setAmbito] = useState<Ambito>(AMBITO_TODAS);
  const [granularidad, setGranularidad] = useState<Granularidad>("semana");
  const [listaAbierta, setListaAbierta] = useState(true);
  const raiz = useRef<HTMLDivElement>(null);
  // Al apagar el botón que tenía el foco (volver a la ciudad, contraer la lista) el foco se devuelve a su par.
  const focoPendiente = useRef<string | null>(null);

  const reporte = useMemo(() => armarReporte(datos, ambito, granularidad), [datos, ambito, granularidad]);
  const lista = useMemo(
    () => construirLista(datos, reporte.resuelto, textoSinDatosDesde),
    [datos, reporte.resuelto],
  );
  const riel = useMemo(() => construirRiel(datos, reporte.resuelto), [datos, reporte.resuelto]);

  useEffect(() => {
    const clave = focoPendiente.current;
    if (!clave) return;
    focoPendiente.current = null;
    const destino = Array.from(raiz.current?.querySelectorAll<HTMLElement>("[data-foco]") ?? []).find(
      (el) => el.dataset.foco === clave,
    );
    destino?.focus();
  });

  const elegir = (destino: Ambito) => {
    if (!mismoAmbito(ambito, destino)) setAmbito(destino);
  };

  return (
    <div
      ref={raiz}
      className={cn(
        "grid min-h-0 flex-1 bg-fondo",
        listaAbierta ? "grid-cols-[320px_minmax(0,1fr)]" : "grid-cols-[68px_minmax(0,1fr)]",
      )}
    >
      {listaAbierta ? (
        <ListaDeCiudades
          lista={lista}
          alElegir={elegir}
          alContraer={() => {
            focoPendiente.current = "alternar";
            setListaAbierta(false);
          }}
        />
      ) : (
        <RielDeCiudades
          items={riel}
          alElegir={elegir}
          alExpandir={() => {
            focoPendiente.current = "alternar";
            setListaAbierta(true);
          }}
        />
      )}

      <div className="flex min-h-0 min-w-0 flex-col gap-3.5 overflow-auto px-[22px] pt-[18px] pb-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-[3px]">
            {reporte.volverA && (
              <button
                type="button"
                onClick={() => {
                  if (!reporte.volverA) return;
                  const destino = reporte.volverA.ambito;
                  // El botón desaparece al volver: el foco pasa a la ciudad, en la lista o en la lista contraída.
                  focoPendiente.current = destino.tipo === "ciudad" ? `ciudad:${destino.ciudadId}` : null;
                  setAmbito(destino);
                }}
                className="inline-flex min-h-6 w-fit items-center text-chico font-semibold text-marca-media hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
              >
                ‹ {reporte.volverA.nombre}
              </button>
            )}
            <h2 className="font-serif text-[22px] font-semibold wrap-anywhere text-tinta">{reporte.titulo}</h2>
            <p className="text-chico text-tinta-suave">{reporte.subtitulo}</p>
          </div>
          <div className="flex flex-none items-center gap-2">
            <div role="group" aria-label="Agrupar por" className="flex overflow-hidden rounded-control border border-borde bg-superficie">
              {GRANULARIDADES.map(({ valor, etiqueta }) => {
                const activa = valor === granularidad;
                return (
                  <button
                    key={valor}
                    type="button"
                    aria-pressed={activa}
                    onClick={() => setGranularidad(valor)}
                    className={cn(
                      "inline-flex min-h-8 items-center border-r border-borde px-3.5 text-chico font-semibold last:border-r-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-acento",
                      activa ? "bg-marca text-superficie" : "bg-superficie text-tinta-2 hover:bg-marca-clara",
                    )}
                  >
                    {etiqueta}
                  </button>
                );
              })}
            </div>
            <AccionNoDisponible className="inline-flex min-h-8 items-center rounded-control bg-marca px-3.5 text-chico font-semibold text-superficie">
              Informe PDF
            </AccionNoDisponible>
            <AccionNoDisponible className="inline-flex min-h-8 items-center rounded-control border border-grafico-neutro bg-superficie px-3.5 text-chico font-semibold text-marca">
              Datos CSV
            </AccionNoDisponible>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3.5">
          <TarjetaDeCifra etiqueta="HORAS" {...reporte.cifra} />
        </div>

        <TablaDeHoras
          descripcion={reporte.tabla.descripcion}
          primeraColumna={reporte.tabla.primeraColumna}
          columna="HORAS"
          filas={reporte.tabla.filas}
          mensajeVacio="Todavía no hay colportores para mostrar acá."
        />
      </div>
    </div>
  );
}
