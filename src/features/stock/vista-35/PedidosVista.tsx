"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AccionNoDisponible } from "@/components/AccionNoDisponible";
import type { AccionesPedidos, DatosDePedidos, ResultadoDeAccion, SolicitudResuelta } from "@/datos/stock/pedidos";
import { mensajeSinConexion } from "@/lib/mensajes";
import { cn } from "@/lib/utils";
import { registrarEnvio } from "@/shell/trabajo-pendiente";

import { ListaDeCiudades, RielDeCiudades } from "../vista-34/ListaDeCiudades";
import { construirRiel } from "../vista-34/modelo";
import { BandejaDePedidos } from "./BandejaDePedidos";
import { DetalleDePedido } from "./DetalleDePedido";
import {
  AMBITO_TODAS,
  aplicarResolucion,
  claveQueLaReemplaza,
  claveVigente,
  construirDetalle,
  construirFilas,
  construirLista,
  construirMundo,
  contarPestanas,
  decisionDe,
  estaEnPestana,
  estadoDeResolucion,
  mismoAmbito,
  money,
  resolverAmbito,
  solicitudesDe,
  textoDeDecision,
  textoDePestanaVacia,
  type Ambito,
  type Pestana,
  type Solicitud,
} from "./modelo";

interface Aviso {
  id: number;
  tipo: "exito" | "error";
  texto: string;
}

/** Cuántos avisos quedan a la vista a la vez: los más viejos de lo que salió bien se van primero, los errores se quedan. */
const MAXIMO_DE_AVISOS = 4;

function sinClave<T>(registro: Readonly<Record<string, T>>, clave: string): Record<string, T> {
  return Object.fromEntries(Object.entries(registro).filter(([k]) => k !== clave));
}

function mensajeDeFalla(resultado: Extract<ResultadoDeAccion<unknown>, { ok: false }>, accion: string): string {
  if (resultado.causa === "sin-conexion") return mensajeSinConexion(accion);
  return resultado.mensaje ?? `No se pudo ${accion}. Probá de nuevo; si sigue igual, avisá al equipo.`;
}

/**
 * Vista 35: pedidos y transferencias. A la izquierda la lista de ciudades (que se contrae); a la derecha las pestañas por
 * estado con la bandeja y, al lado, el pedido elegido con todo lo necesario para autorizarlo o rechazarlo. Cambiar de ciudad
 * o de pestaña no pide nada al servidor. Las decisiones salen por `acciones`: una por pedido a la vez (el doble toque se
 * ignora) y en orden entre pedidos, así dos seguidas no se pisan ni se pierde ninguna; si una falla, el botón vuelve a
 * poder usarse y el aviso dice qué pasó.
 */
