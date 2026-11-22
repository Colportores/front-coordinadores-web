"use client";

import { useState } from "react";

import type { AccionesCuentas, AnulacionDeCobro, MotivoDeAnulacion, ResultadoDeAccion, TicketDeCuentas } from "@/datos/cuentas";
import {
  MAX_DETALLE_DE_OTRO,
  MOTIVO_OTRO,
  TEXTO_VENCIO_AL_CONFIRMAR,
  textoDeFallaAlAnular,
} from "@/features/cuentas/anular-cobro";

export type PasoDeAnulacion = "motivo" | "confirmar" | "no-se-anulo";

/** El diálogo de anular un cobro, abierto sobre un ticket (39A·02 a 39A·05, 39B·02, 39B·03). */
export interface Anulando {
  ticketId: string;
  paso: PasoDeAnulacion;
  motivo: MotivoDeAnulacion | null;
  /** Lo escrito con «Otro». */
  detalle: string;
  error: string | null;
}

/** Con «Otro» hace falta el texto; con cualquier otro motivo alcanza con elegirlo. */
export const motivoCompleto = (a: Pick<Anulando, "motivo" | "detalle">) =>
  a.motivo !== null && (a.motivo !== MOTIVO_OTRO || a.detalle.trim() !== "");

/**
 * El flujo de «Anular cobro» (vista 39): motivo, segunda confirmación, y lo que pasa si falla. Las escrituras de la vista van
 * de a una (`escribir` devuelve `null` si ya hay una en camino): el doble toque en «Sí, anular el cobro» no manda dos pedidos.
 * Si el servidor dice que pasaron las 72 h, el ticket queda marcado como vencido y no se vuelve a ofrecer.
 */
export function useAnularCobro({
  acciones,
  escribir,
  enLinea,
  ocupado,
  ticketDe,
  alAnulado,
  alYaEstaba,
  alCerrar,
}: {
  acciones: Pick<AccionesCuentas, "anularCobro">;
  escribir: <T>(hacer: () => Promise<ResultadoDeAccion<T>>) => Promise<ResultadoDeAccion<T> | null>;
  enLinea: boolean;
  ocupado: () => boolean;
  ticketDe: (ticketId: string) => TicketDeCuentas | undefined;
  alAnulado: (ticketId: string, anulacion: AnulacionDeCobro) => void;
  alYaEstaba: (ticketId: string) => void;
  /** El diálogo se cerró sin anular (Cancelar, Esc o «Cerrar»): el foco vuelve al botón. */
  alCerrar: (ticketId: string) => void;
}) {
  const [anulando, setAnulando] = useState<Anulando | null>(null);
  const [vencidos, setVencidos] = useState<ReadonlySet<string>>(new Set());

  const sobre = (ticketId: string, cambio: (a: Anulando) => Anulando) =>
    setAnulando((a) => (a?.ticketId === ticketId ? cambio(a) : a));

  function abrir(ticketId: string) {
    if (ocupado() || !enLinea) return;
    setAnulando({ ticketId, paso: "motivo", motivo: null, detalle: "", error: null });
  }

  function cerrar() {
    if (!anulando || ocupado()) return;
    alCerrar(anulando.ticketId);
    setAnulando(null);
  }

  function elegir(motivo: MotivoDeAnulacion) {
    setAnulando((a) => a && { ...a, motivo });
  }

  function escribirDetalle(texto: string) {
    setAnulando((a) => a && { ...a, detalle: texto.slice(0, MAX_DETALLE_DE_OTRO) });
  }

  function seguir() {
    setAnulando((a) => (a && motivoCompleto(a) ? { ...a, paso: "confirmar", error: null } : a));
  }

  function volver() {
    if (ocupado()) return;
    setAnulando((a) => a && { ...a, paso: "motivo", error: null });
  }

  async function confirmar() {
    if (!anulando || !anulando.motivo || !motivoCompleto(anulando) || ocupado()) return;
    const { ticketId, motivo, detalle } = anulando;
    const cobroId = ticketDe(ticketId)?.cobro?.id;
    if (!cobroId) return;
    // Al reintentar, el error anterior se va mientras guarda (39A·05).
    sobre(ticketId, (a) => ({ ...a, error: null }));
    const resultado = await escribir(() => acciones.anularCobro(cobroId, motivo, motivo === MOTIVO_OTRO ? detalle.trim() : undefined));
    if (!resultado) return;
    if (!resultado.ok) {
      if (resultado.codigo === "fuera-de-plazo") {
        // 39B·02: el plazo venció mientras confirmaba. No se reintenta: el cobro sigue como estaba.
        setVencidos((v) => new Set(v).add(ticketId));
        sobre(ticketId, (a) => ({ ...a, paso: "no-se-anulo", error: TEXTO_VENCIO_AL_CONFIRMAR }));
        return;
      }
      const error = textoDeFallaAlAnular(resultado.causa, resultado.mensaje);
      sobre(ticketId, (a) => ({ ...a, error }));
      return;
    }
    setAnulando(null);
    if (resultado.valor.yaEstaba) alYaEstaba(ticketId);
    else alAnulado(ticketId, resultado.valor.anulacion);
  }

  return { anulando, vencidos, abrir, cerrar, elegir, escribirDetalle, seguir, volver, confirmar };
}
