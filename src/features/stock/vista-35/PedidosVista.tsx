"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AccionNoDisponible } from "@/components/AccionNoDisponible";
import { useValidacionesDiferidas } from "@/features/cuentas/vista-29/useValidacionesDiferidas";
import type { AccionesPedidos, CantidadAutorizada, DatosDePedidos, ResultadoDeAccion, SolicitudResuelta } from "@/datos/stock/pedidos";
import { mensajeSinConexion } from "@/lib/mensajes";
import { cn } from "@/lib/utils";
import { registrarEnvio } from "@/shell/trabajo-pendiente";

import { ListaDeCiudades, RielDeCiudades } from "../vista-34/ListaDeCiudades";
import { construirRiel } from "../vista-34/modelo";
import { BandejaDePedidos } from "./BandejaDePedidos";
import { DetalleDePedido } from "./DetalleDePedido";
import { DialogoDelLimite } from "./DialogoDelLimite";
import {
  AMBITO_TODAS,
  acotarCantidad,
  aplicarResolucionConEfecto,
  cantidadesAutorizadas,
  cantidadesPedidas,
  claveQueLaReemplaza,
  claveVigente,
  construirDetalle,
  construirFilas,
  construirLista,
  construirMundo,
  contarPestanas,
  decisionDe,
  deshacerResolucion,
  estaEnPestana,
  estadoDeResolucion,
  mismoAmbito,
  money,
  nombreDeDeshacer,
  notaDelLimite,
  resolucionProvisional,
  resolverAmbito,
  solicitudesDe,
  textoDeDecisionDiferida,
  textoDePestanaVacia,
  type Ambito,
  type EfectoEnLaDeuda,
  type Pestana,
  type Solicitud,
} from "./modelo";

interface Aviso {
  id: number;
  tipo: "exito" | "error" | "info";
  texto: string;
}

/**
 * Una decisión sobre un pedido o una transferencia que está dentro de sus 8 s de «Deshacer» (35 · 42A·04): la bandeja ya la
 * muestra decidida, pero recién sale al servidor cuando se cierra el plazo. `id` es la clave de la solicitud; `cantidades` son las
 * de un pedido autorizado reducido.
 */
