"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { AccionNoDisponible } from "@/components/AccionNoDisponible";
import type { AccionesCuentas, DatosDeCuentas, NuevoRetiro, ResultadoDeAccion } from "@/datos/cuentas";
import { diaEnMontevideo } from "@/datos/cuentas/fechas";
import { SeccionHu } from "@/dev/SeccionHu";
import { ColumnaDeCiudades } from "@/features/cuentas/ColumnaDeCiudades";
import { EncabezadoDeCuentas } from "@/features/cuentas/EncabezadoDeCuentas";
import { FormularioDeRetiro } from "@/features/cuentas/FormularioDeRetiro";
import { Pastilla, TablaDeFilas, type ColumnaDeTabla } from "@/features/cuentas/TablaDeFilas";
import { TablaDeTickets } from "@/features/cuentas/TablaDeTickets";
import { formatMonto } from "@/features/cuentas/formato";
import {
  aplicarAlquiler,
  aplicarTicket,
  avisoDePendientes,
  ciudadesDe,
  colportoresDe,
  elementosDeLista,
  estadoDeAlquiler,
  fechaDeCuenta,
  filasDe,
  kpisDeAlquiler,
  kpisDeCasaEditora,
  kpisDeTickets,
  ordenarFilas,
  pendientesDe,
  plural,
  porcentajeCobrado,
  seleccionVigente,
  siguienteOrden,
  subtituloDeSeleccion,
  ticketsDe,
  tituloDeSeleccion,
  TODAS,
  type ColumnaOrdenable,
  type Kpi,
  type Orden,
  type Seleccion,
} from "@/features/cuentas/modelo";
import { mensajeSinConexion } from "@/lib/mensajes";
import { cn } from "@/lib/utils";
import { registrarEnvio } from "@/shell/trabajo-pendiente";

type Pestana = "casa-editora" | "alquiler" | "tickets";

const PESTANAS: Array<{ id: Pestana; rotulo: string }> = [
  { id: "casa-editora", rotulo: "Casa editora" },
  { id: "alquiler", rotulo: "Alquiler" },
  { id: "tickets", rotulo: "Tickets" },
];

const COLUMNAS_CASA_EDITORA: ColumnaDeTabla[] = [
  { rotulo: "COLPORTOR", ordenable: "colportor" },
  { rotulo: "DEUDA", derecha: true, ordenable: "deuda" },
  { rotulo: "DEPOSITADO", derecha: true, ordenable: "depositado" },
  { rotulo: "EN MANO", derecha: true, ordenable: "enMano" },
  { rotulo: "POR COBRAR", derecha: true, ordenable: "porCobrar" },
  { rotulo: "COBRADO", derecha: true, ordenable: "cobrado" },
  { rotulo: "ÚLT. DEPÓSITO", ordenable: "ultimoDeposito" },
];
const PLANTILLA_CASA_EDITORA = "grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))_minmax(0,.7fr)_minmax(0,.8fr)]";

const COLUMNAS_ALQUILER: ColumnaDeTabla[] = [
  { rotulo: "COLPORTOR", ordenable: "colportor" },
  { rotulo: "ALQUILER", derecha: true },
  { rotulo: "PAGADO", derecha: true, ordenable: "pagado" },
  { rotulo: "DEBE", derecha: true, ordenable: "debe" },
  { rotulo: "ÚLTIMO PAGO", ordenable: "ultimoPago" },
  { rotulo: "ESTADO" },
];
const PLANTILLA_ALQUILER = "grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))_minmax(0,.8fr)_minmax(0,1fr)]";

function FranjaDeCifras({ kpis }: { kpis: Kpi[] }) {
  return (
    <dl className="grid grid-cols-4 gap-3.5">
      {kpis.map((k) => (
        <div key={k.rotulo} className="flex min-w-0 flex-col gap-0.5 rounded-tarjeta border border-borde bg-superficie px-4 py-3">
          <dt className="text-etiqueta font-semibold tracking-etiqueta text-tinta-suave">{k.rotulo}</dt>
          <dd className="m-0 flex items-baseline gap-2">
            <span className="font-serif text-[26px] font-semibold text-marca">{k.valor}</span>
            {k.extra && <span className="truncate text-[11.5px] text-tinta-2">{k.extra}</span>}
          </dd>
          <dd className="m-0 truncate text-mini text-tinta-suave">{k.detalle}</dd>
        </div>
      ))}
    </dl>
  );
}

