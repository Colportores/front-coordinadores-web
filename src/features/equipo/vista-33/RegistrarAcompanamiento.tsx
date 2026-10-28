"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";

import {
  DIAS_DE_GRACIA_ACOMPANAMIENTO,
  LARGO_MAXIMO_NOTA,
  type ColportorDeEquipo,
  type DatosEquipoPorCiudad,
  type JornadaParaAcompanar,
  type OrigenDeAcompanamiento,
} from "@/datos/equipo/contrato";
import { diaConSemana } from "@/lib/dias";
import { mensajeSinConexion } from "@/lib/mensajes";
import { cn } from "@/lib/utils";

import type { AccionesEquipo } from "./acciones";
import { cortarTexto, largoDeTexto, nombreDeAcompanante, plazoVencido, textoHoras } from "./modelo";
import { CLASE_BOTON_PRIMARIO, CLASE_BOTON_SECUNDARIO } from "./TablaZonas";

type Carga =
  | { tipo: "cargando" }
  | { tipo: "error"; mensaje: string }
  | { tipo: "lista"; jornadas: JornadaParaAcompanar[] };

/** «Yo» (la coordinación de la sesión) u «Otro colportor» de la misma campaña. */
type Quien = "yo" | "otro";

/** El aviso de arriba de la lista: lo que salió bien, o lo que pasó y hay que saber (la nota no se guardó). */
interface Aviso {
  tipo: "exito" | "alerta";
  texto: string;
}

const ACCION_CARGAR = "traer las jornadas";
const ACCION_REGISTRAR = "registrar el acompañamiento";
const FALTA_EL_COLPORTOR = "Elegí al colportor que acompañó, o cambiá a «Yo».";
const NOTA_NO_GUARDADA = "La nota no se guardó: un acompañamiento ya registrado no se cambia desde acá.";
// El mismo texto que manda la base (CZ011) cuando ya pasó el plazo; acá se muestra antes de intentar nada.
const PLAZO_VENCIDO = `La campaña terminó hace más de ${DIAS_DE_GRACIA_ACOMPANAMIENTO} días y sus acompañamientos quedan como están. Elegí una campaña en curso o que haya terminado hace ${DIAS_DE_GRACIA_ACOMPANAMIENTO} días o menos.`;

/** Lo que el panel avisa al registrar: la jornada y lo que confirmó la base (quién acompañó, de dónde salió, la nota). */
export interface AcompanamientoRegistrado {
  jornada: JornadaParaAcompanar;
  dia: string;
  acompanante: string;
  /** Quien acompañó es quien tiene la sesión («Yo»). */
  acompananteEsVos: boolean;
  origen: OrigenDeAcompanamiento | null;
  nota: string | null;
}

/**
 * «Registrar acompañamiento» de una fila (HU-JOR-004): quién lo acompañó («Yo» u «Otro colportor» de la campaña), una nota
 * opcional y las jornadas terminadas del colportor en la campaña, de la más nueva a la más vieja. Solo se ofrecen las
 * que nadie acompañó; las que ya tienen acompañante figuran con su nombre y no se tocan: el panel nunca pisa un
 * acompañamiento ya registrado. Pasados los 15 días del fin de la campaña no se registra nada y el panel lo dice.
 */
export function RegistrarAcompanamiento(props: {
  colportor: ColportorDeEquipo;
  datos: DatosEquipoPorCiudad;
  acciones: AccionesEquipo;
  alRegistrar: (registrado: AcompanamientoRegistrado) => void;
  alCerrar: () => void;
}) {
  return plazoVencido(props.datos.campaniaFin, props.datos.hoy) ? <PlazoVencido {...props} /> : <PanelDeRegistro {...props} />;
}

function Cabecera({ colportor, alCerrar, titulo }: { colportor: ColportorDeEquipo; alCerrar: () => void; titulo: RefObject<HTMLHeadingElement | null> }) {
  return (
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
  );
}

const CLASE_PANEL = "flex flex-col gap-2 border-b border-borde bg-fondo py-3 pr-[18px] pl-[34px]";

/** La campaña terminó hace más de 15 días (CZ011): no hay nada que registrar y se dice por qué, sin pedir nada al servidor. */
function PlazoVencido({ colportor, alCerrar }: { colportor: ColportorDeEquipo; alCerrar: () => void }) {
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => titulo.current?.focus(), []);
  return (
    <section aria-label={`Registrar acompañamiento de ${colportor.nombre}`} className={CLASE_PANEL}>
      <Cabecera colportor={colportor} alCerrar={alCerrar} titulo={titulo} />
      <p role="status" className="rounded-control bg-alerta-fondo px-3 py-2 text-chico text-alerta">
        {PLAZO_VENCIDO}
      </p>
    </section>
  );
}