interface DecisionDiferida {
  id: string;
  solicitud: Solicitud;
  accion: "autorizar" | "rechazar";
  motivo: string;
  cantidades?: CantidadAutorizada[];
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
 * estado con la bandeja y, al lado, el pedido elegido con todo lo necesario para autorizarlo (entero o con «Reducir cantidades»)
 * o rechazarlo. Arriba, el límite de deuda de la campaña con «Editar». Cambiar de ciudad o de pestaña no pide nada al servidor.
 * Las decisiones salen por `acciones` a los 8 s, con «Deshacer» mientras tanto (42A·04): una por pedido a la vez (el doble toque
 * se ignora), cada una con su plazo, así dos seguidas no se pisan ni se pierde ninguna; si una no sale, vuelve a «por autorizar»
 * con el aviso de qué pasó y los botones otra vez disponibles.
 */
export function PedidosVista({
  datos: inicial,
  acciones,
  ciudadInicialId,
  pestanaInicial,
}: {
  datos: DatosDePedidos;
  acciones: AccionesPedidos;
  /** La ciudad con la que abre la vista cuando se llega desde Stock («Ver pedidos»); si ya no figura, abre en «todas». */
  ciudadInicialId?: string | null;
  /** La pestaña con la que abre (la de siempre, «Por autorizar», si no se pide otra). */
  pestanaInicial?: Pestana | null;
}) {
  const [datos, setDatos] = useState(inicial);
  const [ambito, setAmbito] = useState<Ambito>(() =>
    ciudadInicialId && inicial.ciudades.some((c) => c.id === ciudadInicialId) ? { tipo: "ciudad", ciudadId: ciudadInicialId } : AMBITO_TODAS,
  );
  const [listaAbierta, setListaAbierta] = useState(true);
  const [pestana, setPestana] = useState<Pestana>(pestanaInicial ?? "PEND");
  const [elegida, setElegida] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState<ReadonlySet<string>>(new Set());
  const [borradores, setBorradores] = useState<Readonly<Record<string, string>>>({});
  // Los pedidos que se están reduciendo (42A·03) con la cantidad elegida de cada línea; cada pedido guarda las suyas.
  const [reducciones, setReducciones] = useState<Readonly<Record<string, readonly number[]>>>({});
  const [editandoLimite, setEditandoLimite] = useState(false);
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  const raiz = useRef<HTMLDivElement>(null);
  const focoPendiente = useRef<string | null>(null);
  const guardandoLimite = useRef(false);
  const numeroDeAviso = useRef(0);
  // Lo que cada decisión dentro de su plazo movió en la deuda, para devolverlo exacto si se deshace o no sale.
  const efectos = useRef(new Map<string, EfectoEnLaDeuda>());

  const mundo = useMemo(() => construirMundo(datos), [datos]);
  const resuelto = useMemo(() => resolverAmbito(mundo, ambito), [mundo, ambito]);
  const lista = useMemo(() => construirLista(mundo, resuelto), [mundo, resuelto]);
  const riel = useMemo(() => construirRiel(lista), [lista]);
  const pestanas = useMemo(() => contarPestanas(resuelto), [resuelto]);
  const solicitudes = useMemo(() => solicitudesDe(resuelto, pestana), [resuelto, pestana]);
  const filas = useMemo(() => construirFilas(mundo, solicitudes), [mundo, solicitudes]);
  // Lo que la pestaña «Por autorizar» no muestra porque es de otra pestaña: las transferencias por autorizar de lo que se mira.
  const transferenciasPorAutorizar = useMemo(() => solicitudesDe(resuelto, "TRF").filter((s) => s.estado === "PEND").length, [resuelto]);
  const clave = claveVigente(filas, elegida);
  const abierta = clave === null ? undefined : solicitudes.find((s) => s.clave === clave);
  const elegidas = abierta ? reducciones[abierta.clave] : undefined;
  const detalle = useMemo(() => (abierta ? construirDetalle(mundo, abierta, elegidas ?? null) : null), [mundo, abierta, elegidas]);

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

  /** Lo que queda escrito para volver a intentar un rechazo que no salió o que se deshizo: el motivo no se pierde. */
  const reabrirRechazo = useCallback((d: DecisionDiferida) => {
    if (d.accion !== "rechazar") return;
    setRechazando((previos) => new Set(previos).add(d.id));
    setBorradores((previos) => ({ ...previos, [d.id]: d.motivo }));
  }, []);

  /** Lo que queda elegido para volver a intentar una autorización reducida que se deshizo o que no salió: nada se pierde. */
  const reabrirReduccion = useCallback((d: DecisionDiferida) => {
    const { cantidades } = d;
    if (d.accion !== "autorizar" || !cantidades) return;
    setReducciones((previos) => ({ ...previos, [d.id]: cantidades.map((c) => c.cantidad) }));
  }, []);

  /** Vuelve lo decidido a «por autorizar» con la deuda como estaba antes de la decisión. */
  const devolverDeuda = useCallback((d: DecisionDiferida) => {
    const efecto = efectos.current.get(d.id) ?? {};
    efectos.current.delete(d.id);
    setDatos((previos) => deshacerResolucion(previos, d.solicitud.tipo, d.solicitud.id, efecto));
  }, []);

  // Autorizar o rechazar no sale al toque: se ve decidido, queda 8 s el aviso con «Deshacer» y recién ahí se manda (pedidos y
  // transferencias por igual). Si no sale, vuelve a «por autorizar» con el aviso de qué pasó y los botones otra vez disponibles.
  const diferidas = useValidacionesDiferidas<DecisionDiferida>({
    enviar: async (d) => {
      let resultado: ResultadoDeAccion<SolicitudResuelta>;
      try {
        resultado = await acciones.decidir(decisionDe(d.solicitud, d.accion, d.motivo, d.cantidades));
      } catch {
        resultado = { ok: false, causa: "sin-conexion" };
      }
      if (resultado.ok) {
        efectos.current.delete(d.id);
        return true;
      }
      const verbo = d.accion === "autorizar" ? "autorizar" : "rechazar";
      const que = d.solicitud.tipo === "pedido" ? `el pedido ${d.solicitud.numero}` : `la transferencia ${d.solicitud.numero}`;
      devolverDeuda(d);
      reabrirRechazo(d);
      reabrirReduccion(d);
      avisar("error", `${mensajeDeFalla(resultado, `${verbo} ${que}`)} Sigue por autorizar.`);
      return false;
    },
  });

  const decidirConDeshacer = (s: Solicitud, accion: "autorizar" | "rechazar", motivo = "", cantidades?: CantidadAutorizada[]) => {
    if (!diferidas.programar({ id: s.clave, solicitud: s, accion, motivo, cantidades })) return;
    const { clave: abiertaAhora, filas: filasAntes, pestana: pestanaAhora } = ultimo.current;
    const provisional = resolucionProvisional(s, accion, motivo, new Date().toISOString(), cantidades);
    setDatos((previos) => {
      const aplicada = aplicarResolucionConEfecto(previos, provisional);
      efectos.current.set(s.clave, aplicada.efecto);
      return aplicada.datos;
    });
    setRechazando((previos) => {
      const siguientes = new Set(previos);
      siguientes.delete(s.clave);
      return siguientes;
    });
    setBorradores((previos) => sinClave(previos, s.clave));
    setReducciones((previos) => sinClave(previos, s.clave));
    if (abiertaAhora !== s.clave) return;
    // Una transferencia sigue en su pestaña, decidida: el foco va al detalle. Un pedido sale de «Por autorizar»: se abre el que
    // sigue (como siempre) y el pedido decidido se ve en su pestaña, o con «Deshacer» de vuelta donde estaba.
    const sigueEnPestana = estaEnPestana({ ...s, estado: estadoDeResolucion(provisional) }, pestanaAhora);
    const proxima = sigueEnPestana ? s.clave : claveQueLaReemplaza(filasAntes, s.clave);
    setElegida(proxima);
    focoPendiente.current = proxima !== null ? "detalle" : `pestana-${pestanaAhora}`;
  };

  const deshacer = (d: DecisionDiferida) => {
    if (!diferidas.deshacer(d.id)) {
      // El plazo se cerró entre que se vio «Deshacer» y el toque: la decisión ya salió (o está saliendo) y queda como se decidió
      // (HU-STK-003, «Deshacer fuera de plazo»; la base daría PE005 / TR006). No pasa en silencio.
      const que = d.solicitud.tipo === "pedido" ? `el pedido ${d.solicitud.numero}` : `la transferencia ${d.solicitud.numero}`;
      avisar("info", `Ya pasó el plazo para deshacer: ${que} quedó como lo decidiste.`);
      return;
    }
    devolverDeuda(d);
    reabrirRechazo(d);
    reabrirReduccion(d);
    // Vuelve a verse, aunque se haya cambiado de pestaña mientras corría el plazo, con el foco donde se retoma.
    setPestana(d.solicitud.tipo === "pedido" ? "PEND" : "TRF");
    setElegida(d.id);
    focoPendiente.current = d.accion === "rechazar" ? "motivo" : "autorizar";
  };

  const reducir = (s: Solicitud) => {
    setReducciones((previos) => ({ ...previos, [s.clave]: cantidadesPedidas(s) }));
    focoPendiente.current = "cantidad";
  };

  const cambiarCantidad = (s: Solicitud, indice: number, nueva: number) => {
    setReducciones((previos) => {
      const actuales = previos[s.clave] ?? cantidadesPedidas(s);
      const linea = s.lineas[indice];
      if (!linea) return previos;
      return { ...previos, [s.clave]: actuales.map((c, i) => (i === indice ? acotarCantidad(nueva, linea.pedida) : c)) };
    });
  };

  const cancelarReduccion = (s: Solicitud) => {
    setReducciones((previos) => sinClave(previos, s.clave));
    focoPendiente.current = "reducir";
  };

  const autorizarReducido = (s: Solicitud) => {
    const elegidasAhora = reducciones[s.clave];
    if (!elegidasAhora) return;
    decidirConDeshacer(s, "autorizar", "", cantidadesAutorizadas(s, elegidasAhora));
  };

  /** Guarda el límite de la campaña (42A·02): uno por vez, cuenta como trabajo sin contestar y no pierde lo escrito si falla. */
  const guardarLimite = async (limite: number | null): Promise<{ ok: true } | { ok: false; mensaje: string }> => {
    const editar = acciones.editarLimite;
    if (!editar) return { ok: false, mensaje: "Todavía no se puede editar el límite." };
    if (guardandoLimite.current) return { ok: false, mensaje: "Ya se está guardando el límite." };
    guardandoLimite.current = true;
    const envio = (async (): Promise<{ ok: true } | { ok: false; mensaje: string }> => {
      let resultado: ResultadoDeAccion<{ limiteDeDeuda: number | null }>;
      try {
        // La campaña es la que se está mirando: si en el topbar eligieron otra, el límite no se cambia en ella.
        resultado = await editar(limite, datos.campaniaId);
      } catch {
        resultado = { ok: false, causa: "sin-conexion" };
      }
      if (!resultado.ok) return { ok: false, mensaje: mensajeDeFalla(resultado, limite === null ? "quitar el límite" : "guardar el límite") };
      const quedo = resultado.valor.limiteDeDeuda;
      setDatos((previos) => ({ ...previos, limiteDeDeuda: quedo, limiteSinLeer: false }));
      setEditandoLimite(false);
      focoPendiente.current = "editar-limite";
      avisar("exito", quedo === null ? "Sin límite de deuda fijado: ningún pedido avisa por el límite." : `Límite de deuda de la campaña: ${money(quedo)} por colportor.`);
      return { ok: true };
    })().finally(() => {
      guardandoLimite.current = false;
    });
    registrarEnvio(envio);
    return envio;
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
              {mundo.limiteSinLeer ? (
                "Límite de deuda de la campaña: todavía no se puede mostrar"
              ) : mundo.limite === null ? (
                "Sin límite de deuda fijado"
              ) : (
                <>
                  Límite de deuda de la campaña: <b className="font-mono font-medium">{money(mundo.limite)}</b> por colportor
                </>
              )}
            </span>
            {acciones.editarLimite ? (
              <button
                type="button"
                data-foco="editar-limite"
                aria-label="Editar límite"
                onClick={() => setEditandoLimite(true)}
                className="inline-flex min-h-8 cursor-pointer items-center rounded-control border border-borde bg-superficie px-3.5 text-chico font-semibold whitespace-nowrap text-tinta-2 focus-visible:ring-[3px] focus-visible:ring-acento/50 focus-visible:outline-none"
              >
                Editar
              </button>
            ) : (
              <AccionNoDisponible
                aria-label="Editar límite"
                className="inline-flex min-h-8 items-center rounded-control border border-borde bg-superficie px-3.5 text-chico font-semibold whitespace-nowrap text-tinta-2"
              >
                Editar
              </AccionNoDisponible>
            )}
          </div>
        </div>

        <div aria-live="polite" className="flex flex-col gap-2 empty:hidden">
          {diferidas.avisos.map((d) => (
            <div key={`deshacer-${d.id}`} className="flex items-center justify-between gap-3 rounded-control bg-exito-fondo px-3 py-2 text-chico text-exito">
              <span className="wrap-anywhere">{textoDeDecisionDiferida(d.solicitud, d.accion, d.cantidades)}</span>
              <button
                type="button"
                aria-label={nombreDeDeshacer(d.solicitud, d.accion)}
                onClick={() => deshacer(d)}
                onFocus={() => diferidas.pausar(d.id)}
                onBlur={() => diferidas.reanudar(d.id)}
                className="inline-flex min-h-7 flex-none cursor-pointer items-center rounded-control px-2 font-semibold whitespace-nowrap underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-marca-media"
              >
                Deshacer · 8 s
              </button>
            </div>
          ))}
          {avisos.map((aviso) => (
            <div
              key={aviso.id}
              role={aviso.tipo === "error" ? "alert" : "status"}
              className={cn(
                "flex items-center justify-between gap-3 rounded-control px-3 py-2 text-chico",
                aviso.tipo === "error" ? "bg-peligro-fondo text-peligro" : aviso.tipo === "info" ? "bg-alerta-fondo text-tinta" : "bg-exito-fondo text-exito",
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
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(460px,1fr)_minmax(420px,560px)] gap-4">
            <BandejaDePedidos
              pestanas={pestanas}
              pestanaActiva={pestana}
              alElegirPestana={elegirPestana}
              filas={filas}
              claveAbierta={clave}
              alElegirFila={setElegida}
              textoVacio={textoDePestanaVacia(pestana, resuelto.lugar, pestana === "PEND" ? transferenciasPorAutorizar : 0)}
              accionVacio={pestana === "PEND" && transferenciasPorAutorizar > 0 ? { texto: "Ver transferencias", alActivar: () => elegirPestana("TRF", true) } : undefined}
              nombreDeLaLista={`Pedidos de ${resuelto.titulo}`}
            />
            <div className="min-h-0 overflow-x-hidden overflow-y-auto rounded-tarjeta border border-borde bg-superficie px-[18px] py-4">
              {detalle && abierta ? (
                <DetalleDePedido
                  key={detalle.clave}
                  detalle={detalle}
                  rechazando={rechazando.has(detalle.clave)}
                  motivoInicial={borradores[detalle.clave] ?? ""}
                  alAutorizar={() => decidirConDeshacer(abierta, "autorizar")}
                  alAbrirRechazo={() => abrirRechazo(abierta)}
                  alCancelarRechazo={() => cancelarRechazo(abierta)}
                  alConfirmarRechazo={(motivo) => decidirConDeshacer(abierta, "rechazar", motivo)}
                  alCambiarMotivo={(texto) => setBorradores((previos) => ({ ...previos, [abierta.clave]: texto }))}
                  alReducir={() => reducir(abierta)}
                  alCambiarCantidad={(indice, nueva) => cambiarCantidad(abierta, indice, nueva)}
                  alCancelarReduccion={() => cancelarReduccion(abierta)}
                  alAutorizarReducido={() => autorizarReducido(abierta)}
                />
              ) : (
                <p className="text-chico text-tinta-suave">Acá vas a ver el detalle del pedido o de la transferencia que elijas en la lista.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {editandoLimite && acciones.editarLimite && (
        <DialogoDelLimite
          limiteActual={mundo.limite}
          campaniaNombre={datos.campaniaNombre ?? null}
          puedeQuitar={mundo.limite !== null || mundo.limiteSinLeer}
          notaPara={(nuevo) => notaDelLimite(mundo, nuevo)}
          alGuardar={guardarLimite}
          alCerrar={() => {
            setEditandoLimite(false);
            focoPendiente.current = "editar-limite";
          }}
        />
      )}
    </div>
  );
}