export function PedidosVista({ datos: inicial, acciones }: { datos: DatosDePedidos; acciones: AccionesPedidos }) {
  const [datos, setDatos] = useState(inicial);
  const [ambito, setAmbito] = useState<Ambito>(AMBITO_TODAS);
  const [listaAbierta, setListaAbierta] = useState(true);
  const [pestana, setPestana] = useState<Pestana>("PEND");
  const [elegida, setElegida] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState<ReadonlySet<string>>(new Set());
  const [borradores, setBorradores] = useState<Readonly<Record<string, string>>>({});
  const [enCurso, setEnCurso] = useState<ReadonlySet<string>>(new Set());
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  const raiz = useRef<HTMLDivElement>(null);
  const focoPendiente = useRef<string | null>(null);
  const enCursoRef = useRef(new Set<string>());
  const cola = useRef<Promise<unknown>>(Promise.resolve());
  const numeroDeAviso = useRef(0);

  const mundo = useMemo(() => construirMundo(datos), [datos]);
  const resuelto = useMemo(() => resolverAmbito(mundo, ambito), [mundo, ambito]);
  const lista = useMemo(() => construirLista(mundo, resuelto), [mundo, resuelto]);
  const riel = useMemo(() => construirRiel(lista), [lista]);
  const pestanas = useMemo(() => contarPestanas(resuelto), [resuelto]);
  const solicitudes = useMemo(() => solicitudesDe(resuelto, pestana), [resuelto, pestana]);
  const filas = useMemo(() => construirFilas(mundo, solicitudes), [mundo, solicitudes]);
  const clave = claveVigente(filas, elegida);
  const abierta = clave === null ? undefined : solicitudes.find((s) => s.clave === clave);
  const detalle = useMemo(() => (abierta ? construirDetalle(mundo, abierta) : null), [mundo, abierta]);

  // Lo que las respuestas que llegan tarde necesitan saber de «ahora»: qué estaba abierto y cómo era la lista.
  const ultimo = useRef({ clave, filas, pestana });
  useEffect(() => {
    ultimo.current = { clave, filas, pestana };
  });

  // Tras un cambio que quita o apaga el botón apretado, el foco vuelve a un lugar con sentido.
  useEffect(() => {
    const destino = focoPendiente.current;
    if (!destino) return;
    focoPendiente.current = null;
    const el = Array.from(raiz.current?.querySelectorAll<HTMLElement>("[data-foco]") ?? []).find((x) => x.dataset.foco === destino);
    el?.focus();
    el?.scrollIntoView?.({ block: "nearest" });
  });

  const elegirAmbito = (destino: Ambito) => {
    if (mismoAmbito(ambito, destino)) return;
    setAmbito(destino);
    setElegida(null);
  };

  const elegirPestana = (destino: Pestana, conFoco: boolean) => {
    setPestana(destino);
    setElegida(null);
    if (conFoco) focoPendiente.current = `pestana-${destino}`;
  };

  const avisar = useCallback((tipo: Aviso["tipo"], texto: string) => {
    numeroDeAviso.current += 1;
    const nuevo = { id: numeroDeAviso.current, tipo, texto };
    setAvisos((previos) => {
      const todos = [...previos, nuevo];
      while (todos.length > MAXIMO_DE_AVISOS) {
        const i = todos.findIndex((a) => a.tipo === "exito");
        todos.splice(i >= 0 ? i : 0, 1);
      }
      return todos;
    });
  }, []);

  const ejecutar = useCallback(
    async (s: Solicitud, accion: "autorizar" | "rechazar", motivo: string) => {
      const verbo = accion === "autorizar" ? "autorizar" : "rechazar";
      const que = s.tipo === "pedido" ? `el pedido ${s.numero}` : `la transferencia ${s.numero}`;
      try {
        let resultado: ResultadoDeAccion<SolicitudResuelta>;
        try {
          resultado = await acciones.decidir(decisionDe(s, accion, motivo));
        } catch {
          resultado = { ok: false, causa: "sin-conexion" };
        }
        if (!resultado.ok) {
          avisar("error", mensajeDeFalla(resultado, `${verbo} ${que}`));
          return;
        }
        const resuelta = resultado.valor;
        const { clave: abiertaAhora, filas: filasAntes, pestana: pestanaAhora } = ultimo.current;
        const eraLaAbierta = abiertaAhora === s.clave;
        setDatos((previos) => aplicarResolucion(previos, resuelta));
        setRechazando((previos) => {
          const siguientes = new Set(previos);
          siguientes.delete(s.clave);
          return siguientes;
        });
        setBorradores((previos) => sinClave(previos, s.clave));
        avisar("exito", textoDeDecision(s, accion));
        // Si era el que se estaba mirando, se pasa al siguiente de la lista (si sale de la pestaña) y el foco va al detalle.
        if (eraLaAbierta) {
          const sigueEnPestana = estaEnPestana({ ...s, estado: estadoDeResolucion(resuelta) }, pestanaAhora);
          const proxima = sigueEnPestana ? s.clave : claveQueLaReemplaza(filasAntes, s.clave);
          setElegida(proxima);
          focoPendiente.current = proxima !== null ? "detalle" : `pestana-${pestanaAhora}`;
        }
      } finally {
        enCursoRef.current.delete(s.clave);
        setEnCurso(new Set(enCursoRef.current));
      }
    },
    [acciones, avisar],
  );

  /** Una decisión por pedido a la vez (el doble toque se ignora) y en orden entre pedidos; cuenta como trabajo sin contestar. */
  const decidir = (s: Solicitud, accion: "autorizar" | "rechazar", motivo = "") => {
    if (enCursoRef.current.has(s.clave)) return;
    enCursoRef.current.add(s.clave);
    setEnCurso(new Set(enCursoRef.current));
    const trabajo = cola.current.then(() => ejecutar(s, accion, motivo));
    cola.current = trabajo.catch(() => undefined);
    registrarEnvio(trabajo);
  };

  const abrirRechazo = (s: Solicitud) => {
    setRechazando((previos) => new Set(previos).add(s.clave));
    focoPendiente.current = "motivo";
  };

  const cancelarRechazo = (s: Solicitud) => {
    setRechazando((previos) => {
      const siguientes = new Set(previos);
      siguientes.delete(s.clave);
      return siguientes;
    });
    setBorradores((previos) => sinClave(previos, s.clave));
    focoPendiente.current = "rechazar";
  };

  const vacio = mundo.todas.length === 0;

  return (
    <div ref={raiz} className={cn("grid min-h-0 flex-1 bg-fondo", listaAbierta ? "grid-cols-[320px_minmax(0,1fr)]" : "grid-cols-[68px_minmax(0,1fr)]")}>
      {listaAbierta ? (
        <ListaDeCiudades
          lista={lista}
          alElegir={elegirAmbito}
          alContraer={() => {
            focoPendiente.current = "alternar";
            setListaAbierta(false);
          }}
        />
      ) : (
        <RielDeCiudades
          items={riel}
          alElegir={elegirAmbito}
          alExpandir={() => {
            focoPendiente.current = "alternar";
            setListaAbierta(true);
          }}
        />
      )}

      <div className="flex min-h-0 min-w-0 flex-col gap-3.5 overflow-hidden px-[22px] pt-[18px] pb-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-[3px]">
            <h2 className="font-serif text-[22px] font-semibold wrap-anywhere text-tinta">{resuelto.titulo}</h2>
            <p className="text-chico text-tinta-suave">{resuelto.subtitulo}</p>
          </div>
          <div className="flex flex-none items-center gap-2.5">
            <span className="text-chico text-tinta-2">
              {mundo.limite === null ? (
                "Sin límite de deuda fijado"
              ) : (
                <>
                  Límite de deuda por colportor: <b className="font-mono font-medium">{money(mundo.limite)}</b>
                </>
              )}
            </span>
            {/* Cómo se edita el límite (y si es de la campaña o de cada colportor) no está resuelto: queda inerte. */}
            <AccionNoDisponible className="inline-flex min-h-8 items-center rounded-control border border-borde bg-superficie px-3.5 text-chico font-semibold whitespace-nowrap text-tinta-2">
              Editar límite
            </AccionNoDisponible>
          </div>
        </div>

        <div aria-live="polite" className="flex flex-col gap-2 empty:hidden">
          {avisos.map((aviso) => (
            <div
              key={aviso.id}
              role={aviso.tipo === "error" ? "alert" : "status"}
              className={cn(
                "flex items-center justify-between gap-3 rounded-control px-3 py-2 text-chico",
                aviso.tipo === "error" ? "bg-peligro-fondo text-peligro" : "bg-exito-fondo text-exito",
              )}
            >
              <span className="wrap-anywhere">{aviso.tipo === "exito" ? `✓ ${aviso.texto}` : aviso.texto}</span>
              <button
                type="button"
                aria-label="Cerrar el aviso"
                onClick={() => setAvisos((previos) => previos.filter((a) => a.id !== aviso.id))}
                className="inline-flex min-h-6 min-w-6 cursor-pointer items-center justify-center rounded-sm focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
          ))}
        </div>

        {vacio ? (
          <p role="status" className="rounded-tarjeta border border-borde bg-superficie px-[18px] py-6 text-center text-chico text-tinta-suave">
            Todavía no hay pedidos ni transferencias en esta campaña. Cuando un colportor arme uno desde su teléfono, aparece acá para autorizarlo.
          </p>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_560px] gap-4">
            <BandejaDePedidos
              pestanas={pestanas}
              pestanaActiva={pestana}
              alElegirPestana={elegirPestana}
              filas={filas}
              claveAbierta={clave}
              alElegirFila={setElegida}
              textoVacio={textoDePestanaVacia(pestana, resuelto.lugar)}
              nombreDeLaLista={`Pedidos de ${resuelto.titulo}`}
            />
            <div className="min-h-0 overflow-x-hidden overflow-y-auto rounded-tarjeta border border-borde bg-superficie px-[18px] py-4">
              {detalle && abierta ? (
                <DetalleDePedido
                  key={detalle.clave}
                  detalle={detalle}
                  ocupado={enCurso.has(detalle.clave)}
                  rechazando={rechazando.has(detalle.clave)}
                  motivoInicial={borradores[detalle.clave] ?? ""}
                  alAutorizar={() => decidir(abierta, "autorizar")}
                  alAbrirRechazo={() => abrirRechazo(abierta)}
                  alCancelarRechazo={() => cancelarRechazo(abierta)}
                  alConfirmarRechazo={(motivo) => decidir(abierta, "rechazar", motivo)}
                  alCambiarMotivo={(texto) => setBorradores((previos) => ({ ...previos, [abierta.clave]: texto }))}
                />
              ) : (
                <p className="text-chico text-tinta-suave">Acá vas a ver el detalle del pedido o de la transferencia que elijas en la lista.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
