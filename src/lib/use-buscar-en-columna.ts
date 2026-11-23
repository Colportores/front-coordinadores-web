"use client";

import { useState } from "react";

import { buscarEnColumna, hayBuscadorDeCiudades, type VistaDeBusqueda } from "@/lib/buscar-ciudades";

export interface BusquedaEnColumna<T> extends VistaDeBusqueda<T> {
  texto: string;
  setTexto: (texto: string) => void;
  /** Hay más ciudades que el umbral: se muestra el campo. */
  conBuscador: boolean;
  /** Hay algo escrito (y campo): la columna deja de agrupar por departamento y muestra `visibles`. */
  buscando: boolean;
}

/**
 * El estado de la búsqueda de ciudades de una columna (#195). `nodos` son todos los renglones elegibles («Todas», «Todo el
 * departamento» y las ciudades); `esCiudad` dice cuáles se buscan por nombre. Se cierra con la columna: al contraerla y volver a
 * expandirla, la búsqueda arranca vacía y la ciudad elegida sigue a la vista (#193).
 */
export function useBuscarEnColumna<T extends { clave: string; nombre: string }>(
  nodos: readonly T[],
  esCiudad: (nodo: T) => boolean,
  claveElegida: string,
): BusquedaEnColumna<T> {
  const [texto, setTexto] = useState("");
  const total = nodos.filter(esCiudad).length;
  const conBuscador = hayBuscadorDeCiudades(total);
  const buscando = conBuscador && texto.trim() !== "";
  const vista = buscarEnColumna(nodos, esCiudad, buscando ? texto : "", claveElegida);
  return { ...vista, texto, setTexto, conBuscador, buscando };
}
