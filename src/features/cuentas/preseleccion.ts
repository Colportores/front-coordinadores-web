import type { DatosDeCuentas } from "@/datos/cuentas";

import { TODAS, type Seleccion } from "./modelo";

/** El parámetro de la URL con el que Stock (vista 34, «Ver en Cuentas →») manda a Cuentas a mirar a un colportor. */
export const PARAMETRO_COLPORTOR = "colportor";

/** El enlace de «Ver en Cuentas →» de una colportora en Stock: Cuentas en su ciudad, con su fila resaltada. */
export function hrefCuentasDe(colportorId: string): string {
  return `/cuentas?${PARAMETRO_COLPORTOR}=${encodeURIComponent(colportorId)}`;
}

export const TEXTO_COLPORTOR_NO_ENCONTRADO =
  "No encontramos a ese colportor en Cuentas (puede que ya se haya dado de baja o que todavía no tenga ciudad). Elegí su ciudad en la lista de la izquierda.";

export interface PreseleccionDeCuentas {
  /** La ciudad con la que abre la vista; «todas» si no se pidió ninguno o no se lo encuentra. */
  seleccion: Seleccion;
  /** El colportor cuya fila se resalta; `null` si no se pidió ninguno o no está. */
  colportorId: string | null;
  /** Lo que hay que avisar cuando se pidió a alguien y no se lo encontró: qué pasó y qué hacer. */
  aviso: string | null;
}

export function preseleccionDe(datos: DatosDeCuentas, colportorId: string | null): PreseleccionDeCuentas {
  if (colportorId === null || colportorId === "") return { seleccion: TODAS, colportorId: null, aviso: null };
  const colportor = datos.colportores.find((c) => c.id === colportorId);
  if (!colportor || !datos.ciudades.some((c) => c.id === colportor.ciudadId)) {
    return { seleccion: TODAS, colportorId: null, aviso: TEXTO_COLPORTOR_NO_ENCONTRADO };
  }
  return { seleccion: { tipo: "ciudad", ciudadId: colportor.ciudadId }, colportorId: colportor.id, aviso: null };
}
