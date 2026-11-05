import { fuenteInicio } from "@/datos/inicio";
import { pedirTablero } from "@/datos/inicio/pedir-tablero";
import type { AccionesInicio } from "@/features/inicio/InicioVista";

/**
 * Server actions de la vista 31: el navegador pide otro día y el servidor le habla a la fuente (la RPC `tablero_de_inicio`
 * bajo el puente de desarrollo, la simulada en cualquier build de producción). `campaniaId` queda atado a la acción (Next
 * lo cifra): el navegador no lo puede cambiar. El resultado lleva la causa de una falla, porque una server action de
 * producción tapa el mensaje de lo que tira.
 *
 * Este módulo no entra al build exportado del sitio de prueba (no hay servidor ahí): la página lo importa solo cuando no es
 * ese build. Ver README, «Sitio de prueba».
 */
export function crearAccionesServidor(campaniaId: string): AccionesInicio {
  return {
    async obtenerDia(fecha) {
      "use server";
      return pedirTablero(fuenteInicio, { fecha, campaniaId });
    },
  };
}
