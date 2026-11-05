import { addProtocol, removeProtocol } from "maplibre-gl";
import { Protocol } from "pmtiles";

let registrado = false;

function registrar(): void {
  addProtocol("pmtiles", new Protocol().tile);
  registrado = true;
}

/**
 * Enseña a MapLibre a leer `pmtiles://<url>` (pide solo los rangos del archivo que necesita, por HTTP `Range`).
 * Se llama una vez al cargar el mapa; repetirlo es inofensivo.
 */
export function registrarPmtiles(): void {
  if (!registrado) registrar();
}

/**
 * Descarta lo que el protocolo recuerda de los archivos. Cada `Protocol` guarda por URL el encabezado y los directorios que
 * pidió, **también los que fallaron** (pmtiles 4.5.0 no los saca de su caché): tras un corte de red, remontar el mapa
 * devolvería la misma promesa rechazada y nunca volvería a pedir el archivo. «Reintentar» lo llama antes de remontar.
 */
export function olvidarArchivosPmtiles(): void {
  if (registrado) removeProtocol("pmtiles");
  registrar();
}