function PanelDeRegistro({
  colportor,
  datos,
  acciones,
  alRegistrar,
  alCerrar,
}: {
  colportor: ColportorDeEquipo;
  datos: DatosEquipoPorCiudad;
  acciones: AccionesEquipo;
  alRegistrar: (registrado: AcompanamientoRegistrado) => void;
  alCerrar: () => void;
}) {
  const [carga, setCarga] = useState<Carga>({ tipo: "cargando" });
  const [enCurso, setEnCurso] = useState<ReadonlySet<string>>(new Set());
  const [rechazos, setRechazos] = useState<ReadonlyMap<string, string>>(new Map());
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [quien, setQuien] = useState<Quien>("yo");
  const [otroId, setOtroId] = useState("");
  const [faltaElOtro, setFaltaElOtro] = useState(false);
  const [nota, setNota] = useState("");
  // Un doble toque dispara dos clicks antes del re-render: el ref corta el segundo. Cada registro lleva lo que decía el
  // formulario en el momento del toque (quién y qué nota), así que dos jornadas seguidas no se pisan.
  const enviando = useRef<Set<string>>(new Set());
  const montado = useRef(true);
  const titulo = useRef<HTMLHeadingElement>(null);
  const selector = useRef<HTMLSelectElement>(null);
  const focoPendiente = useRef<string | null>(null);
  const cargaVigente = useRef(0);
  const id = useId();

  // Los demás de la campaña, con o sin zona: el servidor valida que estén inscriptos. No se ofrece a quien es dueño de la jornada.
  const otros = useMemo(
    () => datos.colportores.filter((c) => c.id !== colportor.id).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [datos.colportores, colportor.id],
  );

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
    const clave = focoPendiente.current;
    if (!clave) return;
    focoPendiente.current = null;
    Array.from(document.querySelectorAll<HTMLElement>("[data-jornada], [data-foco-registro]"))
      .find((el) => el.dataset.jornada === clave || el.dataset.focoRegistro === clave)
      ?.focus();
  });

  async function registrar(jornada: JornadaParaAcompanar) {
    if (enviando.current.has(jornada.id)) return;
    if (quien === "otro" && otroId === "") {
      // Sin acompañante no hay nada que mandar: se avisa en el campo y el foco va al selector.
      setFaltaElOtro(true);
      selector.current?.focus();
      return;
    }
    const escrita = nota;
    const datosDelRegistro = {
      ...(quien === "otro" ? { acompananteId: otroId } : {}),
      ...(escrita.trim() !== "" ? { nota: escrita.trim() } : {}),
    };
    const eraYo = quien === "yo";
    enviando.current.add(jornada.id);
    setEnCurso(new Set(enviando.current));
    setRechazos((actuales) => {
      const sin = new Map(actuales);
      sin.delete(jornada.id);
      return sin;
    });
    setAviso(null);
    try {
      const respuesta = await acciones.registrarAcompanamiento(jornada.id, datosDelRegistro);
      if (respuesta.ok) {
        // El padre ya lo anota aunque este panel se haya cerrado mientras esperaba.
        alRegistrar({
          jornada,
          dia: respuesta.dia,
          acompanante: respuesta.acompanante,
          acompananteEsVos: eraYo,
          origen: respuesta.origen,
          nota: respuesta.nota,
        });
        if (!montado.current) return;
        const cuando = diaConSemana(respuesta.dia);
        // Ya figuraba a nombre de esa persona (el teléfono la marcó antes, o un doble toque): no se tocó nada, tampoco la nota.
        const notaPerdida = respuesta.yaEstaba && escrita.trim() !== "";
        if (respuesta.yaEstaba) {
          const aNombreDe = eraYo ? "a tu nombre" : `a nombre de ${respuesta.acompanante}`;
          setAviso({
            tipo: notaPerdida ? "alerta" : "exito",
            texto: `Esa jornada ya figuraba ${aNombreDe}: ${colportor.nombre}, ${cuando}.${notaPerdida ? ` ${NOTA_NO_GUARDADA}` : ""}`,
          });
        } else {
          setAviso({
            tipo: "exito",
            texto: `Acompañamiento registrado: jornada de ${colportor.nombre}, ${cuando}.${eraYo ? "" : ` Acompañó ${respuesta.acompanante}.`}`,
          });
          // Lo escrito ya quedó guardado. Si mientras tanto siguió escribiendo, eso no se toca.
          setNota((actual) => (actual === escrita ? "" : actual));
        }
        setCarga((actual) =>
          actual.tipo === "lista"
            ? {
                tipo: "lista",
                jornadas: actual.jornadas.map((j) => (j.id === jornada.id ? { ...j, acompanante: respuesta.acompanante, acompananteEsVos: eraYo } : j)),
              }
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

  const registrables = carga.tipo === "lista" ? carga.jornadas.filter((j) => j.acompanante === null).length : 0;
  // El formulario sigue mientras haya algo que registrar o algo escrito que no se guardó (la nota de un «ya estaba» se puede copiar).
  const conFormulario = carga.tipo === "lista" && (registrables > 0 || nota !== "");
  const largoNota = largoDeTexto(nota);
  const idOtro = `${id}-otro`;
  const idNota = `${id}-nota`;
  const idAyuda = `${id}-ayuda`;

  return (
    <section aria-label={`Registrar acompañamiento de ${colportor.nombre}`} className={CLASE_PANEL}>
      <Cabecera colportor={colportor} alCerrar={alCerrar} titulo={titulo} />
      <p className="text-chico text-tinta-2">
        Elegí quién lo acompañó y la jornada. Un acompañamiento ya registrado no se cambia desde acá.
      </p>

      {aviso && (
        <p
          role={aviso.tipo === "alerta" ? "alert" : "status"}
          className={cn("rounded-control px-3 py-2 text-chico", aviso.tipo === "alerta" ? "bg-alerta-fondo text-alerta" : "bg-exito-fondo text-exito")}
        >
          {aviso.texto}
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

      {conFormulario && (
        <div className="flex flex-col gap-2.5 rounded-control border border-borde bg-superficie p-3">
          <fieldset className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
            <legend className="mb-1 text-etiqueta font-semibold tracking-[0.13em] text-tinta-suave">QUIÉN LO ACOMPAÑÓ</legend>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <label className="inline-flex min-h-8 items-center gap-2 text-chico font-semibold text-tinta-2">
                <input
                  type="radio"
                  name={`${id}-quien`}
                  checked={quien === "yo"}
                  onChange={() => {
                    setQuien("yo");
                    setFaltaElOtro(false);
                  }}
                  className="size-4 accent-marca"
                />
                Yo
              </label>
              <label className={cn("inline-flex min-h-8 items-center gap-2 text-chico font-semibold", otros.length === 0 ? "text-tinta-suave" : "text-tinta-2")}>
                <input
                  type="radio"
                  name={`${id}-quien`}
                  checked={quien === "otro"}
                  disabled={otros.length === 0}
                  onChange={() => setQuien("otro")}
                  className="size-4 accent-marca"
                />
                Otro colportor
              </label>
              {otros.length === 0 && <span className="text-chico text-tinta-suave">No hay otros colportores en esta campaña.</span>}
            </div>
            {quien === "otro" && (
              <div className="flex min-w-0 flex-col gap-1">
                <label htmlFor={idOtro} className="text-chico font-semibold text-tinta-2">
                  Colportor que acompañó
                </label>
                <select
                  id={idOtro}
                  ref={selector}
                  value={otroId}
                  aria-invalid={faltaElOtro ? true : undefined}
                  aria-describedby={faltaElOtro ? `${idOtro}-error` : undefined}
                  onChange={(e) => {
                    setOtroId(e.target.value);
                    setFaltaElOtro(false);
                  }}
                  className={cn(
                    "min-h-8 max-w-full rounded-control border bg-superficie px-2 text-chico text-tinta focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none",
                    faltaElOtro ? "border-peligro" : "border-borde",
                  )}
                >
                  <option value="">Elegí un colportor</option>
                  {otros.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
                {faltaElOtro && (
                  <p id={`${idOtro}-error`} role="alert" className="text-chico font-medium text-peligro">
                    {FALTA_EL_COLPORTOR}
                  </p>
                )}
              </div>
            )}
          </fieldset>

          <div className="flex flex-col gap-1">
            <label htmlFor={idNota} className="text-chico font-semibold text-tinta-2">
              Nota (opcional)
            </label>
            <textarea
              id={idNota}
              data-foco-registro="nota"
              value={nota}
              rows={2}
              aria-describedby={idAyuda}
              // Se frena en el mismo número que el servidor, contado en caracteres: un texto pegado más largo se corta.
              onChange={(e) => setNota(cortarTexto(e.target.value, LARGO_MAXIMO_NOTA))}
              className="min-h-[56px] w-full resize-y rounded-control border border-borde bg-superficie px-3 py-2 text-chico text-tinta focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none"
            />
            <p id={idAyuda} className="flex flex-wrap justify-between gap-x-3 text-chico text-tinta-suave">
              <span>Sin datos de clientes.</span>
              <span className={cn("font-mono", largoNota >= LARGO_MAXIMO_NOTA && "font-semibold text-alerta")}>
                {largoNota} de {LARGO_MAXIMO_NOTA} caracteres
              </span>
            </p>
          </div>
        </div>
      )}

      {carga.tipo === "lista" &&
        (carga.jornadas.length === 0 ? (
          <p className="text-chico text-tinta-suave">
            {colportor.nombre} todavía no terminó ninguna jornada en esta campaña. Cuando cierre una, vas a poder registrar el acompañamiento.
          </p>
        ) : (
          <>
            {registrables === 0 && (
              <p className="text-chico text-tinta-suave">
                Todas sus jornadas terminadas ya figuran acompañadas: un acompañamiento ya registrado no se cambia desde acá.
              </p>
            )}
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
                        <span className="ml-auto min-w-0 text-chico wrap-anywhere text-tinta-suave">Acompañó {nombreDeAcompanante(j.acompanante, j.acompananteEsVos)}</span>
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
          </>
        ))}
    </section>
  );
}
