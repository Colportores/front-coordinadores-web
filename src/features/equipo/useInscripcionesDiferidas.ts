"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ResultadoInscripcion } from "@/datos/equipo/contrato";
import { motivoDelRechazo, type MotivoDeRechazo } from "@/auth/sesion-vencida";
import { mensajeSinConexion } from "@/lib/mensajes";
import { fueAbandonado, registrarEnvio, registrarFuente, trabajoCambio } from "@/shell/trabajo-pendiente";

/** Cuánto demora la inscripción tras «Añadir», y cuánto dura el aviso con «Deshacer» (decisión de Cristian, 30/09; diseño 23). */
export const MS_DESHACER = 8000;

/** Falla de red al añadir: dice la acción (convención §10). */
export const mensajeAnadirSinConexion = (nombre: string) => mensajeSinConexion(`añadir a ${nombre}`);

/**
 * Rechazo del servidor al añadir, cuando el detalle que se ve no es el de esa cuenta: nombra a quien falló en vez de
 * leerse como un reproche a otra (decisión del agente de decisiones en #19, mapa §2). Si sigue elegida la misma, queda
 * el literal de la HU («Está en campaña X. Reasignar primero.»).
 */
export const mensajeAnadirRechazado = (nombre: string, mensaje: string) => `No se pudo añadir a ${nombre}. ${mensaje}`;

/** El plazo de una cuenta: su temporizador y cuánto falta (se congela mientras el foco está en su «Deshacer»). */
interface Plazo {
  cuenta: Anadido;
  temporizador: ReturnType<typeof setTimeout> | null;
  /** Instante (`Date.now()`) en que vence, mientras corre. */
  vence: number;
  /** Milisegundos que faltan, mientras está en pausa. */
  restante: number;
  enPausa: boolean;
}

export interface Anadido {
  id: string;
  nombre: string;
}

/**
 * Por qué no prosperó el envío: la base lo rechazó (con su texto), la llamada se cayó o el panel ya no la deja pasar (#41, P3: la
 * sesión venció, la cuenta no tiene acceso o está suspendida; no es una caída, la persona tiene que volver a entrar).
 */
export type CausaFallo =
  | {
      tipo: "rechazo";
      mensaje: string;
      /** `CI007`: la campaña donde ya está la cuenta (la vista la marca como bloqueada). */
      campaniaEnConflicto?: { id: string; nombre: string };
    }
  | { tipo: "sin-conexion" }
  | { tipo: "acceso"; motivo: MotivoDeRechazo };

interface Opciones {
  inscribir: (usuarioId: string) => Promise<ResultadoInscripcion>;
  /** El envío no prosperó: la cuenta ya no figura como añadida y quien usa el hook arma el aviso para la persona. */
  alFallar: (cuenta: Anadido, causa: CausaFallo) => void;
  /**
   * Se da por terminado el plazo de «Deshacer» de esa cuenta (venció, o se manda ya porque la persona se va); se llama
   * justo antes de sacar su aviso y de mandar la inscripción.
   */
  alVencerPlazo?: (id: string) => void;
}

/**
 * «Añadir» no inscribe al toque: la cuenta queda como añadida y la inscripción se manda recién a los 8 s si no se tocó
 * «Deshacer» (decisión de Cristian, 30/09). Cada cuenta tiene su propio aviso y su propio plazo, y se manda por separado.
 *
 * Nada se pierde sin aviso:
 * - Si se va de la vista (cambio de ruta, cierre de la pestaña) con cuentas dentro del plazo, se mandan en ese momento.
 *   Al cerrar o recargar la pestaña el navegador además pregunta antes de irse, porque ahí el envío puede no llegar: lo
 *   que está dentro del plazo o sin contestar se anota en `@/shell/trabajo-pendiente`, que también deja al menú de
 *   secciones esperar antes de cambiar de pestaña y sigue avisando si la vista ya se fue pero un envío no contestó.
 * - Si el envío falla (regla o conexión), la cuenta vuelve a figurar sin añadir, el botón se habilita y `alFallar` avisa.
 *
 * «Deshacer AA» (decisión de Cristian, 21/10, WCAG 2.2.1): mientras el «Deshacer» de una cuenta tiene el foco (teclado o
 * lector), su plazo no corre (`pausar`); al soltarlo sigue con lo que faltaba (`reanudar`). Mientras tanto la inscripción
 * se manda igual al cerrarse el aviso o al irse de la vista, como siempre.
 */
