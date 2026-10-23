"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ColportorDeEquipo, JornadaParaAcompanar } from "@/datos/equipo/contrato";
import { diaConSemana } from "@/lib/dias";
import { mensajeSinConexion } from "@/lib/mensajes";

import type { AccionesEquipo } from "./acciones";
import { textoHoras } from "./modelo";
import { CLASE_BOTON_PRIMARIO, CLASE_BOTON_SECUNDARIO } from "./TablaZonas";

type Carga =
  | { tipo: "cargando" }
  | { tipo: "error"; mensaje: string }
  | { tipo: "lista"; jornadas: JornadaParaAcompanar[] };

const ACCION_CARGAR = "traer las jornadas";
const ACCION_REGISTRAR = "registrar el acompañamiento";

/** Lo que el panel avisa al registrar: la jornada y el día/acompañante que confirmó la base. */
export interface AcompanamientoRegistrado {
  jornada: JornadaParaAcompanar;
  dia: string;
  acompanante: string;
}

/**
 * «Registrar acompañamiento» de una fila (HU-JOR-004): las jornadas terminadas del colportor en la campaña, de la más
 * nueva a la más vieja. Solo se ofrecen las que nadie acompañó; el coordinador de la sesión queda como acompañante. Las
 * que ya tienen acompañante figuran con su nombre y no se tocan: el panel nunca pisa un acompañamiento ajeno.
 */
