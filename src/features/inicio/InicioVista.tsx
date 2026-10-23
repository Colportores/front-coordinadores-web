"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { ResultadoTablero, TableroDelDia } from "@/datos/inicio";
import { useAjustesDeInicio } from "@/features/inicio/ajustes";
import { BarraDeCiudades, ListaDeCiudades } from "@/features/inicio/ListaDeCiudades";
import {
  ciudadesDe,
  elementosDeLista,
  encabezadoDe,
  horaDeActualizacion,
  horasTexto,
  montoTexto,
  recienEmpieza,
  resumenDe,
  seleccionVigente,
  tarjetasPendientes,
  type Seleccion,
} from "@/features/inicio/modelo";
import { BarraDePendientes, PendientesDeAccion } from "@/features/inicio/PendientesDeAccion";
import { SelectorDeDia } from "@/features/inicio/SelectorDeDia";
import { TablaDeColportores } from "@/features/inicio/TablaDeColportores";
import { cn } from "@/lib/utils";

/** Cómo pide la vista otro día: con una server action, o contra la fuente simulada en el sitio de prueba. */
export interface AccionesInicio {
  obtenerDia(fecha: string): Promise<ResultadoTablero>;
}

type Carga =
  | { tipo: "listo"; tablero: TableroDelDia }
  | { tipo: "cargando" }
  | { tipo: "error"; texto: string };

const TEXTO_SIN_CONEXION = "No se pudo cargar el día. Revisá tu conexión y probá de nuevo.";
const TEXTO_ERROR = "No se pudo cargar el día. Probá de nuevo más tarde.";
const TEXTO_SIN_CAMPANIA = "La campaña ya no está disponible. Elegí otra desde el selector de arriba.";

function textoDeFalla(resultado: Extract<ResultadoTablero, { ok: false }>): string {
  if (resultado.causa === "sin-conexion") return TEXTO_SIN_CONEXION;
  if (resultado.causa === "rechazo" && resultado.mensaje) return resultado.mensaje;
  return TEXTO_ERROR;
}

function Cifra({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-tarjeta border border-borde bg-superficie px-[18px] py-3.5">
      <dt className="text-etiqueta font-semibold tracking-etiqueta text-tinta-suave uppercase">{rotulo}</dt>
      <dd className="flex items-baseline gap-2.5 font-serif text-cifra font-semibold text-marca">{children}</dd>
    </div>
  );
}

/**
 * Vista 31 (HU-CAM-008), Inicio: «cómo está mi gente hoy». A la izquierda, las ciudades agrupadas por departamento (filtro
 * y resumen del día); en el centro, la elección con sus tres cifras y sus colportores; a la derecha, sus pendientes. Las
 * dos columnas de los extremos se colapsan y la vista recuerda la ciudad elegida y cómo quedaron.
 */
