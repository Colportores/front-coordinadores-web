import { fuenteEquipo } from "@/datos/equipo";
import type { AccionesEquipo } from "@/features/equipo/vista-33/acciones";

/**
 * Server actions de la vista 33: el navegador pide y el servidor le habla a la fuente (las RPC de Supabase bajo el
 * puente de desarrollo, la simulada en cualquier build de producción). `campaniaId` queda atado a cada acción (Next lo
 * cifra), el navegador no lo puede cambiar.
 *
 * Este módulo no entra al build exportado del sitio de prueba (no hay servidor ahí): la página lo importa solo cuando no
 * es ese build. Ver README, «Sitio de prueba».
 */
export function crearAccionesEquipo(campaniaId: string): AccionesEquipo {
  return {
    async jornadasParaAcompanar(colportorId) {
      "use server";
      return fuenteEquipo.jornadasParaAcompanar(campaniaId, colportorId);
    },
    async registrarAcompanamiento(jornadaId) {
      "use server";
      return fuenteEquipo.registrarAcompanamiento(campaniaId, jornadaId);
    },
    async elegirCarrera(colportorId, carreraId) {
      "use server";
      return fuenteEquipo.elegirCarrera(campaniaId, colportorId, carreraId);
    },
    async asignarTipoDeBeca(colportorId, tipo) {
      "use server";
      // El tipo viene del navegador: solo vale uno de los tres que ofrece la tabla («Sin beca» es null).
      if (tipo !== null && tipo !== "media" && tipo !== "completa") {
        return { ok: false, mensaje: "Ese tipo de beca no existe. Recargá la página y volvé a elegir." };
      }
      return fuenteEquipo.asignarTipoDeBeca(campaniaId, colportorId, tipo);
    },
  };
}
