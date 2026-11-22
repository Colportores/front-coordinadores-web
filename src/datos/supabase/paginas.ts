/**
 * Lectura completa de las RPC de lista que se piden por páginas (backend-supabase#290, migración 0196).
 *
 * PostgREST corta toda respuesta en 1000 filas (`max_rows`) sin avisar: una lista que pasa de ahí se vería completa y
 * le faltarían filas. Las siete RPC de lista del panel (`colportores_de_campania`, `ciudades_de_campania`,
 * `zonas_por_colportor`, `historial_de_acompaniamientos`, `acompaniamientos_por_colportor`,
 * `jornadas_cerradas_de_colportor` y `becas_de_campania`) aceptan `p_limite` (de 1 a 1000) y `p_desplazamiento`
 * (desde 0), con un orden fijo y único. Acá se pide página tras página hasta que una venga con menos filas que el
 * límite, y se devuelve la lista entera: lo que se ve no cambia, solo que ya no se corta.
 *
 * Si una página falla a mitad de camino, la falla sale como excepción: nunca una lista parcial como si estuviera
 * completa (la vista muestra el aviso de error de su pestaña, con «Reintentar»).
 */
import type { ClienteRpc } from "./cliente";
import { filas, RespuestaInesperada, type Objeto } from "./respuesta";

/** El tope de filas de PostgREST: pedir más por página se cortaría en silencio (la base lo rechaza con 22023). */
export const FILAS_POR_PAGINA = 1000;

/** Corte de seguridad (200 000 filas): una RPC que nunca devuelve una página incompleta no deja la lectura colgada. */
const MAX_PAGINAS = 200;

/**
 * Todas las filas de `rpc`, pedidas por páginas de `FILAS_POR_PAGINA` con `p_desplazamiento`. Los `argumentos` van en
 * cada página (no deben traer `p_limite` ni `p_desplazamiento`).
 */
export async function llamarRpcPorPaginas(cliente: ClienteRpc, rpc: string, argumentos: Record<string, unknown>): Promise<Objeto[]> {
  const todas: Objeto[] = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const leidas = filas(
      rpc,
      await cliente.llamarRpc(rpc, { ...argumentos, p_limite: FILAS_POR_PAGINA, p_desplazamiento: pagina * FILAS_POR_PAGINA }),
    );
    for (const fila of leidas) todas.push(fila);
    if (leidas.length < FILAS_POR_PAGINA) return todas;
  }
  throw new RespuestaInesperada(rpc, "la lista no termina de paginar");
}