export function useInscripcionesDiferidas({ inscribir, alFallar, alVencerPlazo }: Opciones) {
  /** Lo que se muestra como añadido: dentro del plazo, enviándose o ya enviado. */
  const [anadidos, setAnadidos] = useState<Anadido[]>([]);
  /** Las que todavía se pueden deshacer. */
  const [avisos, setAvisos] = useState<Anadido[]>([]);
  const [enviando, setEnviando] = useState(0);

  const plazos = useRef(new Map<string, Plazo>());
  const envios = useRef(new Map<string, Promise<boolean>>());
  // Quita el doble toque: el estado tarda un render en reflejar el primero.
  const conocidos = useRef(new Set<string>());
  const ultimo = useRef({ inscribir, alFallar, alVencerPlazo });
  useEffect(() => {
    ultimo.current = { inscribir, alFallar, alVencerPlazo };
  });

  /** Manda la inscripción ya. Devuelve si prosperó; nunca rechaza. */
  const enviar = useCallback((cuenta: Anadido): Promise<boolean> => {
    const plazo = plazos.current.get(cuenta.id);
    if (plazo) {
      if (plazo.temporizador !== null) clearTimeout(plazo.temporizador);
      plazos.current.delete(cuenta.id);
    }
    setAvisos((previos) => previos.filter((a) => a.id !== cuenta.id));

    const envio = (async () => {
      let causa: CausaFallo | null = null;
      try {
        const resultado = await ultimo.current.inscribir(cuenta.id);
        if (!resultado.ok && resultado.sesionVencida) {
          causa = { tipo: "acceso", motivo: "vencida" };
        } else if (!resultado.ok) {
          causa = { tipo: "rechazo", mensaje: resultado.mensaje };
          if (resultado.campaniaEnConflicto) causa.campaniaEnConflicto = resultado.campaniaEnConflicto;
        }
      } catch (error) {
        // Si la llamada se cae, nada queda «enviándose»: se puede volver a intentar. Si el proxy dijo que no hay sesión (o acceso),
        // no es una caída: «Reintentar» no sirve, hay que entrar de nuevo.
        const motivo = motivoDelRechazo(error);
        causa = motivo ? { tipo: "acceso", motivo } : { tipo: "sin-conexion" };
      }
      envios.current.delete(cuenta.id);
      setEnviando(envios.current.size);
      trabajoCambio();
      if (causa === null) return true;
      conocidos.current.delete(cuenta.id);
      setAnadidos((previos) => previos.filter((a) => a.id !== cuenta.id));
      ultimo.current.alFallar(cuenta, causa);
      return false;
    })();
    envios.current.set(cuenta.id, envio);
    setEnviando(envios.current.size);
    // Cuenta como trabajo sin contestar aunque la vista se vaya antes de que conteste.
    registrarEnvio(envio);
    return envio;
  }, []);

  /** Agenda el vencimiento del plazo: pasados `ms`, su aviso se saca y la inscripción se manda. */
  const correr = useCallback(
    (cuenta: Anadido, ms: number) =>
      setTimeout(() => {
        ultimo.current.alVencerPlazo?.(cuenta.id);
        void enviar(cuenta);
      }, ms),
    [enviar],
  );

  /** Deja la cuenta como añadida con su plazo. Devuelve `false` si ya lo estaba (el doble toque no suma un segundo aviso). */
  const programar = useCallback(
    (cuenta: Anadido): boolean => {
      if (conocidos.current.has(cuenta.id)) return false;
      conocidos.current.add(cuenta.id);
      setAnadidos((previos) => [...previos, cuenta]);
      setAvisos((previos) => [...previos, cuenta]);
      plazos.current.set(cuenta.id, {
        cuenta,
        temporizador: correr(cuenta, MS_DESHACER),
        vence: Date.now() + MS_DESHACER,
        restante: MS_DESHACER,
        enPausa: false,
      });
      trabajoCambio();
      return true;
    },
    [correr],
  );

  /** Congela el plazo de esa cuenta: el foco llegó a su «Deshacer». Si ya estaba en pausa o ya no hay plazo, no hace nada. */
  const pausar = useCallback((id: string) => {
    const plazo = plazos.current.get(id);
    if (!plazo || plazo.enPausa) return;
    if (plazo.temporizador !== null) clearTimeout(plazo.temporizador);
    plazo.temporizador = null;
    plazo.restante = Math.max(0, plazo.vence - Date.now());
    plazo.enPausa = true;
  }, []);

  /** Vuelve a correr el plazo con lo que faltaba: el foco salió de su «Deshacer». */
  const reanudar = useCallback(
    (id: string) => {
      const plazo = plazos.current.get(id);
      if (!plazo || !plazo.enPausa) return;
      plazo.enPausa = false;
      plazo.vence = Date.now() + plazo.restante;
      plazo.temporizador = correr(plazo.cuenta, plazo.restante);
    },
    [correr],
  );

  /** Cancela la inscripción de esa cuenta si todavía está dentro del plazo. Devuelve si lo estaba. */
  const deshacer = useCallback((id: string): boolean => {
    const plazo = plazos.current.get(id);
    if (!plazo) return false;
    if (plazo.temporizador !== null) clearTimeout(plazo.temporizador);
    plazos.current.delete(id);
    conocidos.current.delete(id);
    setAnadidos((previos) => previos.filter((a) => a.id !== id));
    setAvisos((previos) => previos.filter((a) => a.id !== id));
    trabajoCambio();
    return true;
  }, []);

  /**
   * Manda ya las que están dentro del plazo y espera a todos los envíos, menos los que ya agotaron el tope de una espera
   * (un servidor colgado no hace esperar otros 10 s a cada intento de irse). Devuelve si todos prosperaron.
   */
  const confirmarTodas = useCallback(async (): Promise<boolean> => {
    for (const { cuenta } of [...plazos.current.values()]) {
      // Su aviso se saca ya, igual que cuando vence el plazo: si el foco estaba en su «Deshacer», que no caiga al `body`.
      ultimo.current.alVencerPlazo?.(cuenta.id);
      void enviar(cuenta);
    }
    const resultados = await Promise.all([...envios.current.values()].filter((envio) => !fueAbandonado(envio)));
    return resultados.every(Boolean);
  }, [enviar]);

  // Al irse de la vista: lo que está dentro del plazo se manda. `pagehide` cubre cerrar o recargar la pestaña (el envío
  // puede no llegar: para eso está el aviso de abajo); el cleanup, un cambio de ruta dentro del panel.
  useEffect(() => {
    const alIrse = () => {
      for (const { cuenta } of [...plazos.current.values()]) void enviar(cuenta);
    };
    window.addEventListener("pagehide", alIrse);
    return () => {
      window.removeEventListener("pagehide", alIrse);
      alIrse();
    };
  }, [enviar]);

  // Mientras haya algo dentro del plazo o sin contestar, cerrar o recargar la pestaña pide confirmación, y el menú de
  // secciones espera antes de cambiar de pestaña (ver `@/shell/trabajo-pendiente`).
  useEffect(
    () =>
      registrarFuente({
        hayPorMandar: () => plazos.current.size > 0,
        confirmar: confirmarTodas,
      }),
    [confirmarTodas],
  );

  return { anadidos, avisos, enviando: enviando > 0, programar, deshacer, pausar, reanudar, confirmarTodas };
}
