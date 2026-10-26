"use client";

import { Fragment, useEffect, useRef, useState } from "react";

import type { CarreraDelCatalogo, ColportorDeEquipo, DatosDeBecas, TipoDeBeca } from "@/datos/equipo/contrato";
import { diaYMes } from "@/lib/dias";
import { cn } from "@/lib/utils";

import {
  armarTablaDeBecas,
  BANDAS_DE_AVANCE,
  ESTADOS,
  etiquetaDeEstado,
  hayFiltros,
  OPCIONES_DE_FILTRO_DE_TIPO,
  textoDeOrden,
  type ColumnaDeBecas,
  type EstadoDeBeca,
  type FiltroDeAvance,
  type FiltroDeTipo,
  type FiltrosDeBecas,
  type OrdenDeBecas,
} from "./becas-tabla";
import { avanceDeBeca, OPCIONES_DE_TIPO, pluralColportores, type AmbitoResuelto, type UnidadDeAvance } from "./modelo";
import type { EstadoDeBecas } from "./useBecas";
import type { VistaDeBecas } from "./useVistaDeBecas";
import { CabeceraDeGrupo, CLASE_BOTON_PRIMARIO, CLASE_BOTON_SECUNDARIO } from "./TablaZonas";

const COLUMNAS = 5;
const SIN_FIJAR: ReadonlySet<string> = new Set();

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
        Sin meta: no apunta a ninguna beca
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

function ApuntaA({
  colportor,
  estado,
  alTocar,
}: {
  colportor: ColportorDeEquipo;
  estado: EstadoDeBecas;
  alTocar: (tipo: TipoDeBeca | null) => void;
}) {
  const beca = estado.porColportor[colportor.id];
  // «Sin beca» es null: lo pedido puede ser null, así que se mira si hay un pedido y no si el valor es null.
  const marcado = colportor.id in estado.pedido ? estado.pedido[colportor.id] : (beca?.apuntaA ?? null);
  return (
    <span role="group" aria-label={`A qué beca apunta ${colportor.nombre}`} className="inline-flex overflow-hidden rounded-control border border-borde bg-superficie">
      {OPCIONES_DE_TIPO.map(({ tipo, etiqueta }) => {
        const activo = marcado === tipo;
        const clave = tipo ?? "ninguna";
        return (
          <button
            key={clave}
            type="button"
            data-foco-beca={`apunta:${colportor.id}:${clave}`}
            aria-pressed={activo}
            aria-label={`${tipo === null ? "Dejar sin beca" : `Apuntar a ${tipo === "media" ? "media beca" : "beca completa"}`}: ${colportor.nombre}`}
            onClick={() => {
              alTocar(tipo);
              estado.asignarTipo({ id: colportor.id, nombre: colportor.nombre }, tipo);
            }}
            className={cn(
              "inline-flex min-h-8 items-center border-l border-borde px-3 text-chico font-semibold whitespace-nowrap first:border-l-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-acento",
              activo ? "bg-marca text-superficie" : "bg-superficie text-tinta-2 hover:bg-marca-clara",
            )}
          >
            {etiqueta}
          </button>
        );
      })}
    </span>
  );
}

function EstadoDeLaFila({ estado }: { estado: EstadoDeBeca }) {
  return (
    <span
      className={cn(
        "wrap-anywhere",
        (estado === "media" || estado === "completa") && "font-semibold text-exito",
        (estado === "sin-carrera" || estado === "sin-beca") && "text-tinta-suave",
      )}
    >
      {etiquetaDeEstado(estado)}
    </span>
  );
}

const CLASE_SELECTOR =
  "min-h-8 max-w-56 rounded-control border border-borde bg-superficie px-2 text-chico font-normal text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento";

