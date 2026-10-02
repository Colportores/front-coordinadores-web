import { fuenteEquipo } from "@/datos/equipo";
import type { ResultadoInscripcion } from "@/datos/equipo";

/**
 * Server action de la vista 23: inscribir en la campaña. `campaniaId` queda atado
 * a la acción (Next lo cifra), el navegador no lo puede cambiar.
 *
 * Este módulo no entra al build exportado del sitio de prueba (no hay servidor
 * ahí): la página lo importa solo cuando no es ese build. Ver README, «Sitio de prueba».
 */
export function crearInscribirServidor(campaniaId: string): (usuarioId: string) => Promise<ResultadoInscripcion> {
  return async function inscribir(usuarioId) {
    "use server";
    return fuenteEquipo.inscribirColportor(campaniaId, usuarioId);
  };
}
