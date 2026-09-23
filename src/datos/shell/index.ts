/**
 * Único punto de selección de la fuente de datos del shell.
 * Al conectar el BFF se cambia esta línea por la implementación real;
 * las vistas importan `fuenteShell` y no se tocan.
 */
import type { FuenteDatosShell } from "@/datos/shell/contrato";
import { fuenteShellSimulada } from "@/datos/shell/simulado";

export type { FuenteDatosShell, ResumenCoordinador } from "@/datos/shell/contrato";

export const fuenteShell: FuenteDatosShell = fuenteShellSimulada;