function Selector({
  etiqueta,
  valor,
  opciones,
  alElegir,
}: {
  etiqueta: string;
  valor: string;
  opciones: { valor: string; etiqueta: string }[];
  alElegir: (valor: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-chico font-semibold text-tinta-2">
      {etiqueta}
      <select value={valor} onChange={(evento) => alElegir(evento.target.value)} className={CLASE_SELECTOR}>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Estado, carrera, tipo y avance; la ciudad y el departamento se eligen en la lista de la izquierda. */
function BarraDeFiltros({
  vista,
  carreras,
  unidad,
  total,
  coinciden,
}: {
  vista: VistaDeBecas;
  carreras: CarreraDelCatalogo[];
  unidad: UnidadDeAvance;
  total: number;
  coinciden: number;
}) {
  const { filtros, filtrar, limpiarFiltros } = vista;
  const filtrando = hayFiltros(filtros);
  return (
    <div role="group" aria-label="Filtrar las becas" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-borde px-[18px] py-2.5">
      <Selector
        etiqueta="Estado"
        valor={filtros.estado}
        opciones={[{ valor: "todos", etiqueta: "Todos" }, ...ESTADOS.map((e) => ({ valor: e.valor, etiqueta: e.etiqueta }))]}
        alElegir={(valor) => filtrar({ estado: valor as FiltrosDeBecas["estado"] })}
      />
      <Selector
        etiqueta="Carrera"
        valor={filtros.carrera}
        opciones={[
          { valor: "todas", etiqueta: "Todas" },
          ...carreras.map((c) => ({ valor: c.id, etiqueta: c.nombre })),
          { valor: "sin-carrera", etiqueta: "Sin carrera elegida" },
        ]}
        alElegir={(valor) => filtrar({ carrera: valor })}
      />
      <Selector
        etiqueta="Apunta a"
        valor={filtros.tipo}
        opciones={[{ valor: "todos", etiqueta: "Todos" }, ...OPCIONES_DE_FILTRO_DE_TIPO]}
        alElegir={(valor) => filtrar({ tipo: valor as FiltroDeTipo })}
      />
      <Selector
        etiqueta={unidad === "libros" ? "Avance en libros" : "Avance en compra a la CES"}
        valor={filtros.avance}
        opciones={[{ valor: "todos", etiqueta: "Todos" }, ...BANDAS_DE_AVANCE]}
        alElegir={(valor) => filtrar({ avance: valor as FiltroDeAvance })}
      />
      {filtrando && (
        <>
          <button type="button" onClick={limpiarFiltros} className={CLASE_BOTON_SECUNDARIO}>
            Limpiar filtros
          </button>
          <p role="status" className="text-chico text-tinta-suave">
            {coinciden} de {pluralColportores(total)}
          </p>
        </>
      )}
    </div>
  );
}

function Encabezado({
  columna,
  etiqueta,
  orden,
  alOrdenar,
  clase,
}: {
  columna: ColumnaDeBecas;
  etiqueta: string;
  orden: OrdenDeBecas;
  alOrdenar: (columna: ColumnaDeBecas) => void;
  clase: string;
}) {
  const sentido = orden !== null && orden.columna === columna ? orden.sentido : null;
  return (
    <th scope="col" aria-sort={sentido === null ? undefined : sentido === "asc" ? "ascending" : "descending"} className={clase}>
      <button
        type="button"
        onClick={() => alOrdenar(columna)}
        className="inline-flex min-h-6 items-center gap-1 text-left font-semibold tracking-[0.06em] hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
      >
        {etiqueta}
        <span aria-hidden="true">{sentido === null ? "↕" : sentido === "asc" ? "▲" : "▼"}</span>
      </button>
    </th>
  );
}

/**
 * Pestaña «Becas» de la vista 33 (HU-BEC-004, HU-BEC-006): por colportor, su carrera (elegida una sola vez), a qué beca
 * apunta (media, completa o sin beca, que sí se puede cambiar en la misma fila), su estado y cuánto lleva de su meta, en
 * libros bonificables o en compra a la CES según «Ver avance en». Se filtra por estado, carrera, tipo y avance, y se
 * ordena por cualquier columna. Todo se guarda desde la fila, sin abrir una ficha.
 */
export function TablaBecas({
  resuelto,
  becas,
  estado,
  unidad,
  vista,
}: {
  resuelto: AmbitoResuelto;
  becas: DatosDeBecas | null;
  estado: EstadoDeBecas;
  unidad: UnidadDeAvance;
  vista: VistaDeBecas;
}) {
  const [eligiendoId, setEligiendoId] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  // Tras guardar la carrera se enfoca el primer botón de «Apunta a» de esa fila; al cancelar, el botón que la abrió.
  const focoPendiente = useRef<string | null>(null);
  // El botón de «Apunta a» que se tocó, hasta que termine de guardar: si la fila cambia de lugar al ordenar y el navegador
  // le saca el foco, se le devuelve.
  const focoTocado = useRef<{ id: string; clave: string } | null>(null);

  // Los que se tocaron siguen a la vista aunque dejen de cumplir el filtro, hasta que se cambia el filtro o el orden.
  // `vista.version` sube con cada cambio de filtro u orden, así que un fijado de antes no revive si se vuelve al mismo filtro.
  const [fijadosPor, setFijadosPor] = useState<{ version: number; ids: ReadonlySet<string> }>({ version: -1, ids: SIN_FIJAR });
  const fijados = fijadosPor.version === vista.version ? fijadosPor.ids : SIN_FIJAR;
  const fijar = (id: string) =>
    setFijadosPor((actual) => ({ version: vista.version, ids: new Set([...(actual.version === vista.version ? actual.ids : []), id]) }));

  useEffect(() => {
    const buscar = (clave: string) =>
      Array.from(raiz.current?.querySelectorAll<HTMLElement>("[data-foco-beca]") ?? []).find((el) => el.dataset.focoBeca === clave);
    const clave = focoPendiente.current;
    if (clave) {
      const destino = buscar(clave);
      if (destino) {
        focoPendiente.current = null;
        destino.focus();
      }
    }
    const tocado = focoTocado.current;
    if (tocado) {
      if (!estado.guardando.has(tocado.id)) focoTocado.current = null;
      const ocioso = document.activeElement === null || document.activeElement === document.body;
      if (ocioso) buscar(tocado.clave)?.focus();
    }
  });

  if (becas === null) {
    return (
      <p role="status" className="px-[18px] py-6 text-center text-chico text-tinta-suave">
        Las becas todavía no están conectadas a la base de datos. Cuando lo estén, vas a ver acá la carrera, a qué beca apunta y el avance de cada colportor.
      </p>
    );
  }

  const tabla = armarTablaDeBecas({
    resuelto,
    porColportor: estado.porColportor,
    carreras: becas.carreras,
    unidad,
    filtros: vista.filtros,
    orden: vista.orden,
    fijados,
  });
  const claseEncabezado = "px-2 py-[9px] text-left font-semibold";

  return (
    <div ref={raiz}>
      <p role="status" className="sr-only">
        {estado.aviso}
      </p>
      <p aria-live="polite" className="sr-only">
        {vista.orden === null ? "" : textoDeOrden(vista.orden)}
      </p>
      <BarraDeFiltros vista={vista} carreras={becas.carreras} unidad={unidad} total={tabla.total} coinciden={tabla.coinciden} />
      <table aria-label="Becas de cada colportor" className="w-full table-fixed border-collapse">
        <colgroup>
          <col className="w-[20%]" />
          <col className="w-[20%]" />
          <col className="w-[232px]" />
          <col className="w-[136px]" />
          <col />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-superficie">
          <tr className="border-b border-borde text-etiqueta text-tinta-suave">
            <Encabezado columna="colportor" etiqueta="COLPORTOR" orden={vista.orden} alOrdenar={vista.ordenarPor} clase="px-[18px] py-[9px] text-left font-semibold" />
            <Encabezado columna="carrera" etiqueta="CARRERA" orden={vista.orden} alOrdenar={vista.ordenarPor} clase={claseEncabezado} />
            <Encabezado columna="apunta" etiqueta="APUNTA A" orden={vista.orden} alOrdenar={vista.ordenarPor} clase={claseEncabezado} />
            <Encabezado columna="estado" etiqueta="ESTADO" orden={vista.orden} alOrdenar={vista.ordenarPor} clase={claseEncabezado} />
            <Encabezado
              columna="avance"
              etiqueta={unidad === "libros" ? "AVANCE · LIBROS BONIFICABLES" : "AVANCE · COMPRA A LA CES"}
              orden={vista.orden}
              alOrdenar={vista.ordenarPor}
              clase="py-[9px] pr-[18px] pl-2 text-left font-semibold"
            />
          </tr>
        </thead>
        <tbody>
          {tabla.coinciden === 0 && (
            <tr>
              <td colSpan={COLUMNAS} className="px-[18px] py-6 text-center">
                <p role="status" className="text-chico text-tinta-suave">
                  Ningún colportor coincide con estos filtros. Probá con otros o tocá «Limpiar filtros» para ver a todos.
                </p>
              </td>
            </tr>
          )}
          {tabla.grupos.map((grupo) => (
            <Fragment key={grupo.clave}>
              {resuelto.conCabeceras && !tabla.plana && (
                <CabeceraDeGrupo nombre={grupo.nombre} cantidad={pluralColportores(grupo.filas.length)} columnas={COLUMNAS} />
              )}
              {grupo.filas.map((fila) => {
                const c = fila.colportor;
                const carrera = estado.porColportor[c.id]?.carrera ?? null;
                const abierto = eligiendoId === c.id && carrera === null;
                const guardando = estado.guardando.has(c.id);
                const error = estado.errores[c.id];
                return (
                  <Fragment key={c.id}>
                    <tr className="min-h-12 border-b border-borde-suave text-cuerpo">
                      <th scope="row" className="px-[18px] py-2.5 text-left align-middle font-semibold text-tinta">
                        <span className="block wrap-anywhere">{c.nombre}</span>
                        {tabla.plana && resuelto.conCabeceras && (
                          <span className="block text-[10.5px] font-normal wrap-anywhere text-tinta-suave">{fila.ciudad}</span>
                        )}
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
                        {carrera ? (
                          <ApuntaA
                            colportor={c}
                            estado={estado}
                            alTocar={(tipo) => {
                              fijar(c.id);
                              focoTocado.current = { id: c.id, clave: `apunta:${c.id}:${tipo ?? "ninguna"}` };
                            }}
                          />
                        ) : (
                          <span className="text-tinta-tenue">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 align-middle">
                        <EstadoDeLaFila estado={fila.estado} />
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
                              fijar(c.id);
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
