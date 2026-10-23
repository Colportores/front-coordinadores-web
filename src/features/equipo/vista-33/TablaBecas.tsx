"use client";

import { Fragment, useEffect, useRef, useState } from "react";

import type { CarreraDelCatalogo, ColportorDeEquipo, DatosDeBecas, TipoDeBeca } from "@/datos/equipo/contrato";
import { diaYMes } from "@/lib/dias";
import { cn } from "@/lib/utils";

import { avanceDeBeca, ETIQUETA_DE_TIPO, pluralColportores, type AmbitoResuelto, type UnidadDeAvance } from "./modelo";
import type { EstadoDeBecas } from "./useBecas";
import { CabeceraDeGrupo, CLASE_BOTON_PRIMARIO, CLASE_BOTON_SECUNDARIO } from "./TablaZonas";

const COLUMNAS = 4;
const TIPOS: TipoDeBeca[] = ["media", "completa"];

function sinMetaCargada(carrera: CarreraDelCatalogo): boolean {
  return carrera.metaMedia === null && carrera.metaCompleta === null;
}

/**
 * «Elegir carrera» de una fila: la carrera se elige una sola vez, del catálogo. No hay marcha atrás desde el panel (si hubo
 * un error lo corrige el administrador), así que el botón dice «Guardar carrera» y el texto lo avisa antes de tocarlo.
 */
function ElegirCarrera({
  colportor,
  carreras,
  guardando,
  error,
  alGuardar,
  alCancelar,
}: {
  colportor: ColportorDeEquipo;
  carreras: CarreraDelCatalogo[];
  guardando: boolean;
  error: string | undefined;
  alGuardar: (carreraId: string) => void;
  alCancelar: () => void;
}) {
  const [carreraId, setCarreraId] = useState("");
  const selector = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    selector.current?.focus();
  }, []);

  return (
    <section
      aria-label={`Elegir la carrera de ${colportor.nombre}`}
      className="flex flex-col gap-2 border-b border-borde bg-fondo py-3 pr-[18px] pl-[34px]"
    >
      <h3 className="min-w-0 text-etiqueta font-semibold tracking-[0.13em] wrap-anywhere text-tinta-suave">
        ELEGIR CARRERA · {colportor.nombre.toUpperCase()}
      </h3>
      <p className="text-chico text-tinta-2">
        Elegí la carrera del catálogo. Se elige una sola vez: después no se cambia desde el panel y, si hubo un error, la corrige el administrador.
      </p>
      {carreras.length === 0 ? (
        <p className="text-chico text-tinta-suave">El catálogo de carreras está vacío. Avisale al administrador para que las cargue.</p>
      ) : (
        // Los botones se marcan con aria-disabled y no con disabled: así el foco no se pierde al guardar.
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(evento) => {
            evento.preventDefault();
            if (carreraId !== "" && !guardando) alGuardar(carreraId);
          }}
        >
          <label className="flex items-center gap-2 text-chico font-semibold text-tinta-2">
            Carrera
            <select
              ref={selector}
              value={carreraId}
              onChange={(evento) => setCarreraId(evento.target.value)}
              className="min-h-8 max-w-72 rounded-control border border-borde bg-superficie px-2 text-chico font-normal text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
            >
              <option value="">Elegí una carrera</option>
              {carreras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {sinMetaCargada(c) ? " (sin meta cargada)" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            aria-disabled={carreraId === "" || guardando}
            className={cn(CLASE_BOTON_PRIMARIO, (carreraId === "" || guardando) && "opacity-60")}
          >
            {guardando ? "Guardando…" : "Guardar carrera"}
          </button>
          <button type="button" onClick={alCancelar} className={CLASE_BOTON_SECUNDARIO}>
            Cancelar
          </button>
        </form>
      )}
      {carreras.length === 0 && (
        <div>
          <button type="button" onClick={alCancelar} className={CLASE_BOTON_SECUNDARIO}>
            Cerrar
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-chico wrap-anywhere text-peligro">
          {error}
        </p>
      )}
    </section>
  );
}