export function RegistrarAcompanamiento({
  colportor,
  acciones,
  alRegistrar,
  alCerrar,
}: {
  colportor: ColportorDeEquipo;
  acciones: AccionesEquipo;
  alRegistrar: (registrado: AcompanamientoRegistrado) => void;
  alCerrar: () => void;
}) {
  const [carga, setCarga] = useState<Carga>({ tipo: "cargando" });
  const [enCurso, setEnCurso] = useState<ReadonlySet<string>>(new Set());
  const [rechazos, setRechazos] = useState<ReadonlyMap<string, string>>(new Map());
  const [aviso, setAviso] = useState<string | null>(null);
  // Un doble toque dispara dos clicks antes del re-render: el ref corta el segundo.
  const enviando = useRef<Set<string>>(new Set());
  const montado = useRef(true);
  const titulo = useRef<HTMLHeadingElement>(null);
  const focoPendiente = useRef<string | null>(null);
  const cargaVigente = useRef(0);

  // Pide las jornadas y devuelve cómo quedó la carga; no toca el estado, así que sirve igual al abrir y al reintentar.
  const pedir = useCallback(async (): Promise<Carga> => {
    try {
      const respuesta = await acciones.jornadasParaAcompanar(colportor.id);
      return respuesta.ok ? { tipo: "lista", jornadas: respuesta.jornadas } : { tipo: "error", mensaje: respuesta.mensaje };
    } catch {
      return { tipo: "error", mensaje: mensajeSinConexion(ACCION_CARGAR) };
    }
  }, [acciones, colportor.id]);

  // Una carga más nueva (o el panel cerrado) descarta la respuesta de la anterior.
  const aplicar = useCallback(async () => {
    const mia = ++cargaVigente.current;
    const siguiente = await pedir();
    if (montado.current && mia === cargaVigente.current) setCarga(siguiente);
  }, [pedir]);

  const recargar = useCallback(
    (conEspera: boolean) => {
      if (conEspera) setCarga({ tipo: "cargando" });
      void aplicar();
    },
    [aplicar],
  );

  useEffect(() => {
    montado.current = true;
    void aplicar();
    titulo.current?.focus();
    return () => {
      montado.current = false;
    };
  }, [aplicar]);

  useEffect(() => {
    const id = focoPendiente.current;
    if (!id) return;
    focoPendiente.current = null;
    Array.from(document.querySelectorAll<HTMLElement>("[data-jornada]"))
      .find((el) => el.dataset.jornada === id)
      ?.focus();
  });

  async function registrar(jornada: JornadaParaAcompanar) {
    if (enviando.current.has(jornada.id)) return;
    enviando.current.add(jornada.id);
    setEnCurso(new Set(enviando.current));
    setRechazos((actuales) => {
      const sin = new Map(actuales);
      sin.delete(jornada.id);
      return sin;
    });
    setAviso(null);
    try {
      const respuesta = await acciones.registrarAcompanamiento(jornada.id);
      if (respuesta.ok) {
        // El padre ya lo anota aunque este panel se haya cerrado mientras esperaba.
        alRegistrar({ jornada, dia: respuesta.dia, acompanante: respuesta.acompanante });
        if (!montado.current) return;
        const cuando = diaConSemana(respuesta.dia);
        setAviso(
          respuesta.yaEstaba
            ? `Esa jornada ya figuraba a tu nombre: ${colportor.nombre}, ${cuando}.`
            : `Acompañamiento registrado: jornada de ${colportor.nombre}, ${cuando}.`,
        );
        setCarga((actual) =>
          actual.tipo === "lista"
            ? { tipo: "lista", jornadas: actual.jornadas.map((j) => (j.id === jornada.id ? { ...j, acompanante: respuesta.acompanante } : j)) }
            : actual,
        );
        focoPendiente.current = jornada.id;
      } else if (montado.current) {
        setRechazos((actuales) => new Map(actuales).set(jornada.id, respuesta.mensaje));
        // La jornada cambió desde que se abrió la lista: se vuelve a pedir, sin perder el aviso.
        if (respuesta.recargar) recargar(false);
      }
    } catch {
      if (montado.current) setRechazos((actuales) => new Map(actuales).set(jornada.id, mensajeSinConexion(ACCION_REGISTRAR)));
    } finally {
      enviando.current.delete(jornada.id);
      if (montado.current) setEnCurso(new Set(enviando.current));
    }
  }

  return (
    <section
      aria-label={`Registrar acompañamiento de ${colportor.nombre}`}
      className="flex flex-col gap-2 border-b border-borde bg-fondo py-3 pr-[18px] pl-[34px]"
    >
      <div className="flex items-start justify-between gap-4">
        <h3
          ref={titulo}
          tabIndex={-1}
          className="min-w-0 text-etiqueta font-semibold tracking-[0.13em] wrap-anywhere text-tinta-suave outline-none"
        >
          REGISTRAR ACOMPAÑAMIENTO · {colportor.nombre.toUpperCase()}
        </h3>
        <button type="button" onClick={alCerrar} className={`${CLASE_BOTON_SECUNDARIO} flex-none`}>
          Cerrar
        </button>
      </div>
      <p className="text-chico text-tinta-2">
        Elegí la jornada que acompañaste. Queda anotado tu nombre; un acompañamiento ya registrado no se cambia desde acá.
      </p>

      {aviso && (
        <p role="status" className="rounded-control bg-exito-fondo px-3 py-2 text-chico text-exito">
          {aviso}
        </p>
      )}

      {carga.tipo === "cargando" && (
        <p role="status" className="text-chico text-tinta-suave">
          Cargando las jornadas de {colportor.nombre}…
        </p>
      )}

      {carga.tipo === "error" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-control border border-borde bg-superficie px-3 py-2">
          <p className="min-w-0 text-chico wrap-anywhere text-tinta">{carga.mensaje}</p>
          <button type="button" onClick={() => recargar(true)} className={CLASE_BOTON_SECUNDARIO}>
            Reintentar
          </button>
        </div>
      )}

      {carga.tipo === "lista" &&
        (carga.jornadas.length === 0 ? (
          <p className="text-chico text-tinta-suave">
            {colportor.nombre} todavía no terminó ninguna jornada en esta campaña. Cuando cierre una, vas a poder registrar tu acompañamiento.
          </p>
        ) : (
          <ul aria-label={`Jornadas terminadas de ${colportor.nombre}`} className="flex max-h-72 flex-col overflow-auto rounded-control border border-borde bg-superficie">
            {carga.jornadas.map((j) => {
              const cuando = diaConSemana(j.dia);
              const ocupada = enCurso.has(j.id);
              const rechazo = rechazos.get(j.id);
              return (
                <li
                  key={j.id}
                  data-jornada={j.id}
                  tabIndex={-1}
                  className="flex flex-col gap-1 border-b border-borde-suave px-3 py-2 outline-none last:border-b-0 focus-visible:bg-marca-clara"
                >
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="w-24 font-mono text-chico text-tinta">{cuando}</span>
                    <span className="w-16 font-mono text-chico text-tinta-2">{textoHoras(j.horas)}</span>
                    {j.acompanante === null ? (
                      <button
                        type="button"
                        aria-disabled={ocupada}
                        aria-label={`Registrar acompañamiento en la jornada de ${colportor.nombre} del ${cuando}`}
                        onClick={() => void registrar(j)}
                        className={`${CLASE_BOTON_PRIMARIO} ml-auto ${ocupada ? "opacity-60" : ""}`}
                      >
                        {ocupada ? "Registrando…" : "Registrar"}
                      </button>
                    ) : (
                      <span className="ml-auto min-w-0 text-chico wrap-anywhere text-tinta-suave">Acompañó {j.acompanante}</span>
                    )}
                  </div>
                  {rechazo && (
                    <p role="alert" className="text-chico wrap-anywhere text-peligro">
                      {rechazo}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        ))}
    </section>
  );
}
