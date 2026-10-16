import type { ClienteRpc } from "@/datos/supabase/cliente";
import { cadena, filas } from "@/datos/supabase/respuesta";

/**
 * La campaña con la que trabaja el panel cuando se conecta a las RPC, **provisoria**: la primera de
 * `campanias_del_coordinador()`, que viene con las en curso antes que las por empezar (migración 0033). Cuál elige el
 * coordinador cuando tiene varias es una decisión de Cristian (`panel-18-impl-p3-campania-panel`); hasta que llegue,
 * todas las fuentes de las vistas con campaña la toman de acá, para cambiarla en un solo lugar.
 *
 * `null` si el coordinador no tiene una campaña que no haya terminado.
 */
export async function campaniaProvisoria(cliente: ClienteRpc): Promise<{ id: string; nombre: string } | null> {
  const rpc = "campanias_del_coordinador";
  const [primera] = filas(rpc, await cliente.llamarRpc(rpc, {}));
  if (!primera) return null;
  return { id: cadena(rpc, primera, "id"), nombre: cadena(rpc, primera, "nombre") };
}
