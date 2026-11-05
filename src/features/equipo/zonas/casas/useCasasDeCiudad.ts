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
  /** Las zonas vivas de la ciudad: `casas_de_zona()` se pide de a una. */
  zonaIds: string[];
  pedir(zonaIds: string[]): Promise<CasaDeCiudad[]>;
  /** Cada vez que sube, se vuelve a pedir (se guardó o eliminó una zona: cambia qué casas incluye cada una). */
  recarga: number;
}

/**
 * Las casas de la ciudad elegida para el mapa de la vista 24 (HU-CAM-006). Se piden al elegir la ciudad, al cambiar sus zonas y
 * con «Reintentar» o al volver la red. Una respuesta vieja (otra ciudad, o un pedido que ya se reemplazó) no pisa a la nueva.
 * Si falla, nunca se toma por «no hay casas»: queda `error`, o `sinConexion` si no hay red y ya había casas.
 */
export function useCasasDeCiudad({ ciudadId, zonaIds, pedir, recarga }: Entrada): CasasDeCiudad & { reintentar(): void } {
  const [estado, setEstado] = useState<CasasDeCiudad>(() => sinNada(ciudadId));
  const [reintentos, setReintentos] = useState(0);
  const version = useRef(0);
  const clave = zonaIds.join(",");

  useEffect(() => {
    const miVersion = ++version.current;
    const ids = clave === "" ? [] : clave.split(",");
    // Una ciudad sin zonas no tiene casas que pedir (las casas llegan por zona): solo se descarta lo que venga en camino.
    if (ids.length === 0) return;
    pedir(ids)
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
  }, [ciudadId, clave, pedir, recarga, reintentos]);

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

  // Lo que quedó de otra ciudad no se muestra; una ciudad sin zonas no tiene nada que cargar.
  const vigente = zonaIds.length === 0 ? { ...sinNada(ciudadId), fase: "listo" as const } : estado.ciudadId === ciudadId ? estado : sinNada(ciudadId);
  return { ...vigente, reintentar: volverAPedir };
}