function Avance({ colportor, estado, unidad }: { colportor: ColportorDeEquipo; estado: EstadoDeBecas; unidad: UnidadDeAvance }) {
  const avance = avanceDeBeca(estado.porColportor[colportor.id], unidad);
  const guardando = estado.guardando.has(colportor.id);
  if (avance.tipo === "sin-carrera") return <span className="text-tinta-suave">Sin meta: falta la carrera</span>;
  if (avance.tipo === "sin-tipo") {
    return (
      <span className="text-tinta-suave">
        Sin meta: falta elegir a qué apunta
        {guardando && <span className="ml-2 text-chico">Guardando…</span>}
      </span>
    );
  }
  return (
    <span className="flex min-w-0 flex-col gap-1" aria-busy={guardando}>
      <span className="font-mono text-[11.5px] wrap-anywhere">
        {avance.texto}
        {guardando && <span className="ml-2 font-sans text-tinta-suave">Guardando…</span>}
      </span>
      <span aria-hidden="true" className="h-[5px] overflow-hidden rounded-[3px] bg-borde">
        <span className={cn("block h-[5px]", avance.alcanzada ? "bg-exito" : "bg-marca-media")} style={{ width: `${avance.porcentaje}%` }} />
      </span>
    </span>
  );
}

function ApuntaA({ colportor, estado }: { colportor: ColportorDeEquipo; estado: EstadoDeBecas }) {
  const beca = estado.porColportor[colportor.id];
  const marcado = estado.pedido[colportor.id] ?? beca?.apuntaA ?? null;
  return (
    <span role="group" aria-label={`A qué beca apunta ${colportor.nombre}`} className="inline-flex overflow-hidden rounded-control border border-borde bg-superficie">
      {TIPOS.map((tipo) => {
        const activo = marcado === tipo;
        return (
          <button
            key={tipo}
            type="button"
            data-foco-beca={`apunta:${colportor.id}:${tipo}`}
            aria-pressed={activo}
            aria-label={`Apuntar a ${tipo === "media" ? "media beca" : "beca completa"}: ${colportor.nombre}`}
            onClick={() => estado.asignarTipo({ id: colportor.id, nombre: colportor.nombre }, tipo)}
            className={cn(
              "inline-flex min-h-8 items-center border-l border-borde px-3 text-chico font-semibold first:border-l-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-acento",
              activo ? "bg-marca text-superficie" : "bg-superficie text-tinta-2 hover:bg-marca-clara",
            )}
          >
            {ETIQUETA_DE_TIPO[tipo]}
          </button>
        );
      })}
    </span>
  );
}

/**
 * Pestaña «Becas» de la vista 33 (HU-BEC-004, HU-BEC-006): por colportor, su carrera (elegida una sola vez), a qué beca
 * apunta (media o completa, que sí se puede cambiar en la misma fila) y cuánto lleva de su meta, en libros bonificables o
 * en compra a la CES según «Ver avance en». Todo se guarda desde la fila, sin abrir una ficha.
 */
