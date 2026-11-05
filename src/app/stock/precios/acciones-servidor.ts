import { fuentePrecios, type AccionesPrecios } from "@/datos/precios";

/**
 * Server actions de la vista 27: el navegador pide y el servidor le habla a la fuente (las RPC de Supabase con la sesión de la
 * coordinadora, la simulada en cualquier build sin ellas). `campaniaId` queda atado a la acción (Next lo cifra): el navegador
 * no lo puede cambiar.
 *
 * Este módulo no entra al build exportado del sitio de prueba (no hay servidor ahí): la página lo importa solo cuando no es
 * ese build. Ver README, «Sitio de prueba».
 */
export function crearAccionesPrecios(campaniaId: string): AccionesPrecios {
  return {
    async guardarPrecios(ciudadId, cambios) {
      "use server";
      return fuentePrecios.guardarPrecios(campaniaId, ciudadId, cambios);
    },
  };
}
