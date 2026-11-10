"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent } from "react";

import type { AccionesValidarTickets, DatosDeValidacion, ItemPorValidar, ResultadoDeAccion } from "@/datos/cuentas/validar";
import { useEnLinea } from "@/lib/en-linea";
import { mensajeSinConexion } from "@/lib/mensajes";
import { cn } from "@/lib/utils";
import { esperarYSalir, estaEsperando, hayQueEsperar, registrarEnvio } from "@/shell/trabajo-pendiente";

import { ColaDeTickets } from "./ColaDeTickets";
import { PanelDelTicket } from "./PanelDelTicket";
import { conDecision, encabezadoDeCola, esAccionable, ordenarCola, siguienteAccionable, textoDeDecision } from "./modelo";
import { useValidacionesDiferidas } from "./useValidacionesDiferidas";

interface Aviso {
  id: number;
  tipo: "exito" | "error";
  texto: string;
}

/** Cuántos avisos quedan a la vista a la vez: los de lo que salió bien se van primero, los errores se quedan. */
const MAXIMO_DE_AVISOS = 4;

const ENLACE =
  "inline-flex min-h-8 items-center rounded-control border border-borde bg-superficie px-3.5 text-chico font-semibold text-marca-media focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-media";

function suscribirUbicacion(avisar: () => void) {
  window.addEventListener("popstate", avisar);
  return () => window.removeEventListener("popstate", avisar);
}

/** El ticket que pidió quien llegó desde Cuentas («Validar» de una fila): `?ticket=<id>`. En el servidor, ninguno. */
function useTicketPedido(): string | null {
  return useSyncExternalStore(
    suscribirUbicacion,
    () => new URLSearchParams(window.location.search).get("ticket"),
    () => null,
  );
}

function sinClave<T>(registro: Readonly<Record<string, T>>, clave: string): Record<string, T> {
  return Object.fromEntries(Object.entries(registro).filter(([k]) => k !== clave));
}

function sin(conjunto: ReadonlySet<string>, clave: string): Set<string> {
  const nuevo = new Set(conjunto);
  nuevo.delete(clave);
  return nuevo;
}

/** Cuál se ve al costado: el elegido; si nadie eligió, el pedido por la dirección o el primero que se puede validar. */
function elegirAbierto(cola: readonly ItemPorValidar[], elegida: string | null | undefined, pedido: string | null): string | null {
  const existe = (id: string | null | undefined): id is string => !!id && cola.some((x) => x.id === id);
  if (elegida === null) return null;
  if (existe(elegida)) return elegida;
  if (elegida === undefined && existe(pedido)) return pedido;
  return cola.find(esAccionable)?.id ?? null;
}

function esCampoDeTexto(destino: EventTarget | null): boolean {
  return destino instanceof HTMLElement && (destino.tagName === "TEXTAREA" || destino.tagName === "INPUT" || destino.tagName === "SELECT" || destino.isContentEditable);
}

/**
 * Vista 29: «Validar tickets». A la izquierda la cola (los depósitos con foto y los retiros por el coordinador, del más antiguo
 * al más nuevo) y al costado el abierto, con todo para validarlo, confirmarlo o rechazarlo con motivo sin volver a la lista.
 *
 * - Validar un depósito pasa al siguiente y deja 8 s el aviso con «Deshacer» antes de mandarlo (29 A·03).
 * - Confirmar o rechazar un retiro lo deja abierto, de solo lectura, con su franja (36R·04 y 05); rechazar un depósito pasa
 *   al siguiente. Lo propio se ve sin acciones (36R·06).
 * - Las decisiones van una por ítem a la vez (el doble toque se ignora) y en orden entre ítems; si una falla, el botón vuelve
 *   a poder usarse y el motivo escrito sigue ahí (36R·07B). Sin conexión los botones se apagan y dicen por qué (07C).
 * - Teclado: R abre el rechazo, V valida (C confirma un retiro), Esc cancela el rechazo, ↑ ↓ cambian de fila.
 */
