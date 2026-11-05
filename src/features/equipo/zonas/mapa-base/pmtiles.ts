import { addProtocol } from "maplibre-gl";
import { Protocol } from "pmtiles";

let registrado = false;

/**
 * Enseña a MapLibre a leer `pmtiles://<url>` (pide solo los rangos del archivo que necesita, por HTTP `Range`).
 * Se llama una vez al cargar el mapa; repetirlo es inofensivo.
 */
export function registrarPmtiles(): void {
  if (registrado) return;
  addProtocol("pmtiles", new Protocol().tile);
  registrado = true;
}