type Aviso = { tipo: "exito" | "error"; texto: string };

function mensajeDeFalla<T>(resultado: Extract<ResultadoDeAccion<T>, { ok: false }>, accion: string): string {
  if (resultado.causa === "sin-conexion") return mensajeSinConexion(accion);
  return resultado.mensaje ?? `No se pudo ${accion}. Probá de nuevo; si sigue igual, avisá al equipo.`;
}

/**
 * La vista 36: Cuentas. Una tabla por tema (Casa editora, Alquiler, Tickets) con la lista de ciudades como filtro. Los datos
 * llegan por props y las escrituras (editar el alquiler, registrar un retiro) por `acciones`, de a una por vez: mientras una
 * está en camino, la otra y el doble toque se ignoran, y si falla todo vuelve a poder usarse.
 */
export function CuentasVista({ datos: inicial, acciones }: { datos: DatosDeCuentas; acciones: AccionesCuentas }) {
  const [datos, setDatos] = useState(inicial);
  const [seleccionada, setSeleccionada] = useState<Seleccion>(TODAS);
  const [contraida, setContraida] = useState(false);
  const [pestana, setPestana] = useState<Pestana>("casa-editora");
  const [colportorFiltrado, setColportorFiltrado] = useState("");
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(new Set());
  const [ordenes, setOrdenes] = useState<Partial<Record<Pestana, Orden | null>>>({});
  const [retiroAbierto, setRetiroAbierto] = useState(false);
  const [editandoAlquiler, setEditandoAlquiler] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorDeAlquiler, setErrorDeAlquiler] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const ocupado = useRef(false);
  const focoPendiente = useRef<string | null>(null);

  // Tras un cambio que quita o apaga el botón apretado, el foco vuelve a un lugar con sentido.
  useEffect(() => {
    if (!focoPendiente.current) return;
    document.querySelector<HTMLElement>(`[data-foco="${focoPendiente.current}"]`)?.focus();
    focoPendiente.current = null;
  });

  const seleccion = seleccionVigente(datos, seleccionada);
  const ciudades = ciudadesDe(datos, seleccion);
  const colportores = colportoresDe(datos, seleccion);
  const conCiudades = ciudades.length > 1;
  const filtro = colportores.some((c) => c.id === colportorFiltrado) ? colportorFiltrado : "";
  const filtrado = colportores.find((c) => c.id === filtro);
  const titulo = tituloDeSeleccion(datos, seleccion);

  const elementos = elementosDeLista(datos);
  const filas = filasDe(datos, seleccion);
  const tickets = ticketsDe(datos, seleccion, filtro);
  const pendientes = pendientesDe(datos, seleccion);

  const orden = ordenes[pestana] ?? null;
  const filasOrdenadas = ordenarFilas(filas, orden);
  const hoy = diaEnMontevideo(datos.ahora) ?? "";
  const alquiler = datos.alquilerPorColportor;

  const sinBanco = new Set(ciudades.filter((c) => !c.hayBanco).map((c) => c.id));
  const elegiblesParaRetiro = colportores
    .filter((c) => sinBanco.has(c.ciudadId))
    .map((c) => ({ id: c.id, nombre: c.nombre, ciudad: ciudades.find((x) => x.id === c.ciudadId)?.nombre ?? "" }));

  /** Una escritura por vez: la segunda mientras la primera está en camino se ignora. Cuenta como trabajo sin contestar. */
  async function escribir<T>(hacer: () => Promise<ResultadoDeAccion<T>>): Promise<ResultadoDeAccion<T> | null> {
    if (ocupado.current) return null;
    ocupado.current = true;
    setGuardando(true);
    const envio: Promise<ResultadoDeAccion<T>> = (async () => {
      try {
        return await hacer();
      } catch {
        return { ok: false, causa: "sin-conexion" } as const;
      }
    })();
    registrarEnvio(envio);
    try {
      return await envio;
    } finally {
      ocupado.current = false;
      setGuardando(false);
    }
  }

  async function guardarRetiro(retiro: NuevoRetiro): Promise<string | null> {
    const resultado = await escribir(() => acciones.registrarRetiro(retiro));
    if (!resultado) return null;
    if (!resultado.ok) return mensajeDeFalla(resultado, "guardar el retiro");
    const ticket = resultado.valor;
    setDatos((previos) => aplicarTicket(previos, ticket));
    const nombre = datos.colportores.find((c) => c.id === ticket.colportorId)?.nombre ?? "el colportor";
    const destino = ticket.destino === "alquiler" ? "al alquiler" : "a la casa editora";
    setAviso({ tipo: "exito", texto: `Retiro de ${formatMonto(ticket.monto)} de ${nombre} guardado y validado: bajó lo que debe ${destino}.` });
    setRetiroAbierto(false);
    focoPendiente.current = "registrar-retiro";
    return null;
  }

  async function guardarAlquiler(monto: number) {
    if (monto === alquiler) {
      setEditandoAlquiler(false);
      focoPendiente.current = "editar-alquiler";
      return;
    }
    setErrorDeAlquiler(null);
    const resultado = await escribir(() => acciones.editarAlquiler(monto));
    if (!resultado) return;
    if (!resultado.ok) {
      setErrorDeAlquiler(mensajeDeFalla(resultado, "guardar el alquiler"));
      return;
    }
    const nuevo = resultado.valor;
    setDatos((previos) => aplicarAlquiler(previos, nuevo));
    setAviso({ tipo: "exito", texto: `Alquiler de la campaña: ${formatMonto(nuevo)} por colportor, para todos los inscriptos.` });
    setEditandoAlquiler(false);
    focoPendiente.current = "editar-alquiler";
  }

  function elegirSeleccion(nueva: Seleccion) {
    setSeleccionada(nueva);
    setColportorFiltrado("");
    // El formulario de retiro es de la selección anterior: sus colportores pueden no estar.
    setRetiroAbierto(false);
  }

  function moverPestana(evento: KeyboardEvent, indice: number) {
    const paso = evento.key === "ArrowRight" ? 1 : evento.key === "ArrowLeft" ? -1 : 0;
    if (!paso && evento.key !== "Home" && evento.key !== "End") return;
    evento.preventDefault();
    const destino =
      evento.key === "Home" ? 0 : evento.key === "End" ? PESTANAS.length - 1 : (indice + paso + PESTANAS.length) % PESTANAS.length;
    setPestana(PESTANAS[destino].id);
    focoPendiente.current = `pestana-${PESTANAS[destino].id}`;
  }

  const alertaDePendientes = pestana === "tickets" ? null : avisoDePendientes(pendientes, datos.ahora);
  const kpis =
    pestana === "casa-editora" ? kpisDeCasaEditora(filas) : pestana === "alquiler" ? kpisDeAlquiler(filas, alquiler) : kpisDeTickets(tickets);
  const puedeRegistrarRetiro = pestana === "tickets" && elegiblesParaRetiro.length > 0;

  return (
    <div className={cn("grid min-h-0 flex-1", contraida ? "grid-cols-[68px_minmax(0,1fr)]" : "grid-cols-[320px_minmax(0,1fr)]")}>
      <ColumnaDeCiudades
        elementos={elementos}
        seleccionada={seleccion}
        contraida={contraida}
        alElegir={elegirSeleccion}
        alAlternar={() => {
          setContraida((c) => !c);
          focoPendiente.current = "alternar-ciudades";
        }}
      />

      <div className="flex min-h-0 min-w-0 flex-col gap-3 overflow-auto px-[22px] pt-[18px] pb-5">
        <EncabezadoDeCuentas
          titulo={titulo}
          subtitulo={subtituloDeSeleccion(datos, seleccion)}
          alquiler={alquiler}
          editando={editandoAlquiler}
          guardando={guardando}
          errorDeGuardado={errorDeAlquiler}
          alEditar={() => {
            setErrorDeAlquiler(null);
            setEditandoAlquiler(true);
          }}
          alGuardarAlquiler={(monto) => void guardarAlquiler(monto)}
          alCancelarEdicion={() => {
            setEditandoAlquiler(false);
            setErrorDeAlquiler(null);
            focoPendiente.current = "editar-alquiler";
          }}
        />

        {aviso && (
          <div
            role={aviso.tipo === "error" ? "alert" : "status"}
            className={cn(
              "flex items-center justify-between gap-3 rounded-control px-3 py-2 text-chico",
              aviso.tipo === "error" ? "bg-peligro-fondo text-peligro" : "bg-exito-fondo text-exito",
            )}
          >
            <span>{aviso.texto}</span>
            <button
              type="button"
              aria-label="Cerrar el aviso"
              onClick={() => setAviso(null)}
              className="inline-flex min-h-6 min-w-6 cursor-pointer items-center justify-center rounded-sm focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none"
            >
              <span aria-hidden>✕</span>
            </button>
          </div>
        )}

        <div role="tablist" aria-label="Tema de las cuentas" className="flex flex-wrap gap-1.5">
          {PESTANAS.map((p, indice) => {
            const activa = p.id === pestana;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                id={`pestana-cuentas-${p.id}`}
                aria-selected={activa}
                aria-controls="panel-cuentas"
                tabIndex={activa ? 0 : -1}
                data-foco={`pestana-${p.id}`}
                onClick={() => setPestana(p.id)}
                onKeyDown={(e) => moverPestana(e, indice)}
                className={cn(
                  "inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-pastilla border px-3.5 text-chico font-semibold whitespace-nowrap focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none",
                  activa ? "border-marca bg-marca text-superficie" : "border-borde bg-superficie text-tinta-2",
                )}
              >
                {p.rotulo}
                {p.id === "tickets" && <span className="font-mono text-mini font-medium">{tickets.length}</span>}
              </button>
            );
          })}
        </div>

        <div id="panel-cuentas" role="tabpanel" aria-labelledby={`pestana-cuentas-${pestana}`} className="flex min-h-0 flex-1 flex-col gap-3">
          <FranjaDeCifras kpis={kpis} />

          {alertaDePendientes && (
            <div className="flex min-h-[46px] items-center gap-2.5 rounded-tarjeta border border-borde bg-superficie py-1.5 pr-1.5 pl-3">
              <span className="flex-none rounded-sm bg-marca-clara px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-marca-media">
                CUENTAS
              </span>
              <span className="min-w-0 text-[12.5px] [overflow-wrap:anywhere]">
                <b className="font-semibold">{alertaDePendientes.titulo}</b> {alertaDePendientes.detalle}
              </span>
              <AccionNoDisponible className="ml-auto inline-flex min-h-8 flex-none items-center rounded-control border border-borde bg-superficie px-3 text-[11.5px] font-semibold text-tinta-2">
                Validar tickets
              </AccionNoDisponible>
            </div>
          )}

          {pestana === "tickets" && (
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
              <label className="flex items-center gap-2.5 text-chico font-semibold text-tinta-2">
                Colportor
                <select
                  value={filtro}
                  onChange={(e) => setColportorFiltrado(e.target.value)}
                  className="min-h-[34px] min-w-60 rounded-control border border-grafico-neutro bg-superficie px-2.5 text-cuerpo font-normal text-tinta focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none"
                >
                  <option value="">Todos los colportores</option>
                  {colportores.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                      {conCiudades ? ` · ${ciudades.find((x) => x.id === c.ciudadId)?.nombre ?? ""}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <span className="text-[11.5px] text-tinta-suave">
                {filtrado
                  ? `${plural(tickets.length, "ticket", "tickets")} de ${filtrado.nombre}`
                  : `${plural(tickets.length, "ticket", "tickets")} en ${titulo}`}
              </span>
              {puedeRegistrarRetiro && !retiroAbierto && (
                <button
                  type="button"
                  data-foco="registrar-retiro"
                  aria-disabled={guardando}
                  onClick={() => {
                    if (!guardando) setRetiroAbierto(true);
                  }}
                  className="ml-auto inline-flex min-h-8 cursor-pointer items-center rounded-control border border-borde bg-superficie px-3.5 text-chico font-semibold text-tinta-2 focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                >
                  Registrar retiro
                </button>
              )}
            </div>
          )}

          {pestana === "tickets" && retiroAbierto && puedeRegistrarRetiro && (
            <FormularioDeRetiro
              elegibles={elegiblesParaRetiro}
              conCiudades={conCiudades}
              colportorInicial={filtro}
              hoy={hoy}
              guardando={guardando}
              alGuardar={guardarRetiro}
              alCancelar={() => {
                setRetiroAbierto(false);
                focoPendiente.current = "registrar-retiro";
              }}
            />
          )}

          {pestana === "casa-editora" && (
            <TablaDeFilas
              nombre="Casa editora"
              columnas={COLUMNAS_CASA_EDITORA}
              plantilla={PLANTILLA_CASA_EDITORA}
              filas={filasOrdenadas}
              conCiudades={conCiudades}
              orden={orden}
              alOrdenar={(c: ColumnaOrdenable) => setOrdenes((o) => ({ ...o, [pestana]: siguienteOrden(o[pestana] ?? null, c) }))}
              textoVacio={`Todavía no hay colportores inscriptos en ${titulo}. Se suman desde Equipo.`}
              celdas={(f) => {
                const cobrado = porcentajeCobrado(f.colportor);
                return [
                  <b key="n" className="font-semibold">{f.colportor.nombre}</b>,
                  <span key="d" className="font-mono font-semibold">{formatMonto(f.colportor.deuda)}</span>,
                  <span key="p" className="font-mono">{formatMonto(f.colportor.depositado)}</span>,
                  <span key="m" className="font-mono">{formatMonto(f.colportor.enMano)}</span>,
                  <span key="c" className="font-mono">{formatMonto(f.colportor.porCobrar)}</span>,
                  <span key="x" className="font-mono">{cobrado === null ? "—" : `${cobrado}%`}</span>,
                  <span key="u" className="font-mono">{f.ultimoDeposito ? fechaDeCuenta(f.ultimoDeposito, datos.ahora) : "—"}</span>,
                ];
              }}
            />
          )}

          {pestana === "alquiler" && (
            <TablaDeFilas
              nombre="Alquiler"
              columnas={COLUMNAS_ALQUILER}
              plantilla={PLANTILLA_ALQUILER}
              filas={filasOrdenadas}
              conCiudades={conCiudades}
              orden={orden}
              alOrdenar={(c: ColumnaOrdenable) => setOrdenes((o) => ({ ...o, [pestana]: siguienteOrden(o[pestana] ?? null, c) }))}
              textoVacio={`Todavía no hay colportores inscriptos en ${titulo}. Se suman desde Equipo.`}
              celdas={(f) => {
                const estado = estadoDeAlquiler(f, alquiler);
                return [
                  <b key="n" className="font-semibold">{f.colportor.nombre}</b>,
                  <span key="a" className="font-mono text-tinta-suave">{formatMonto(alquiler)}</span>,
                  <span key="p" className="font-mono">{formatMonto(f.pagadoAlquiler)}</span>,
                  <span key="d" className="font-mono font-semibold">{formatMonto(f.debeAlquiler)}</span>,
                  <span key="u" className={cn("font-mono", !f.ultimoPagoAlquiler && "text-tinta-tenue")}>
                    {f.ultimoPagoAlquiler ? fechaDeCuenta(f.ultimoPagoAlquiler, datos.ahora) : "—"}
                  </span>,
                  estado === "pagado" ? (
                    <Pastilla key="e" tono="exito">✓ Pagado</Pastilla>
                  ) : estado === "parcial" ? (
                    <Pastilla key="e" tono="marca">Pagó una parte</Pastilla>
                  ) : (
                    <Pastilla key="e" tono="alerta">Debe todo</Pastilla>
                  ),
                ];
              }}
            />
          )}

          {pestana === "tickets" && (
            <SeccionHu hu="HU-COB-008" className="flex min-h-0 flex-1 flex-col">
            <TablaDeTickets
              filas={tickets}
              ahoraIso={datos.ahora}
              conCiudades={conCiudades}
              abiertos={abiertos}
              alAlternar={(id) =>
                setAbiertos((actuales) => {
                  const siguientes = new Set(actuales);
                  if (!siguientes.delete(id)) siguientes.add(id);
                  return siguientes;
                })
              }
              textoVacio={
                filtrado
                  ? `${filtrado.nombre} todavía no tiene tickets. Aparecen cuando sube uno o cuando registrás un retiro.`
                  : `Todavía no hay tickets en ${titulo}. Aparecen cuando un colportor sube uno o cuando registrás un retiro.`
              }
            />
            </SeccionHu>
          )}
        </div>
      </div>
    </div>
  );
}