export function ValidarTicketsVista({ datos, acciones }: { datos: DatosDeValidacion; acciones: AccionesValidarTickets }) {
  const [cola, setCola] = useState(() => ordenarCola(datos.items));
  /** `undefined`: nadie eligió todavía (se abre el pedido o el primero); `null`: no queda nada por abrir. */
  const [elegida, setElegida] = useState<string | null | undefined>(undefined);
  const [rechazando, setRechazando] = useState<ReadonlySet<string>>(new Set());
  const [borradores, setBorradores] = useState<Readonly<Record<string, { texto: string; rapido: string | null }>>>({});
  const [errores, setErrores] = useState<Readonly<Record<string, string>>>({});
  const [enCurso, setEnCurso] = useState<Readonly<Record<string, "validar" | "rechazar">>>({});
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const enLinea = useEnLinea();
  const pedido = useTicketPedido();

  const raiz = useRef<HTMLDivElement>(null);
  const focoPendiente = useRef<string | null>(null);
  const enCursoRef = useRef(new Set<string>());
  const filaEnCola = useRef<Promise<unknown>>(Promise.resolve());
  const numeroDeAviso = useRef(0);
  /** Los que estaban pendientes al abrir la vista: de ellos sale «Ticket 2 de 4», que no cambia al validar (29 A·03). */
  const [inicialmentePendientes] = useState(() => new Set(datos.items.filter((i) => i.estado === "PENDIENTE").map((i) => i.id)));

  const abiertoId = elegirAbierto(cola, elegida, pedido);
  const abierto = cola.find((x) => x.id === abiertoId) ?? null;
  const encabezado = encabezadoDeCola(cola, datos.ahora);

  const ultimo = useRef({ cola, abiertoId });
  useEffect(() => {
    ultimo.current = { cola, abiertoId };
  });

  useEffect(() => {
    const destino = focoPendiente.current;
    if (!destino) return;
    focoPendiente.current = null;
    const el = Array.from(raiz.current?.querySelectorAll<HTMLElement>("[data-foco]") ?? []).find((x) => x.dataset.foco === destino);
    el?.focus();
    el?.scrollIntoView?.({ block: "nearest" });
  });

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

  const mensajeDeFalla = (r: Extract<ResultadoDeAccion<unknown>, { ok: false }>, accion: string, siNo: string) =>
    r.causa === "sin-conexion" ? mensajeSinConexion(accion) : (r.mensaje ?? siNo);

  // Validar un depósito: se manda a los 8 s si no se tocó «Deshacer». Si falla, vuelve a la cola como pendiente.
  const diferidas = useValidacionesDiferidas<ItemPorValidar>({
    enviar: async (item) => {
      let r: ResultadoDeAccion<unknown>;
      try {
        r = await acciones.validar(item);
      } catch {
        r = { ok: false, causa: "sin-conexion" };
      }
      if (r.ok) return true;
      setCola((previa) => conDecision(previa, item.id, { estado: "PENDIENTE" }));
      avisar(
        "error",
        `No se validó el ticket de ${item.colportorNombre}: sigue por validar. ${mensajeDeFalla(r, "validar el ticket", "Probá de nuevo; si sigue igual, avisá al equipo.")}`,
      );
      return false;
    },
  });

  const elegir = (id: string | null, foco: string | null) => {
    setElegida(id);
    focoPendiente.current = foco;
  };

  /** Abrir una fila lleva el foco a la acción principal (36R·01: «El foco arranca en «Confirmar»»), o al motivo si estaba escribiendo. */
  const elegirDesdeLaCola = (id: string) => {
    const item = cola.find((x) => x.id === id);
    const foco = rechazando.has(id) ? "motivo" : item && esAccionable(item) && enLinea ? "validar" : "panel";
    elegir(id, foco);
  };

  const validarDeposito = (item: ItemPorValidar) => {
    if (!diferidas.programar(item)) return;
    const { cola: actual } = ultimo.current;
    setCola((previa) => conDecision(previa, item.id, { estado: "VALIDADO", resueltoEn: new Date().toISOString(), resueltoPorVos: true }));
    const proxima = siguienteAccionable(actual, item.id);
    elegir(proxima, proxima ? "validar" : "volver");
  };

  const deshacer = (item: ItemPorValidar) => {
    if (!diferidas.deshacer(item.id)) return;
    setCola((previa) => conDecision(previa, item.id, { estado: "PENDIENTE" }));
    elegir(item.id, "validar");
  };

  /** Confirmar un retiro o rechazar cualquiera: al toque, una por ítem a la vez y en orden entre ítems. */
  const decidir = (item: ItemPorValidar, decision: "validar" | "rechazar", motivo = "") => {
    if (enCursoRef.current.has(item.id)) return;
    enCursoRef.current.add(item.id);
    setEnCurso((previos) => ({ ...previos, [item.id]: decision }));
    setErrores((previos) => sinClave(previos, item.id));
    const trabajo = filaEnCola.current.then(async () => {
      try {
        let r: ResultadoDeAccion<{ resueltoEn: string }>;
        try {
          r = decision === "validar" ? await acciones.validar(item) : await acciones.rechazar(item, motivo);
        } catch {
          r = { ok: false, causa: "sin-conexion" };
        }
        const que = item.tipo === "retiro" ? `el retiro de ${item.colportorNombre}` : `el ticket de ${item.colportorNombre}`;
        if (!r.ok) {
          const texto =
            decision === "rechazar"
              ? r.causa === "rechazado" && r.mensaje
                ? r.mensaje
                : "No pudimos guardar el rechazo. El motivo sigue escrito: probá de nuevo."
              : mensajeDeFalla(r, `confirmar ${que}`, "No pudimos guardar la confirmación. Probá de nuevo.");
          setErrores((previos) => ({ ...previos, [item.id]: texto }));
          if (ultimo.current.abiertoId === item.id) focoPendiente.current = decision === "rechazar" ? "confirmar-rechazo" : "validar";
          return;
        }
        const { cola: actual, abiertoId: abiertoAhora } = ultimo.current;
        setCola((previa) =>
          conDecision(previa, item.id, {
            estado: decision === "validar" ? "VALIDADO" : "RECHAZADO",
            motivoRechazo: decision === "rechazar" ? motivo : undefined,
            resueltoEn: r.valor.resueltoEn,
            resueltoPorVos: true,
          }),
        );
        setRechazando((previos) => sin(previos, item.id));
        setBorradores((previos) => sinClave(previos, item.id));
        avisar("exito", textoDeDecision(item, decision));
        if (abiertoAhora === item.id) {
          // El depósito rechazado pasa al siguiente (29); el retiro queda abierto, de solo lectura (36R·04 y 05).
          if (item.tipo === "deposito") {
            const proxima = siguienteAccionable(actual, item.id);
            elegir(proxima, proxima ? "validar" : "volver");
          } else {
            elegir(item.id, "panel");
          }
        }
      } finally {
        enCursoRef.current.delete(item.id);
        setEnCurso((previos) => sinClave(previos, item.id));
      }
    });
    filaEnCola.current = trabajo.catch(() => undefined);
    registrarEnvio(trabajo);
  };

  const validar = (item: ItemPorValidar) => {
    if (!esAccionable(item) || !enLinea || enCursoRef.current.has(item.id)) return;
    if (item.tipo === "deposito") validarDeposito(item);
    else decidir(item, "validar");
  };

  const abrirRechazo = (item: ItemPorValidar) => {
    if (!esAccionable(item) || !enLinea || enCursoRef.current.has(item.id)) return;
    setRechazando((previos) => new Set(previos).add(item.id));
    focoPendiente.current = "motivo";
  };

  const cancelarRechazo = (item: ItemPorValidar) => {
    setRechazando((previos) => sin(previos, item.id));
    setErrores((previos) => sinClave(previos, item.id));
    focoPendiente.current = "rechazar";
  };

  const moverFila = (paso: 1 | -1) => {
    const i = cola.findIndex((x) => x.id === abiertoId);
    const destino = cola[Math.min(cola.length - 1, Math.max(0, i + paso))];
    if (destino) elegir(destino.id, `fila:${destino.id}`);
  };

  const teclas = (evento: KeyboardEvent<HTMLDivElement>) => {
    if (evento.altKey || evento.ctrlKey || evento.metaKey || esCampoDeTexto(evento.target)) return;
    const tecla = evento.key.toLowerCase();
    if (tecla === "arrowdown" || tecla === "arrowup") {
      evento.preventDefault();
      moverFila(tecla === "arrowdown" ? 1 : -1);
      return;
    }
    if (!abierto || rechazando.has(abierto.id)) {
      if (tecla === "escape" && abierto && !enCursoRef.current.has(abierto.id)) cancelarRechazo(abierto);
      return;
    }
    if (tecla === "r") {
      evento.preventDefault();
      abrirRechazo(abierto);
    } else if ((tecla === "v" && abierto.tipo === "deposito") || (tecla === "c" && abierto.tipo === "retiro")) {
      evento.preventDefault();
      validar(abierto);
    }
  };

  /**
   * Volver a Cuentas espera lo que está a medio mandar (una validación dentro de su «Deshacer», un rechazo en camino), igual
   * que la vista 27 y que cambiar de pestaña: si la vista se desmontara antes, un envío que falla no se vería. Si falla, se
   * queda acá con el aviso a la vista.
   */
  const router = useRouter();
  const alVolverACuentas = (evento: MouseEvent<HTMLAnchorElement>) => {
    // Un clic con modificador abre otra pestaña y esta se queda como está.
    if (evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
    if (!hayQueEsperar() && !estaEsperando()) return;
    evento.preventDefault();
    void esperarYSalir(() => router.push("/cuentas"));
  };

  const posicion = (() => {
    if (!abierto || abierto.estado !== "PENDIENTE" || !inicialmentePendientes.has(abierto.id)) return null;
    const delTipo = cola.filter((x) => x.tipo === abierto.tipo && inicialmentePendientes.has(x.id));
    const i = delTipo.findIndex((x) => x.id === abierto.id);
    return {
      texto: `${abierto.tipo === "retiro" ? "Retiro" : "Ticket"} ${i + 1} de ${delTipo.length}`,
      anterior: delTipo[i - 1]?.id ?? null,
      siguiente: delTipo[i + 1]?.id ?? null,
    };
  })();

  return (
    <div ref={raiz} onKeyDown={teclas} className="flex min-h-0 flex-1 flex-col gap-3.5 bg-fondo px-[22px] pt-[18px] pb-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-[3px]">
          <Link href="/cuentas" onClick={alVolverACuentas} className="inline-flex min-h-6 w-max items-center text-chico font-semibold text-marca-media underline-offset-2 hover:underline">
            ‹ Estado de cuenta del equipo
          </Link>
          <h2 className="font-serif text-[22px] font-semibold text-tinta">
            Tickets por validar · <span className="font-mono">{encabezado.cantidad}</span>
          </h2>
          {encabezado.masAntiguo && <p className="text-chico text-tinta-suave">el más antiguo: {encabezado.masAntiguo}</p>}
        </div>
      </div>

      <div aria-live="polite" className="flex flex-col gap-2 empty:hidden">
        {diferidas.avisos.map((item) => (
          <div key={`deshacer-${item.id}`} className="flex items-center justify-between gap-3 rounded-control bg-exito-fondo px-3 py-2 text-chico text-exito">
            <span className="wrap-anywhere">{textoDeDecision(item, "validar")}</span>
            <button
              type="button"
              aria-label={`Deshacer la validación del ticket de ${item.colportorNombre}`}
              onClick={() => deshacer(item)}
              onFocus={() => diferidas.pausar(item.id)}
              onBlur={() => diferidas.reanudar(item.id)}
              className="inline-flex min-h-7 cursor-pointer items-center rounded-control px-2 font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-marca-media"
            >
              Deshacer
            </button>
          </div>
        ))}
        {avisos.map((aviso) => (
          <div
            key={aviso.id}
            role={aviso.tipo === "error" ? "alert" : undefined}
            className={cn(
              "flex items-center justify-between gap-3 rounded-control px-3 py-2 text-chico",
              aviso.tipo === "error" ? "bg-peligro-fondo text-peligro" : "bg-exito-fondo text-exito",
            )}
          >
            <span className="wrap-anywhere">{aviso.texto}</span>
            <button
              type="button"
              aria-label="Cerrar el aviso"
              onClick={() => setAvisos((previos) => previos.filter((a) => a.id !== aviso.id))}
              className="inline-flex min-h-6 min-w-6 cursor-pointer items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-marca-media"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        ))}
      </div>

      {cola.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-tarjeta border border-borde bg-superficie px-[18px] py-8 text-center">
          <p role="status" className="text-nav text-tinta-2">
            No quedan tickets por validar
          </p>
          <Link href="/cuentas" onClick={alVolverACuentas} data-foco="volver" className={ENLACE}>
            Volver a Cuentas
          </Link>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(520px,1fr)_minmax(400px,500px)] gap-4">
          <ColaDeTickets cola={cola} abierto={abiertoId} ahoraIso={datos.ahora} alElegir={elegirDesdeLaCola} />
          <div className="min-h-0 overflow-x-hidden overflow-y-auto rounded-tarjeta border border-borde bg-superficie px-[18px] py-4">
            {abierto ? (
              <PanelDelTicket
                key={abierto.id}
                item={abierto}
                ahoraIso={datos.ahora}
                posicion={posicion}
                alNavegar={(id) => elegir(id, "panel")}
                acciones={acciones}
                enLinea={enLinea}
                ocupado={enCurso[abierto.id] ?? null}
                rechazando={rechazando.has(abierto.id)}
                motivo={borradores[abierto.id]?.texto ?? ""}
                motivoRapido={borradores[abierto.id]?.rapido ?? null}
                error={errores[abierto.id] ?? null}
                alValidar={() => validar(abierto)}
                alAbrirRechazo={() => abrirRechazo(abierto)}
                alCancelarRechazo={() => cancelarRechazo(abierto)}
                alCambiarMotivo={(texto, rapido) => setBorradores((previos) => ({ ...previos, [abierto.id]: { texto, rapido } }))}
                alConfirmarRechazo={(motivo) => decidir(abierto, "rechazar", motivo)}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p role="status" className="text-nav text-tinta-2">
                  No quedan tickets por validar
                </p>
                <Link href="/cuentas" onClick={alVolverACuentas} data-foco="volver" className={ENLACE}>
                  Volver a Cuentas
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
