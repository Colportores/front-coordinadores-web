"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fueAbandonado, registrarEnvio, registrarFuente, trabajoCambio } from "@/shell/trabajo-pendiente";

import { MS_DESHACER } from "./modelo";

interface Plazo<T> {
  item: T;
  temporizador: ReturnType<typeof setTimeout> | null;
  vence: number;
  restante: number;
  enPausa: boolean;
}

interface Opciones<T extends { id: string }> {
  /** Manda la validación. `true` si prosperó; nunca rechaza (quien la pasa arma el aviso si falla). */
  enviar: (item: T) => Promise<boolean>;
  /** Se cerró el plazo de «Deshacer» de ese ítem (venció o se manda ya porque la persona se va). */
  alVencerPlazo?: (id: string) => void;
}

/**
 * «Validar» no valida al toque (29 A·03): el ticket queda como validado, aparece el aviso con «Deshacer» y la validación se
 * manda recién a los 8 s. Validar en el servidor acredita y no se deshace, por eso se espera. Como «Añadir» de la vista 23:
 * - cada ticket tiene su plazo y se manda por separado: dos validaciones seguidas no se pisan ni se pierde ninguna;
 * - mientras el foco está en su «Deshacer» el plazo no corre (WCAG 2.2.1, decisión de Cristian del 21/10);
 * - si se va de la vista (cambio de ruta, cerrar o recargar), lo que está dentro del plazo se manda en ese momento, y el
 *   shell (`@/shell/trabajo-pendiente`) espera o pregunta antes de irse.
 */
export function useValidacionesDiferidas<T extends { id: string }>({ enviar, alVencerPlazo }: Opciones<T>) {
  const [avisos, setAvisos] = useState<T[]>([]);
  const plazos = useRef(new Map<string, Plazo<T>>());
  const envios = useRef(new Map<string, Promise<boolean>>());
  const ultimo = useRef({ enviar, alVencerPlazo });
  useEffect(() => {
    ultimo.current = { enviar, alVencerPlazo };
  });

  const mandar = useCallback((item: T): Promise<boolean> => {
    const plazo = plazos.current.get(item.id);
    if (plazo?.temporizador != null) clearTimeout(plazo.temporizador);
    plazos.current.delete(item.id);
    setAvisos((previos) => previos.filter((a) => a.id !== item.id));
    const envio = ultimo.current
      .enviar(item)
      .catch(() => false)
      .finally(() => {
        envios.current.delete(item.id);
        trabajoCambio();
      });
    envios.current.set(item.id, envio);
    registrarEnvio(envio);
    return envio;
  }, []);

  const correr = useCallback(
    (item: T, ms: number) =>
      setTimeout(() => {
        ultimo.current.alVencerPlazo?.(item.id);
        void mandar(item);
      }, ms),
    [mandar],
  );

  /** Deja el ítem dentro del plazo. `false` si ya lo estaba o ya se mandó (el doble toque no valida dos veces). */
  const programar = useCallback(
    (item: T): boolean => {
      if (plazos.current.has(item.id) || envios.current.has(item.id)) return false;
      plazos.current.set(item.id, { item, temporizador: correr(item, MS_DESHACER), vence: Date.now() + MS_DESHACER, restante: MS_DESHACER, enPausa: false });
      setAvisos((previos) => [...previos, item]);
      trabajoCambio();
      return true;
    },
    [correr],
  );

  /** Cancela la validación si todavía está dentro del plazo. Devuelve si lo estaba. */
  const deshacer = useCallback((id: string): boolean => {
    const plazo = plazos.current.get(id);
    if (!plazo) return false;
    if (plazo.temporizador !== null) clearTimeout(plazo.temporizador);
    plazos.current.delete(id);
    setAvisos((previos) => previos.filter((a) => a.id !== id));
    trabajoCambio();
    return true;
  }, []);

  const pausar = useCallback((id: string) => {
    const plazo = plazos.current.get(id);
    if (!plazo || plazo.enPausa) return;
    if (plazo.temporizador !== null) clearTimeout(plazo.temporizador);
    plazo.temporizador = null;
    plazo.restante = Math.max(0, plazo.vence - Date.now());
    plazo.enPausa = true;
  }, []);

  const reanudar = useCallback(
    (id: string) => {
      const plazo = plazos.current.get(id);
      if (!plazo?.enPausa) return;
      plazo.enPausa = false;
      plazo.vence = Date.now() + plazo.restante;
      plazo.temporizador = correr(plazo.item, plazo.restante);
    },
    [correr],
  );

  const confirmarTodas = useCallback(async (): Promise<boolean> => {
    for (const { item } of [...plazos.current.values()]) {
      ultimo.current.alVencerPlazo?.(item.id);
      void mandar(item);
    }
    const resultados = await Promise.all([...envios.current.values()].filter((e) => !fueAbandonado(e)));
    return resultados.every(Boolean);
  }, [mandar]);

  useEffect(() => {
    const alIrse = () => {
      for (const { item } of [...plazos.current.values()]) void mandar(item);
    };
    window.addEventListener("pagehide", alIrse);
    return () => {
      window.removeEventListener("pagehide", alIrse);
      alIrse();
    };
  }, [mandar]);

  useEffect(() => registrarFuente({ hayPorMandar: () => plazos.current.size > 0, confirmar: confirmarTodas }), [confirmarTodas]);

  return { avisos, programar, deshacer, pausar, reanudar };
}