export function InicioVista({ tablero: inicial, acciones }: { tablero: TableroDelDia; acciones: AccionesInicio }) {
  // «Hoy» es el día que contó el servidor al abrir la pestaña; el reloj del navegador no decide qué día es.
  const hoy = inicial.fecha;
  const [dia, setDia] = useState(inicial.fecha);
  const [carga, setCarga] = useState<Carga>({ tipo: "listo", tablero: inicial });
  const [ajustes, guardar] = useAjustesDeInicio();
  const pedido = useRef(0);
  const focoPendiente = useRef<string | null>(null);

  // Tras colapsar o expandir una columna, el botón que se tocó ya no existe (es el de la otra versión): el foco vuelve al nuevo.
  useEffect(() => {
    if (!focoPendiente.current) return;
    document.querySelector<HTMLElement>(`[data-foco="${focoPendiente.current}"]`)?.focus();
    focoPendiente.current = null;
  });

  const cargar = useCallback(
    async (fecha: string, enfocarAlTerminar = false) => {
      const numero = ++pedido.current;
      setDia(fecha);
      setCarga({ tipo: "cargando" });
      let resultado: ResultadoTablero;
      try {
        resultado = await acciones.obtenerDia(fecha);
      } catch {
        resultado = { ok: false, causa: "sin-conexion" };
      }
      // Si mientras tanto se pidió otro día, esta respuesta ya no es de lo que se mira.
      if (numero !== pedido.current) return;
      if (!resultado.ok) setCarga({ tipo: "error", texto: textoDeFalla(resultado) });
      else if (!resultado.tablero) setCarga({ tipo: "error", texto: TEXTO_SIN_CAMPANIA });
      else {
        setCarga({ tipo: "listo", tablero: resultado.tablero });
        if (enfocarAlTerminar) focoPendiente.current = "titulo-detalle";
      }
    },
    [acciones],
  );

  const tablero = carga.tipo === "listo" ? carga.tablero : null;
  const ciudades = useMemo(() => tablero?.ciudades ?? [], [tablero]);
  const seleccion: Seleccion = seleccionVigente(ajustes.seleccion, ciudades);
  const elementos = useMemo(() => elementosDeLista(ciudades), [ciudades]);
  const elegidas = ciudadesDe(seleccion, ciudades);
  const resumen = resumenDe(elegidas);
  const tarjetas = tablero ? tarjetasPendientes(tablero, seleccion) : [];
  const { titulo, subtitulo } = encabezadoDe(seleccion, ciudades);
  const conCiudades = tablero !== null && ciudades.length > 0;

  const nota = tablero
    ? [
        tablero.esHoy ? `Actualizado ${horaDeActualizacion(tablero.calculadoA)}` : "",
        recienEmpieza(resumen, tablero.esHoy) ? "Recién empieza la jornada: las cifras se suman a medida que cada colportor sincroniza." : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  function alternar(cambios: Parameters<typeof guardar>[0], foco: string) {
    focoPendiente.current = foco;
    guardar(cambios);
  }

  return (
    <div className={cn("grid h-full min-h-0", conCiudades ? (ajustes.ciudadesCerrada ? "grid-cols-[68px_minmax(0,1fr)]" : "grid-cols-[320px_minmax(0,1fr)]") : "grid-cols-[minmax(0,1fr)]")}>
      {conCiudades &&
        (ajustes.ciudadesCerrada ? (
          <BarraDeCiudades
            elementos={elementos}
            seleccionada={seleccion}
            alElegir={(s) => guardar({ seleccion: s })}
            alExpandir={() => alternar({ ciudadesCerrada: false }, "alternar-ciudades")}
          />
        ) : (
          <ListaDeCiudades
            elementos={elementos}
            seleccionada={seleccion}
            alElegir={(s) => guardar({ seleccion: s })}
            alContraer={() => alternar({ ciudadesCerrada: true }, "alternar-ciudades")}
          />
        ))}

      <div className="flex min-h-0 min-w-0 flex-col gap-3.5 px-[22px] pt-[18px] pb-5" aria-busy={carga.tipo === "cargando"}>
        <div className="flex items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-[3px]">
            {conCiudades && (
              <>
                <h2 id="titulo-detalle" tabIndex={-1} data-foco="titulo-detalle" className="font-serif text-[22px] font-semibold [overflow-wrap:anywhere] outline-none">
                  {titulo}
                </h2>
                <p className="text-chico text-tinta-suave">{subtitulo}</p>
              </>
            )}
          </div>
          <div className="flex items-center gap-3.5">
            {nota && <p className="max-w-[360px] text-right text-[11.5px] text-tinta-suave text-pretty">{nota}</p>}
            <SelectorDeDia dia={dia} hoy={hoy} alElegir={(d) => void cargar(d)} />
            <Link href="/equipo" className="inline-flex min-h-8 items-center text-[11.5px] font-semibold whitespace-nowrap text-marca-media focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none">
              Ver equipo →
            </Link>
          </div>
        </div>

        {carga.tipo === "cargando" && (
          <p role="status" className="text-nav text-tinta-suave">
            Cargando el día…
          </p>
        )}

        {carga.tipo === "error" && (
          <div role="alert" className="flex max-w-xl flex-col items-start gap-3 rounded-tarjeta border border-borde bg-superficie px-[18px] py-4">
            <p className="text-nav text-tinta">{carga.texto}</p>
            <Button type="button" onClick={() => void cargar(dia, true)} className="text-nav font-semibold">
              Reintentar
            </Button>
          </div>
        )}

        {tablero && ciudades.length === 0 && (
          <div className="flex max-w-xl flex-col items-start gap-3 rounded-tarjeta border border-borde bg-superficie px-[18px] py-4">
            <p className="text-nav text-tinta">Esta campaña todavía no tiene ciudades. Agregalas para ver cómo está tu gente.</p>
            <Button asChild variant="outline" className="text-nav font-semibold text-tinta-2">
              <Link href="/ciudades">Ir a Ciudades</Link>
            </Button>
          </div>
        )}

        {tablero && conCiudades && (
          <>
            <dl className="grid grid-cols-3 gap-3.5">
              <Cifra rotulo="Horas">{horasTexto(resumen.horas)}</Cifra>
              <Cifra rotulo="Presentaciones">{resumen.presentaciones}</Cifra>
              <Cifra rotulo="Ventas">
                {resumen.ventas}
                <span className="font-mono text-nav font-normal text-tinta-2">{montoTexto(resumen.montoCentavos)}</span>
              </Cifra>
            </dl>
            <div className={cn("grid min-h-0 flex-1 gap-4", ajustes.pendientesCerrada ? "grid-cols-[minmax(0,1fr)_52px]" : "grid-cols-[minmax(0,1fr)_280px]")}>
              <TablaDeColportores ciudades={elegidas} ahora={tablero.calculadoA} titulo={titulo} />
              {ajustes.pendientesCerrada ? (
                <BarraDePendientes cantidad={tarjetas.length} alExpandir={() => alternar({ pendientesCerrada: false }, "alternar-pendientes")} />
              ) : (
                <PendientesDeAccion
                  tarjetas={tarjetas}
                  vacio={seleccion.tipo === "ciudad" ? "Nada pendiente en esta ciudad." : "Nada pendiente."}
                  alContraer={() => alternar({ pendientesCerrada: true }, "alternar-pendientes")}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
