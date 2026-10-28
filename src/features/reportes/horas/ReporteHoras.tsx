"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { DatosHoras } from "@/datos/reportes/contrato";
import { SeccionHu } from "@/dev/SeccionHu";
import { cn } from "@/lib/utils";

import { AvisoDeExportacion, BotonesDeExportar } from "../exportar/BotonesDeExportar";
import { useExportacion } from "../exportar/useExportacion";
import { AMBITO_TODAS, colportoresElegibles, construirLista, construirRiel, mismoAmbito, resolverAmbito, type Ambito } from "./ambito";
import { armarReporte, armarReporteDeRango, textoSinDatosDesde } from "./armado";
import type { ModoDeReporte } from "./calculo";
import { ListaDeCiudades, RielDeCiudades } from "./ListaDeCiudades";
import { MOSTRAR_POR_COBRAR } from "./metricas";
import { limitesDelRango, rangoInicial } from "./rango";
import { SelectorDeColportores } from "./SelectorDeColportores";
import { SelectorDeRango } from "./SelectorDeRango";
import { TablaDeReporte } from "./TablaDeReporte";
import { TarjetaDeCifra } from "./TarjetaDeCifra";

const GRANULARIDADES: { valor: ModoDeReporte; etiqueta: string }[] = [
  { valor: "dia", etiqueta: "Días" },
  { valor: "semana", etiqueta: "Semanas" },
  { valor: "mes", etiqueta: "Meses" },
  { valor: "rango", etiqueta: "Rango" },
];

/** Las cifras de ventas son de HU-REP-002; las demás (horas, promedio, acompañamiento) son del reporte de horas, HU-REP-001. */
const CIFRAS_DE_VENTAS = new Set(["presentaciones", "ventas", "porCobrar"]);

/**
 * Vista 32 (HU-REP-001 y HU-REP-002): el reporte de horas, presentaciones y ventas por ciudad y colportor. A la
 * izquierda la lista de ciudades por departamento (que se contrae); a la derecha las cifras con su tendencia y la
 * tabla, en días, semanas o meses. Todo se calcula en el navegador a partir de lo que pasó cada día: cambiar de
 * ámbito o de período no pide nada al servidor, así que no hay nada que pueda quedar a medias. Además de días, semanas y
 * meses hay un rango de fechas libre («Rango») y se puede elegir uno o varios colportores del ámbito (issue #107). El % por
 * cobrar es V2 y no se muestra hasta que se conecte (`mostrarPorCobrar`).
 */
