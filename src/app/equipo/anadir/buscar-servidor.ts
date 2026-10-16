import { fuenteEquipo } from "@/datos/equipo";
import type { ResultadoBusqueda } from "@/datos/equipo";

/**
 * Server action de la vista 23: una página de la búsqueda de cuentas. `campaniaId` queda atado a la acción (Next lo
 * cifra), el navegador no lo puede cambiar; el texto y el cursor sí vienen de él, y la fuente de datos los valida.
 *
 * Este módulo no entra al build exportado del sitio de prueba (no hay servidor ahí): la página lo importa solo cuando
 * no es ese build. Ver README, «Sitio de prueba».
 */
export function crearBuscarServidor(
  campaniaId: string,
): (texto: string, despuesDe: string | null) => Promise<ResultadoBusqueda> {
  return async function buscar(texto, despuesDe) {
    "use server";
    return fuenteEquipo.buscarCandidatos(campaniaId, texto, despuesDe);
  };
}
