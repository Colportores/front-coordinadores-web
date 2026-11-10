"use client";

import { useId, useState, type KeyboardEvent } from "react";

import { mensajeDeRechazo, motivoDelRechazo } from "@/auth/sesion-vencida";
import type { AccionesValidarTickets, ItemPorValidar } from "@/datos/cuentas/validar";
import { cn } from "@/lib/utils";

import {
  MAXIMO_DEL_MOTIVO,
  MOTIVOS_RAPIDOS,
  bandaDelItem,
  camposDelItem,
  contadorDelMotivo,
  esAccionable,
  largoDelMotivo,
  previaDelItem,
  sePuedeValidar,
  TEXTO_SIN_MONTO_PARA_VALIDAR,
  textoDeMotivoLargo,
  textoDeResuelto,
  textoInformativo,
  validarMotivo,
  type Campo,
} from "./modelo";

const BOTON =
  "inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-control border px-3.5 text-chico font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-media aria-disabled:cursor-not-allowed aria-disabled:border-borde aria-disabled:bg-superficie-suave aria-disabled:text-tinta-suave";

const TECLA = "rounded-sm border border-current/40 px-1 font-mono text-[10px] font-medium opacity-80";

function Campos({ campos }: { campos: Campo[] }) {
  return (
    <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2.5">
      {campos.map((c) => (
        <div key={c.rotulo} className={cn("flex min-w-0 flex-col gap-0.5", c.grande && "col-span-2")}>
          <dt className="text-etiqueta font-semibold tracking-etiqueta text-tinta-suave">{c.rotulo}</dt>
          <dd
            className={cn(
              "m-0 wrap-anywhere",
              c.grande ? "font-serif text-[26px] font-semibold text-marca" : "text-nav text-tinta",
              c.mono && "font-mono",
            )}
          >
            {c.valor}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** La foto del ticket: se pide el enlace firmado (vence en minutos) recién cuando se quiere ver. */
function FotoDelTicket({ item, acciones }: { item: ItemPorValidar; acciones: AccionesValidarTickets }) {
  const [estado, setEstado] = useState<{ tipo: "nada" } | { tipo: "cargando" } | { tipo: "lista"; url: string } | { tipo: "error"; texto: string }>({ tipo: "nada" });

  if (item.tipo === "retiro") {
    return (
      <div className="flex items-start gap-2.5 rounded-control border border-dashed border-borde bg-superficie-suave px-3 py-2.5 text-chico text-tinta-2">
        <span className="flex-none font-mono text-[10px] font-semibold tracking-etiqueta text-tinta-suave">SIN FOTO</span>
        <span>El efectivo se entrega en mano: este retiro no trae comprobante.</span>
      </div>
    );
  }
  if (!item.tieneFoto) {
    return (
      <p className="rounded-control border border-dashed border-borde bg-superficie-suave px-3 py-2.5 text-chico text-tinta-2">
        La foto de este ticket ya venció: se guarda 4 meses. Los datos del ticket siguen en el historial.
      </p>
    );
  }

  const pedir = async () => {
    if (estado.tipo === "cargando") return;
    setEstado({ tipo: "cargando" });
    try {
      const r = await acciones.enlaceDeFoto(item.id);
      setEstado(
        r.ok
          ? { tipo: "lista", url: r.valor }
          : { tipo: "error", texto: r.causa === "sin-conexion" ? "Necesitás conexión para ver la foto. Revisá la conexión y probá de nuevo." : (r.mensaje ?? "No pudimos traer la foto. Probá de nuevo.") },
      );
    } catch (error) {
      // El proxy cerró la sesión mientras la vista estaba abierta (#41): se dice eso, no «sin conexión».
      const motivo = motivoDelRechazo(error);
      setEstado({ tipo: "error", texto: motivo ? mensajeDeRechazo(motivo, "ver la foto") : "Necesitás conexión para ver la foto. Revisá la conexión y probá de nuevo." });
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-control border border-borde bg-superficie-mapa px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-semibold tracking-etiqueta text-tinta-suave">FOTO DEL TICKET</span>
        {estado.tipo === "lista" ? (
          <a href={estado.url} target="_blank" rel="noreferrer" className="inline-flex min-h-6 items-center text-chico font-semibold text-marca-media underline-offset-2 hover:underline">
            Agrandar
          </a>
        ) : (
          <button
            type="button"
            aria-disabled={estado.tipo === "cargando"}
            onClick={() => void pedir()}
            className="inline-flex min-h-6 cursor-pointer items-center rounded-sm px-1 text-chico font-semibold text-marca-media focus-visible:outline-2 focus-visible:outline-marca-media aria-disabled:cursor-wait"
          >
            {estado.tipo === "cargando" ? "Trayendo la foto…" : "Ver foto"}
          </button>
        )}
      </div>
      {estado.tipo === "lista" && (
        // eslint-disable-next-line @next/next/no-img-element -- enlace firmado de R2 que vence en minutos: no pasa por el optimizador.
        <img src={estado.url} alt={`Foto del ticket de ${item.colportorNombre}`} className="max-h-[220px] w-full rounded-sm object-contain" />
      )}
      {estado.tipo === "error" && (
        <p role="alert" className="text-chico text-peligro">
          {estado.texto}
        </p>
      )}
    </div>
  );
}

export interface PropsDelPanel {
  item: ItemPorValidar;
  ahoraIso: string;
  /** «Ticket 1 de 4»; `null` si el ítem ya se resolvió (36R·04 y 05 no lo muestran). */
  posicion: { texto: string; anterior: string | null; siguiente: string | null } | null;
  /** ‹ › abren el anterior o el siguiente del mismo tipo (por id). */
  alNavegar: (id: string) => void;
  acciones: AccionesValidarTickets;
  enLinea: boolean;
  /** Hay una decisión de este ítem en camino. */
  ocupado: "validar" | "rechazar" | null;
  rechazando: boolean;
  motivo: string;
  motivoRapido: string | null;
  /** No se pudo guardar la última decisión (36R·07B). */
  error: string | null;
  alValidar: () => void;
  alAbrirRechazo: () => void;
  alCancelarRechazo: () => void;
  alCambiarMotivo: (texto: string, rapido: string | null) => void;
  alConfirmarRechazo: (motivo: string) => void;
}

/**
 * El ticket o el retiro abierto al costado de la cola (29 A·01, 36R·01): los datos, la foto (o «SIN FOTO»), lo que la app sabe
 * para comparar, y «Rechazar» / «Validar» (o «Confirmar»). «Rechazar» no rechaza: abre el motivo en el mismo lugar y
 * «Confirmar rechazo» sí (29 A·02). Lo resuelto queda de solo lectura con su franja (36R·04 y 05); lo propio, sin acciones (06).
 */
export function PanelDelTicket(p: PropsDelPanel) {
  const { item } = p;
  const idMotivo = useId();
  const idAyuda = `${idMotivo}-ayuda`;
  const [errorDelMotivo, setErrorDelMotivo] = useState<string | null>(null);
  const accionable = esAccionable(item);
  const retiro = item.tipo === "retiro";
  const banda = bandaDelItem(item, p.ahoraIso);
  const previa = previaDelItem(item);
  const largoDelEscrito = largoDelMotivo(p.motivo.trim());
  const largo = largoDelEscrito > MAXIMO_DEL_MOTIVO;
  const avisoDelMotivo = largo ? textoDeMotivoLargo(largoDelEscrito) : errorDelMotivo;
  const sinMonto = accionable && !sePuedeValidar(item);
  const idSinMonto = `${idMotivo}-sin-monto`;
  const apagado = !p.enLinea || p.ocupado !== null;
  const info = accionable ? textoInformativo(item, p.rechazando) : textoDeResuelto(item);

  const confirmarRechazo = () => {
    if (apagado) return;
    const valido = validarMotivo(p.motivo, item.tipo);
    if (!valido.ok) {
      setErrorDelMotivo(valido.error);
      document.getElementById(idMotivo)?.focus();
      return;
    }
    setErrorDelMotivo(null);
    p.alConfirmarRechazo(valido.motivo);
  };

  const teclasDelMotivo = (evento: KeyboardEvent) => {
    if (evento.key !== "Escape" || p.ocupado) return;
    evento.preventDefault();
    evento.stopPropagation();
    setErrorDelMotivo(null);
    p.alCancelarRechazo();
  };

  return (
    <section aria-labelledby={`${idMotivo}-titulo`} className="flex min-w-0 flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${idMotivo}-titulo`} tabIndex={-1} data-foco="panel" className="font-serif text-[18px] font-semibold text-tinta focus-visible:outline-none">
          {retiro ? "Retiro por el coordinador" : "Ticket de depósito"}
        </h3>
        {p.posicion && (
          <div className="flex items-center gap-1.5 text-chico text-tinta-suave">
            <span>{p.posicion.texto}</span>
            <button
              type="button"
              aria-label={retiro ? "Retiro anterior" : "Ticket anterior"}
              aria-disabled={!p.posicion.anterior}
              onClick={() => p.posicion?.anterior && p.alNavegar(p.posicion.anterior)}
              className="grid size-7 cursor-pointer place-items-center rounded-control border border-borde bg-superficie focus-visible:outline-2 focus-visible:outline-marca-media aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
            >
              <span aria-hidden="true">‹</span>
            </button>
            <button
              type="button"
              aria-label={retiro ? "Retiro siguiente" : "Ticket siguiente"}
              aria-disabled={!p.posicion.siguiente}
              onClick={() => p.posicion?.siguiente && p.alNavegar(p.posicion.siguiente)}
              className="grid size-7 cursor-pointer place-items-center rounded-control border border-borde bg-superficie focus-visible:outline-2 focus-visible:outline-marca-media aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
        )}
      </div>

      {banda && (
        <p
          className={cn(
            "flex items-start gap-2 rounded-control border px-3 py-2 text-chico font-semibold wrap-anywhere",
            banda.tono === "peligro" && "border-peligro/40 bg-peligro-fondo text-peligro",
            banda.tono === "exito" && "border-exito/40 bg-exito-fondo text-exito",
            banda.tono === "neutro" && "border-borde bg-superficie-suave font-normal text-tinta-2",
          )}
        >
          <span aria-hidden="true">{banda.icono}</span>
          <span>{banda.texto}</span>
        </p>
      )}

      {accionable && p.error && (
        <p role="alert" className="flex items-start gap-2 rounded-control border border-peligro bg-superficie px-3 py-2 text-chico font-semibold text-peligro">
          <span aria-hidden="true">!</span>
          <span className="wrap-anywhere">{p.error}</span>
        </p>
      )}

      {accionable && !p.enLinea && (
        <p className="flex items-start gap-2 rounded-control border border-dashed border-tinta-suave bg-superficie px-3 py-2 text-chico text-tinta-suave">
          <span aria-hidden="true">✕</span>
          <span>
            {retiro
              ? "Sin conexión. Para confirmar o rechazar un retiro hace falta conexión. Lo que ves puede estar desactualizado."
              : "Sin conexión. Para validar o rechazar un ticket hace falta conexión. Lo que ves puede estar desactualizado."}
          </span>
        </p>
      )}

      {sinMonto && (
        <p id={idSinMonto} className="flex items-start gap-2 rounded-control border border-alerta/40 bg-alerta-fondo px-3 py-2 text-chico text-alerta">
          <span aria-hidden="true">△</span>
          <span>{TEXTO_SIN_MONTO_PARA_VALIDAR}</span>
        </p>
      )}

      <FotoDelTicket key={item.id} item={item} acciones={p.acciones} />

      <Campos campos={camposDelItem(item, p.ahoraIso)} />

      {previa && (
        <div className="flex flex-col gap-2 border-t border-borde-suave pt-2.5">
          <Campos campos={previa.campos} />
          {previa.avisos.map((aviso) => (
            <p key={aviso} role="note" className="flex items-start gap-2 rounded-control bg-alerta-fondo px-3 py-2 text-chico text-alerta">
              <span aria-hidden="true">△</span>
              <span>{aviso}</span>
            </p>
          ))}
        </div>
      )}

      {item.estado === "RECHAZADO" && item.motivoRechazo && (
        <div className="flex flex-col gap-1">
          <span className="text-etiqueta font-semibold tracking-etiqueta text-tinta-suave">MOTIVO DEL RECHAZO</span>
          <p className="m-0 rounded-control bg-superficie-suave px-3 py-2 text-nav wrap-anywhere whitespace-pre-wrap text-tinta">{item.motivoRechazo}</p>
        </div>
      )}

      {accionable && p.rechazando && (
        <div className="flex flex-col gap-2">
          <label htmlFor={idMotivo} className="text-etiqueta font-semibold tracking-etiqueta text-peligro">
            MOTIVO DEL RECHAZO · OBLIGATORIO
          </label>
          <div role="group" aria-label="Motivos rápidos" className="flex flex-wrap gap-1.5">
            {MOTIVOS_RAPIDOS[item.tipo].map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={p.motivoRapido === m}
                aria-disabled={p.ocupado !== null}
                onClick={() => {
                  if (p.ocupado) return;
                  setErrorDelMotivo(null);
                  p.alCambiarMotivo(m, m);
                  document.getElementById(idMotivo)?.focus();
                }}
                className={cn(
                  "inline-flex min-h-7 cursor-pointer items-center rounded-pastilla border px-2.5 text-chico focus-visible:outline-2 focus-visible:outline-marca-media",
                  p.motivoRapido === m ? "border-marca bg-marca-clara font-semibold text-marca" : "border-borde bg-superficie text-tinta-2",
                )}
              >
                {m}
              </button>
            ))}
          </div>
          <textarea
            id={idMotivo}
            data-foco="motivo"
            value={p.motivo}
            readOnly={p.ocupado !== null}
            rows={4}
            placeholder="Contale al colportor qué tiene que corregir"
            aria-invalid={avisoDelMotivo ? true : undefined}
            aria-describedby={idAyuda}
            onChange={(e) => {
              if (errorDelMotivo) setErrorDelMotivo(null);
              p.alCambiarMotivo(e.target.value, p.motivoRapido);
            }}
            onKeyDown={teclasDelMotivo}
            className={cn(
              "min-h-[88px] w-full resize-y rounded-control border bg-superficie px-3 py-2.5 text-nav text-tinta placeholder:text-tinta-suave focus-visible:outline-2 focus-visible:outline-marca-media read-only:opacity-60",
              avisoDelMotivo ? "border-peligro outline-2 outline-peligro" : "border-borde",
            )}
          />
          <div id={idAyuda} className="flex items-start justify-between gap-3">
            {avisoDelMotivo ? (
              <p role="alert" className="flex items-start gap-[7px] text-cuerpo font-medium text-peligro">
                <span aria-hidden="true" className="grid size-4 flex-none place-items-center rounded-full bg-peligro text-[10px] font-bold text-superficie">
                  !
                </span>
                {avisoDelMotivo}
              </p>
            ) : (
              <span />
            )}
            <span className={cn("flex-none font-mono text-mini", largo ? "font-semibold text-peligro" : "text-tinta-suave")}>{contadorDelMotivo(p.motivo)}</span>
          </div>
        </div>
      )}

      {info && <p className="m-0 rounded-control bg-superficie-suave px-3 py-2.5 text-chico wrap-anywhere text-pretty text-tinta-2">{info}</p>}

      {accionable && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-borde-suave pt-3">
          {!p.enLinea && <span className="mr-auto text-[11.5px] text-tinta-suave">Se habilitan cuando vuelva la conexión.</span>}
          {p.enLinea && !p.rechazando && !retiro && <span className="mr-auto text-[11.5px] text-tinta-suave">Al validar pasa al siguiente</span>}
          {p.rechazando ? (
            <>
              <button
                type="button"
                data-foco="cancelar-rechazo"
                aria-disabled={p.ocupado !== null}
                onClick={() => {
                  if (p.ocupado) return;
                  setErrorDelMotivo(null);
                  p.alCancelarRechazo();
                }}
                className={cn(BOTON, "border-transparent bg-transparent text-marca-media")}
              >
                Cancelar
              </button>
              <button
                type="button"
                data-foco="confirmar-rechazo"
                aria-disabled={apagado || largo}
                onClick={() => {
                  if (!largo) confirmarRechazo();
                }}
                className={cn(BOTON, "border-peligro bg-peligro text-superficie")}
              >
                {p.ocupado === "rechazar" ? "Rechazando…" : p.error ? "Reintentar" : "Confirmar rechazo"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                data-foco="rechazar"
                aria-disabled={apagado}
                aria-keyshortcuts="R"
                onClick={() => {
                  if (!apagado) p.alAbrirRechazo();
                }}
                className={cn(BOTON, "border-peligro bg-superficie text-peligro")}
              >
                Rechazar <span aria-hidden="true" className={TECLA}>R</span>
              </button>
              <button
                type="button"
                data-foco="validar"
                aria-disabled={apagado || sinMonto}
                aria-describedby={sinMonto ? idSinMonto : undefined}
                aria-keyshortcuts={retiro ? "C" : "V"}
                onClick={() => {
                  if (!apagado && !sinMonto) p.alValidar();
                }}
                className={cn(BOTON, "border-marca bg-marca text-superficie")}
              >
                {p.ocupado === "validar" ? "Confirmando…" : retiro ? "Confirmar" : "Validar"}{" "}
                <span aria-hidden="true" className={TECLA}>
                  {retiro ? "C" : "V"}
                </span>
              </button>
            </>
          )}
        </div>
      )}

      {!accionable && (
        <p className="m-0 text-[11.5px] text-tinta-suave">
          {item.esVos && item.estado === "PENDIENTE" ? "Sin acciones para vos." : item.estado === "RECHAZADO" ? "Queda en el historial. No se edita ni se borra." : "Queda en el historial."}
        </p>
      )}
    </section>
  );
}