export function ReporteHoras({ datos, mostrarPorCobrar = MOSTRAR_POR_COBRAR }: { datos: DatosHoras; mostrarPorCobrar?: boolean }) {
  const [ambito, setAmbito] = useState<Ambito>(AMBITO_TODAS);
  const [granularidad, setGranularidad] = useState<ModoDeReporte>("semana");
  const limites = useMemo(() => limitesDelRango(datos), [datos]);
  // Lo que se escribió en «desde» y «hasta», tal cual (puede estar vacío o ser inválido: el reporte lo dice).
  const [rango, setRango] = useState(() => rangoInicial(limitesDelRango(datos)));
  // Los colportores elegidos del ámbito; vacío = todos. Al cambiar de ámbito se vacía.
  const [elegidos, setElegidos] = useState<string[]>([]);
  const idDelAvisoDeRango = useId();
  const [listaAbierta, setListaAbierta] = useState(true);
  const raiz = useRef<HTMLDivElement>(null);
  // Al apagar el botón que tenía el foco (volver a la ciudad, contraer la lista) el foco se devuelve a su par.
  const focoPendiente = useRef<string | null>(null);

  // El ámbito de la lista, sin acotar a los colportores elegidos: la lista y las casillas salen de acá.
  const base = useMemo(() => resolverAmbito(datos, ambito), [datos, ambito]);
  const opciones = useMemo(
    () =>
      base.ambito.tipo === "colportor"
        ? []
        : colportoresElegibles(base).map(({ colportor, ciudad }) => ({ id: colportor.id, nombre: colportor.nombre, ciudad: ciudad.nombre })),
    [base],
  );
  // Una elección vieja (colportores que ya no están en el ámbito) no cuenta.
  const elegidosVigentes = useMemo(() => elegidos.filter((id) => opciones.some((o) => o.id === id)), [elegidos, opciones]);

  const reporte = useMemo(
    () =>
      granularidad === "rango"
        ? armarReporteDeRango(datos, ambito, rango, { porCobrar: mostrarPorCobrar, elegidos: elegidosVigentes })
        : armarReporte(datos, ambito, granularidad, { porCobrar: mostrarPorCobrar, elegidos: elegidosVigentes }),
    [datos, ambito, granularidad, rango, mostrarPorCobrar, elegidosVigentes],
  );
  const lista = useMemo(() => construirLista(datos, base, textoSinDatosDesde), [datos, base]);
  const riel = useMemo(() => construirRiel(datos, base), [datos, base]);
  const { desde, hasta } = rango;
  const contextoDeExportacion = useMemo(
    () => ({ granularidad, hoy: datos.hoy, rango: granularidad === "rango" ? { desde, hasta } : null }),
    [granularidad, datos.hoy, desde, hasta],
  );
  const exportacion = useExportacion(reporte, contextoDeExportacion);

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
    if (mismoAmbito(ambito, destino)) return;
    setElegidos([]);
    setAmbito(destino);
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
                  setElegidos([]);
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
          <div className="flex flex-none flex-col items-end gap-1.5">
            <div className="flex items-center gap-2">
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
              <SeccionHu hu="HU-REP-005" className="flex items-center gap-2">
                <BotonesDeExportar estado={exportacion} />
              </SeccionHu>
            </div>
            <AvisoDeExportacion estado={exportacion} rangoSinCorregir={reporte.problemaDeRango !== null} />
          </div>
        </div>

        {(opciones.length > 1 || granularidad === "rango") && (
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
            {granularidad === "rango" && (
              <SelectorDeRango
                desde={rango.desde}
                hasta={rango.hasta}
                limites={limites}
                hayProblema={reporte.problemaDeRango !== null}
                idDelAviso={idDelAvisoDeRango}
                alCambiar={(cambio) => setRango((actual) => ({ ...actual, ...cambio }))}
              />
            )}
            {opciones.length > 1 && <SelectorDeColportores opciones={opciones} elegidos={elegidosVigentes} alCambiar={setElegidos} />}
          </div>
        )}

        {reporte.problemaDeRango !== null ? (
          <p
            id={idDelAvisoDeRango}
            role="alert"
            className="rounded-tarjeta border border-peligro bg-peligro-fondo px-4 py-3 text-cuerpo font-medium text-peligro"
          >
            {reporte.problemaDeRango}
          </p>
        ) : (
          <>
            <div
              className="grid gap-3.5"
              style={{
                gridTemplateColumns:
                  reporte.tarjetas.length > 3
                    ? "repeat(auto-fit, minmax(176px, 1fr))"
                    : `repeat(${reporte.tarjetas.length}, minmax(0, 1fr))`,
              }}
            >
              {reporte.tarjetas.map(({ clave, ...tarjeta }) =>
                CIFRAS_DE_VENTAS.has(clave) ? (
                  // Presentaciones, ventas y % por cobrar son de HU-REP-002: en modo dev se marcan aparte de las horas.
                  <SeccionHu key={clave} hu="HU-REP-002" className="flex min-w-0 *:min-w-0 *:flex-1">
                    <TarjetaDeCifra {...tarjeta} />
                  </SeccionHu>
                ) : (
                  <TarjetaDeCifra key={clave} {...tarjeta} />
                ),
              )}
            </div>

            <TablaDeReporte
              descripcion={reporte.tabla.descripcion}
              primeraColumna={reporte.tabla.primeraColumna}
              columnas={reporte.tabla.columnas}
              filas={reporte.tabla.filas}
              mensajeVacio="Todavía no hay colportores para mostrar acá."
            />
          </>
        )}
      </div>
    </div>
  );
}
