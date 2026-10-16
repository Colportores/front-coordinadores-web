"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ResultadoInscripcion } from "@/datos/equipo/contrato";
import { mensajeSinConexion } from "@/lib/mensajes";

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

export interface Anadido {
  id: string;
  nombre: string;
}

/** Por qué no prosperó el envío: la base lo rechazó (con su texto) o la llamada se cayó. */
export type CausaFallo =
  | {
      tipo: "rechazo";
      mensaje: string;
      /** `CI007`: la campaña donde ya está la cuenta (la vista la marca como bloqueada). */
      campaniaEnConflicto?: { id: string; nombre: string };
    }
  | { tipo: "sin-conexion" };

interface Opciones {
  inscribir: (usuarioId: string) => Promise<ResultadoInscripcion>;
  /** El envío no prosperó: la cuenta ya no figura como añadida y quien usa el hook arma el aviso para la persona. */
  alFallar: (cuenta: Anadido, causa: CausaFallo) => void;
  /** Venció el plazo de «Deshacer» de esa cuenta; se llama justo antes de sacar su aviso y de mandar la inscripción. */
  alVencerPlazo?: (id: string) => void;
}

/**
 * «Añadir» no inscribe al toque: la cuenta queda como añadida y la inscripción se manda recién a los 8 s si no se tocó
 * «Deshacer» (decisión de Cristian, 30/09). Cada cuenta tiene su propio aviso y su propio plazo, y se manda por separado.
 *
 * Nada se pierde sin aviso:
 * - Si se va de la vista (cambio de ruta, cierre de la pestaña) con cuentas dentro del plazo, se mandan en ese momento.
 *   Al cerrar o recargar la pestaña el navegador además pregunta antes de irse, porque ahí el envío puede no llegar.
 * - Si el envío falla (regla o conexión), la cuenta vuelve a figurar sin añadir, el botón se habilita y `alFallar` avisa.
 */
export function useInscripcionesDiferidas({ inscribir, alFallar, alVencerPlazo }: Opciones) {
  /** Lo que se muestra como añadido: dentro del plazo, enviándose o ya enviado. */
  const [anadidos, setAnadidos] = useState<Anadido[]>([]);
  /** Las que todavía se pueden deshacer. */
  const [avisos, setAvisos] = useState<Anadido[]>([]);
  const [enviando, setEnviando] = useState(0);

  const plazos = useRef(new Map<string, { cuenta: Anadido; temporizador: ReturnType<typeof setTimeout> }>());
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
      clearTimeout(plazo.temporizador);
      plazos.current.delete(cuenta.id);
    }
    setAvisos((previos) => previos.filter((a) => a.id !== cuenta.id));

    const envio = (async () => {
      let causa: CausaFallo | null = null;
      try {
        const resultado = await ultimo.current.inscribir(cuenta.id);
        if (!resultado.ok) {
          causa = { tipo: "rechazo", mensaje: resultado.mensaje };
          if (resultado.campaniaEnConflicto) causa.campaniaEnConflicto = resultado.campaniaEnConflicto;
        }
      } catch {
        // Si la llamada se cae, nada queda «enviándose»: se puede volver a intentar.
        causa = { tipo: "sin-conexion" };
      }
      envios.current.delete(cuenta.id);
      setEnviando(envios.current.size);
      if (causa === null) return true;
      conocidos.current.delete(cuenta.id);
      setAnadidos((previos) => previos.filter((a) => a.id !== cuenta.id));
      ultimo.current.alFallar(cuenta, causa);
      return false;
    })();
    envios.current.set(cuenta.id, envio);
    setEnviando(envios.current.size);
    return envio;
  }, []);

  /** Deja la cuenta como añadida con su plazo. Devuelve `false` si ya lo estaba (el doble toque no suma un segundo aviso). */
  const programar = useCallback(
    (cuenta: Anadido): boolean => {
      if (conocidos.current.has(cuenta.id)) return false;
      conocidos.current.add(cuenta.id);
      setAnadidos((previos) => [...previos, cuenta]);
      setAvisos((previos) => [...previos, cuenta]);
      const temporizador = setTimeout(() => {
        ultimo.current.alVencerPlazo?.(cuenta.id);
        void enviar(cuenta);
      }, MS_DESHACER);
      plazos.current.set(cuenta.id, { cuenta, temporizador });
      return true;
    },
    [enviar],
  );

  /** Cancela la inscripción de esa cuenta si todavía está dentro del plazo. Devuelve si lo estaba. */
  const deshacer = useCallback((id: string): boolean => {
    const plazo = plazos.current.get(id);
    if (!plazo) return false;
    clearTimeout(plazo.temporizador);
    plazos.current.delete(id);
    conocidos.current.delete(id);
    setAnadidos((previos) => previos.filter((a) => a.id !== id));
    setAvisos((previos) => previos.filter((a) => a.id !== id));
    return true;
  }, []);

  /** Manda ya las que están dentro del plazo y espera a todos los envíos. Devuelve si todos prosperaron. */
  const confirmarTodas = useCallback(async (): Promise<boolean> => {
    for (const { cuenta } of [...plazos.current.values()]) void enviar(cuenta);
    const resultados = await Promise.all([...envios.current.values()]);
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

  // Mientras haya algo dentro del plazo o sin contestar, cerrar o recargar la pestaña pide confirmación.
  const hayTrabajo = avisos.length > 0 || enviando > 0;
  useEffect(() => {
    if (!hayTrabajo) return;
    const preguntar = (evento: BeforeUnloadEvent) => {
      evento.preventDefault();
      evento.returnValue = "";
    };
    window.addEventListener("beforeunload", preguntar);
    return () => window.removeEventListener("beforeunload", preguntar);
  }, [hayTrabajo]);

  return { anadidos, avisos, enviando: enviando > 0, programar, deshacer, confirmarTodas };
}
