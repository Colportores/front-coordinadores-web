"use client";

import type { StyleSpecification } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";

import { configPublicaSupabase } from "@/datos/supabase/config-publica";
import {
  type CatalogoDeMapas,
  estiloConPaquete,
  leerCatalogo,
  paqueteDeCiudad,
  urlDelCatalogo,
} from "@/features/equipo/zonas/mapa-base/catalogo";

/** Cuánto se espera al catálogo y al estilo antes de darlos por caídos. */
export const ESPERA_MAXIMA_MS = 15_000;

/**
 * Qué se le puede poner de fondo al mapa:
 * - `simple`: no hay Supabase (sitio de prueba, datos simulados): fondo liso con las calles de los datos simulados.
 * - `cargando`: se está pidiendo el catálogo y el estilo.
 * - `listo`: el estilo del bucket con los tiles de la ciudad.
 * - `sin-paquete`: el bucket responde pero todavía no publicó el mapa de esta ciudad.
 * - `falla`: el catálogo, el estilo o su forma no se pudieron leer.
 */
export type MapaBase =
  | { fase: "simple" }
  | { fase: "cargando" }
  | { fase: "listo"; estilo: StyleSpecification }
  | { fase: "sin-paquete" }
  | { fase: "falla" };

async function pedirJson(url: string, cancelar: AbortSignal): Promise<unknown> {
  const control = new AbortController();
  const alCancelar = () => control.abort();
  cancelar.addEventListener("abort", alCancelar);
  const plazo = setTimeout(alCancelar, ESPERA_MAXIMA_MS);
  try {
    const respuesta = await fetch(url, { signal: control.signal });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    return await respuesta.json();
  } finally {
    clearTimeout(plazo);
    cancelar.removeEventListener("abort", alCancelar);
  }
}

/**
 * El mapa de fondo de la ciudad `catalogoId` (ADR-011). Pide el catálogo y el estilo una sola vez por montaje (un fallo no se
 * guarda: `reintentar` los vuelve a pedir) y cambiar de ciudad solo busca otro paquete.
 */
export function useMapaBase(catalogoId: string): { base: MapaBase; reintentar(): void } {
  const supabaseUrl = configPublicaSupabase()?.url ?? null;
  const [intento, setIntento] = useState(0);
  const clave = `${catalogoId}#${intento}`;
  const [resultado, setResultado] = useState<{ clave: string; base: MapaBase } | null>(null);
  const montaje = useRef<AbortController | null>(null);
  const guardado = useRef<{ catalogo?: Promise<CatalogoDeMapas>; estilo?: Promise<unknown> }>({});

  // Los pedidos son del montaje, no de cada ciudad: cambiar de ciudad no los corta. Al desmontar (también el doble montaje de
  // desarrollo) se cortan y se olvidan, para que el siguiente montaje no herede un pedido ya cancelado.
  useEffect(() => {
    const control = new AbortController();
    montaje.current = control;
    return () => {
      control.abort();
      guardado.current = {};
    };
  }, []);

  useEffect(() => {
    const control = montaje.current;
    if (supabaseUrl === null || control === null) return;
    let vigente = true;
    const memoria = guardado.current;
    const urlCatalogo = urlDelCatalogo(supabaseUrl);
    memoria.catalogo ??= pedirJson(urlCatalogo, control.signal).then((json) => leerCatalogo(json, urlCatalogo));
    const catalogo = memoria.catalogo;

    void (async (): Promise<MapaBase> => {
      try {
        const lista = await catalogo;
        const paquete = paqueteDeCiudad(lista, catalogoId);
        if (paquete === null) return { fase: "sin-paquete" };
        memoria.estilo ??= pedirJson(lista.estiloUrl, control.signal);
        const pedido = memoria.estilo;
        const estilo = await pedido.catch((error: unknown) => {
          if (memoria.estilo === pedido) memoria.estilo = undefined;
          throw error;
        });
        return { fase: "listo", estilo: estiloConPaquete(estilo, paquete) };
      } catch {
        // Un fallo no se guarda: «Reintentar» vuelve a pedirlo.
        if (memoria.catalogo === catalogo) memoria.catalogo = undefined;
        return { fase: "falla" };
      }
    })().then((base) => {
      if (vigente) setResultado({ clave, base });
    });
    return () => {
      vigente = false;
    };
  }, [catalogoId, clave, supabaseUrl]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  if (supabaseUrl === null) return { base: { fase: "simple" }, reintentar };
  return { base: resultado?.clave === clave ? resultado.base : { fase: "cargando" }, reintentar };
}