export function TablaBecas({
  resuelto,
  becas,
  estado,
  unidad,
}: {
  resuelto: AmbitoResuelto;
  becas: DatosDeBecas | null;
  estado: EstadoDeBecas;
  unidad: UnidadDeAvance;
}) {
  const [eligiendoId, setEligiendoId] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  // Tras guardar la carrera se enfoca el primer botón de «Apunta a» de esa fila; al cancelar, el botón que la abrió.
  const focoPendiente = useRef<string | null>(null);

  useEffect(() => {
    const clave = focoPendiente.current;
    if (!clave) return;
    const destino = Array.from(raiz.current?.querySelectorAll<HTMLElement>("[data-foco-beca]") ?? []).find(
      (el) => el.dataset.focoBeca === clave,
    );
    if (destino) {
      focoPendiente.current = null;
      destino.focus();
    }
  });

  if (becas === null) {
    return (
      <p role="status" className="px-[18px] py-6 text-center text-chico text-tinta-suave">
        Las becas todavía no están conectadas a la base de datos. Cuando lo estén, vas a ver acá la carrera, a qué beca apunta y el avance de cada colportor.
      </p>
    );
  }

  return (
    <div ref={raiz}>
      <p role="status" className="sr-only">
        {estado.aviso}
      </p>
      <table aria-label="Becas de cada colportor" className="w-full table-fixed border-collapse">
        <colgroup>
          <col className="w-[22%]" />
          <col className="w-[24%]" />
          <col className="w-[172px]" />
          <col />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-superficie">
          <tr className="border-b border-borde text-etiqueta font-semibold tracking-[0.06em] text-tinta-suave">
            <th scope="col" className="px-[18px] py-[9px] text-left font-semibold">
              COLPORTOR
            </th>
            <th scope="col" className="px-2 py-[9px] text-left font-semibold">
              CARRERA
            </th>
            <th scope="col" className="px-2 py-[9px] text-left font-semibold">
              APUNTA A
            </th>
            <th scope="col" className="py-[9px] pr-[18px] pl-2 text-left font-semibold">
              {unidad === "libros" ? "AVANCE · LIBROS BONIFICABLES" : "AVANCE · COMPRA A LA CES"}
            </th>
          </tr>
        </thead>
        <tbody>
          {resuelto.grupos.map((grupo) => (
            <Fragment key={grupo.clave}>
              {resuelto.conCabeceras && (
                <CabeceraDeGrupo nombre={grupo.nombre} cantidad={pluralColportores(grupo.colportores.length)} columnas={COLUMNAS} />
              )}
              {grupo.colportores.map((c) => {
                const carrera = estado.porColportor[c.id]?.carrera ?? null;
                const abierto = eligiendoId === c.id && carrera === null;
                const guardando = estado.guardando.has(c.id);
                const error = estado.errores[c.id];
                return (
                  <Fragment key={c.id}>
                    <tr className="min-h-12 border-b border-borde-suave text-cuerpo">
                      <th scope="row" className="px-[18px] py-2.5 text-left align-middle font-semibold text-tinta">
                        <span className="block wrap-anywhere">{c.nombre}</span>
                      </th>
                      <td className="px-2 py-2.5 align-middle">
                        {carrera ? (
                          <span className="flex min-w-0 flex-col">
                            <span className="wrap-anywhere">{carrera.nombre}</span>
                            <span className="text-[10.5px] text-tinta-suave">elegida el {diaYMes(carrera.elegidaEl)}</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            data-foco-beca={`elegir:${c.id}`}
                            aria-expanded={abierto}
                            aria-label={`Elegir carrera de ${c.nombre}`}
                            onClick={() => (abierto ? setEligiendoId(null) : setEligiendoId(c.id))}
                            className={CLASE_BOTON_PRIMARIO}
                          >
                            Elegir carrera
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-2.5 align-middle">
                        {carrera ? <ApuntaA colportor={c} estado={estado} /> : <span className="text-tinta-tenue">—</span>}
                      </td>
                      <td className="py-2.5 pr-[18px] pl-2 align-middle">
                        <Avance colportor={c} estado={estado} unidad={unidad} />
                      </td>
                    </tr>
                    {abierto && (
                      <tr>
                        <td colSpan={COLUMNAS} className="p-0">
                          <ElegirCarrera
                            colportor={c}
                            carreras={becas.carreras}
                            guardando={guardando}
                            error={error}
                            alGuardar={(carreraId) => {
                              focoPendiente.current = `apunta:${c.id}:media`;
                              estado.elegirCarrera({ id: c.id, nombre: c.nombre }, carreraId);
                            }}
                            alCancelar={() => {
                              focoPendiente.current = `elegir:${c.id}`;
                              setEligiendoId(null);
                            }}
                          />
                        </td>
                      </tr>
                    )}
                    {!abierto && error && (
                      <tr>
                        <td colSpan={COLUMNAS} className="p-0">
                          <p role="alert" className="border-b border-borde bg-peligro-fondo py-2 pr-[18px] pl-[18px] text-chico wrap-anywhere text-peligro">
                            {error}
                          </p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
