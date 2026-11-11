import { accionesValidarTickets } from "@/datos/cuentas/validar";
import type { AccionesValidarTickets, ItemPorValidar } from "@/datos/cuentas/validar";

/**
 * Server actions de la vista 29 (#170): el navegador pide y el servidor le habla a Supabase con la sesión de la coordinadora
 * (o al proyecto de la demo, en el puente de desarrollo). La página las usa solo cuando `accionesValidarTickets` existe: con
 * la fuente simulada pasa las acciones simuladas del navegador.
 *
 * De lo que manda el navegador solo pasa el id y el tipo (y el motivo): la base decide el resto con sus reglas y permisos.
 *
 * Este módulo no entra al build exportado del sitio de prueba (no hay servidor ahí): la página lo importa solo cuando no es
 * ese build. Ver README, «Sitio de prueba».
 */
function conectadas(): AccionesValidarTickets {
  if (!accionesValidarTickets) throw new Error("La vista 29 no está conectada a Supabase: no hay acciones del servidor.");
  return accionesValidarTickets;
}

/** Solo el id y el tipo, sin nada más de lo que haya mandado el navegador. */
function soloIdYTipo(item: Pick<ItemPorValidar, "id" | "tipo"> | null | undefined): Pick<ItemPorValidar, "id" | "tipo"> {
  return { id: item?.id as string, tipo: item?.tipo as ItemPorValidar["tipo"] };
}

export function crearAccionesValidarTickets(): AccionesValidarTickets {
  return {
    async validar(item) {
      "use server";
      return conectadas().validar(soloIdYTipo(item));
    },
    async rechazar(item, motivo) {
      "use server";
      return conectadas().rechazar(soloIdYTipo(item), typeof motivo === "string" ? motivo : "");
    },
    async enlaceDeFoto(ticketId) {
      "use server";
      return conectadas().enlaceDeFoto(typeof ticketId === "string" ? ticketId : "");
    },
  };
}
