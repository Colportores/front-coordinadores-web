import type { ClienteRpc } from "@/datos/supabase/cliente";
import { cadena, filas } from "@/datos/supabase/respuesta";

/**
 * La campaña con la que trabaja el panel cuando se conecta a las RPC: la que eligió la coordinadora en el selector del
 * topbar (`elegidaId`, #70) si sigue en `campanias_del_coordinador()`, y si no eligió ninguna o la que eligió ya no está
 * (terminó o se dio de baja), la primera de la lista, que viene con las en curso antes que las por empezar (migración
 * 0033). Todas las fuentes de las vistas con campaña la toman de acá (la vista 23, «Añadir colportor», y la vista 24,
 * «Asignar zona»), para cambiarla en un solo lugar. `elegidaId` viene de una cookie del navegador, así que no se confía
 * en él: solo vale si figura en la lista de quien llama.
 *
 * Devuelve la elegida **aunque todavía no haya empezado**: qué hacer con una campaña por empezar lo decide cada vista, no
 * este helper. La vista 23 la trata como «sin campaña en curso» (la base no deja inscribir en ella: `CI002`, pantalla
 * `SinCampaniaParaAnadir`); la vista 24 sí trabaja con ella (se pueden armar zonas antes de que empiece).
 *
 * `null` si el coordinador no tiene una campaña que no haya terminado.
 */
export async function campaniaProvisoria(
  cliente: ClienteRpc,
  elegidaId?: string | null,
): Promise<{ id: string; nombre: string } | null> {
  const rpc = "campanias_del_coordinador";
  const todas = filas(rpc, await cliente.llamarRpc(rpc, {})).map((fila) => ({
    id: cadena(rpc, fila, "id"),
    nombre: cadena(rpc, fila, "nombre"),
  }));
  return todas.find((c) => c.id === elegidaId) ?? todas[0] ?? null;
}
