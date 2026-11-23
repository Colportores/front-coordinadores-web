"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { CasaDeCiudad } from "@/datos/equipo/zonas";

export type FaseDeCasas = "cargando" | "listo" | "error";

export interface CasasDeCiudad {
  /** De qué ciudad son `casas`: lo que llega de otra ciudad se descarta. */
  ciudadId: string;
  fase: FaseDeCasas;
  casas: CasaDeCiudad[];
  /** Cuándo se trajeron `casas`; `null` mientras no se trajo nada. */
  actualizadoA: Date | null;
  /** No hay red: se ven las casas que ya se habían traído (24P·08). */
  sinConexion: boolean;
}

const SIN_CASAS: CasaDeCiudad[] = [];
const sinNada = (ciudadId: string): CasasDeCiudad => ({ ciudadId, fase: "cargando", casas: SIN_CASAS, actualizadoA: null, sinConexion: false });

const hayRed = () => typeof navigator === "undefined" || navigator.onLine !== false;

interface Entrada {
  ciudadId: string;
  pedir(ciudadId: string): Promise<CasaDeCiudad[]>;
  /** Cada vez que sube, se vuelve a pedir (se guardó o eliminó una zona: cambia qué casas incluye cada una). */
  recarga: number;
}

/**
 * Las casas de la ciudad elegida para el mapa de la vista 24 (HU-CAM-006), todas, estén o no en una zona. Se piden al elegir la ciudad, al cambiar sus zonas y
 * con «Reintentar» o al volver la red. Una respuesta vieja (otra ciudad, o un pedido que ya se reemplazó) no pisa a la nueva.
 * Si falla, nunca se toma por «no hay casas»: queda `error`, o `sinConexion` si no hay red y ya había casas.
 */
export function useCasasDeCiudad({ ciudadId, pedir, recarga }: Entrada): CasasDeCiudad & { reintentar(): void } {
  const [estado, setEstado] = useState<CasasDeCiudad>(() => sinNada(ciudadId));
  const [reintentos, setReintentos] = useState(0);
  const version = useRef(0);

  useEffect(() => {
    const miVersion = ++version.current;
    // Sin ciudad (la campaña todavía no tiene ninguna) no hay nada que pedir: solo se descarta lo que venga en camino.
    if (ciudadId === "") return;
    pedir(ciudadId)
      .then((casas) => {
        if (miVersion !== version.current) return;
        setEstado({ ciudadId, fase: "listo", casas, actualizadoA: new Date(), sinConexion: false });
      })
      .catch(() => {
        if (miVersion !== version.current) return;
        setEstado((antes) =>
          !hayRed() && antes.ciudadId === ciudadId && antes.casas.length > 0
            ? { ...antes, fase: "listo", sinConexion: true }
            : { ciudadId, fase: "error", casas: SIN_CASAS, actualizadoA: null, sinConexion: false },
        );
      });
  }, [ciudadId, pedir, recarga, reintentos]);

  /** «Reintentar» o la red que vuelve: se pide de nuevo, y si no hay casas a la vista, el aviso pasa de error a «Cargando…». */
  const volverAPedir = useCallback(() => {
    setEstado((antes) => (antes.fase === "error" ? { ...antes, fase: "cargando" } : antes));
    setReintentos((n) => n + 1);
  }, []);

  // La red se va con las casas ya a la vista: se avisa; vuelve y falta algo, se pide de nuevo.
  const faltaAlgo = estado.fase === "error" || estado.sinConexion;
  useEffect(() => {
    const sinRed = () => setEstado((antes) => (antes.casas.length > 0 && antes.fase === "listo" ? { ...antes, sinConexion: true } : antes));
    const conRed = () => {
      if (faltaAlgo) volverAPedir();
    };
    window.addEventListener("offline", sinRed);
    window.addEventListener("online", conRed);
    return () => {
      window.removeEventListener("offline", sinRed);
      window.removeEventListener("online", conRed);
    };
  }, [faltaAlgo, volverAPedir]);

  // Lo que quedó de otra ciudad no se muestra.
  const vigente = estado.ciudadId === ciudadId ? estado : sinNada(ciudadId);
  return { ...vigente, reintentar: volverAPedir };
}
