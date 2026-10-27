import type { ClienteRpc } from "@/datos/supabase/cliente";
import { cadena, cadenaONula, filas, RespuestaInesperada } from "@/datos/supabase/respuesta";
import { esDiaIso } from "@/lib/dias";

/**
 * La campaña con la que trabaja el panel cuando se conecta a las RPC: la que eligió la coordinadora en el selector del
 * topbar (`elegidaId`, #70) si sigue en `campanias_del_coordinador()`, y si no eligió ninguna o la que eligió ya no está
 * (terminó o se dio de baja), la primera de la lista, que viene con las en curso antes que las por empezar (migración
 * 0033). Todas las fuentes de las vistas con campaña la toman de acá (la vista 23, «Añadir colportor», y la vista 24,
 * «Asignar zona»), para cambiarla en un solo lugar. `elegidaId` viene de una cookie del navegador, así que no se confía
 * en él: solo vale si figura en la lista de quien llama.
 *
 * Devuelve la elegida **aunque todavía no haya empezado**: qué hacer con una campaña por empezar lo decide cada vista, no
 * este helper. Las vistas 23 y 24 trabajan con ella (se suma gente y se arman zonas antes de que empiece; decisión de
 * Cristian, 21/10, «Antes inicio»).
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

/**
 * La campaña provisoria (la elegida en el topbar si figura en la lista, si no la primera) con sus fechas (`AAAA-MM-DD`),
 * para las vistas que cuentan semanas o días desde su inicio.
 */
export async function campaniaProvisoriaConFechas(
  cliente: ClienteRpc,
  elegidaId?: string | null,
): Promise<{ id: string; nombre: string; fechaInicio: string; fechaFin: string | null } | null> {
  const rpc = "campanias_del_coordinador";
  const todas = filas(rpc, await cliente.llamarRpc(rpc, {}));
  const primera = todas.find((fila) => fila.id === elegidaId) ?? todas[0];
  if (!primera) return null;
  const fechaInicio = cadena(rpc, primera, "fecha_inicio");
  const fechaFin = cadenaONula(rpc, primera, "fecha_fin");
  if (!esDiaIso(fechaInicio)) throw new RespuestaInesperada(rpc, `\`fecha_inicio\` no es un día (${fechaInicio})`);
  if (fechaFin !== null && !esDiaIso(fechaFin)) throw new RespuestaInesperada(rpc, `\`fecha_fin\` no es un día (${fechaFin})`);
  return { id: cadena(rpc, primera, "id"), nombre: cadena(rpc, primera, "nombre"), fechaInicio, fechaFin };
}
