import { accionesPedidos } from "@/datos/stock/pedidos";
import type { AccionesPedidos, CantidadAutorizada, DecisionDeSolicitud } from "@/datos/stock/pedidos";

/**
 * Server actions de la vista 35 (#215): el navegador pide y el servidor le habla a Supabase con la sesión de la coordinadora (o
 * al proyecto de la demo, en el puente de desarrollo). La página las usa solo cuando `accionesPedidos` existe: con la fuente
 * simulada pasa las acciones simuladas del navegador.
 *
 * De lo que manda el navegador solo pasan el tipo, el id, la acción, el motivo y, en «Reducir», el id del producto con su
 * cantidad: la base decide el resto con sus reglas y permisos (nunca un monto ni un nombre).
 *
 * Este módulo no entra al build exportado del sitio de prueba (no hay servidor ahí): la página lo importa solo cuando no es
 * ese build. Ver README, «Sitio de prueba».
 */
function conectadas(): AccionesPedidos {
  if (!accionesPedidos) throw new Error("La vista 35 no está conectada a Supabase: no hay acciones del servidor.");
  return accionesPedidos;
}

function soloLoQueDecide(decision: DecisionDeSolicitud | null | undefined): DecisionDeSolicitud {
  const d = decision as Partial<Record<string, unknown>> | null | undefined;
  const base = { tipo: d?.tipo as DecisionDeSolicitud["tipo"], id: d?.id as string };
  if (d?.accion === "rechazar") return { ...base, accion: "rechazar", motivo: typeof d.motivo === "string" ? d.motivo : "" };
  const cantidades = d?.cantidades;
  if (d?.accion === "autorizar" && cantidades !== undefined) {
    const lista = Array.isArray(cantidades) ? (cantidades as Array<Partial<CantidadAutorizada> | null>) : [];
    return {
      ...base,
      accion: "autorizar",
      // Una lista que no es lista llega vacía: la fuente la rechaza sin llamar a la base.
      cantidades: lista.map((c) => ({ nombre: "", productoId: c?.productoId as string, cantidad: c?.cantidad as number })),
    };
  }
  return { ...base, accion: d?.accion as "autorizar" };
}

export function crearAccionesPedidos(): AccionesPedidos {
  return {
    async decidir(decision) {
      "use server";
      return conectadas().decidir(soloLoQueDecide(decision));
    },
    async editarLimite(limite, campaniaId) {
      "use server";
      const editar = conectadas().editarLimite;
      if (!editar) throw new Error("La fuente no puede editar el límite.");
      // Solo `null` quita el límite: cualquier otra cosa que no sea un número llega como NaN y la fuente la rechaza.
      return editar(limite === null ? null : typeof limite === "number" ? limite : Number.NaN, typeof campaniaId === "string" ? campaniaId : undefined);
    },
  };
}
