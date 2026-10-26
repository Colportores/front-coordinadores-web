"use server";

import { fuenteShell } from "@/datos/shell";
import type { ResultadoCampanias } from "@/datos/shell";
import { pedirCampanias } from "@/datos/shell/pedir-campanias";

/**
 * Server action del topbar (#70): la lista de campañas que se eligen («en curso» y «por empezar»), que se pide al abrir el
 * selector y no al cargar el panel. El navegador no manda nada: de quién es la lista lo dice la sesión del servidor.
 *
 * Este módulo no entra al build exportado del sitio de prueba (no hay servidor ahí): el layout lo importa solo cuando no es
 * ese build, y el topbar usa la lista simulada desde el navegador. Ver README, «Sitio de prueba».
 */
export async function listarCampaniasAccion(): Promise<ResultadoCampanias> {
  return pedirCampanias(fuenteShell);
}
