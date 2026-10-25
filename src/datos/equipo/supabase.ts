import type { FuenteDatosEquipo } from "@/datos/equipo/contrato";
import { crearFuentePestanaRpc } from "@/datos/equipo/pestana-rpc";
import { crearFuenteAnadirRpc } from "@/datos/equipo/rpc";
import type { ClienteSupabase } from "@/datos/supabase/cliente";

/**
 * Fuente de Equipo contra el proyecto de Supabase de la demo (issue #45). Solo para desarrollo: la enciende
 * `src/datos/equipo/index.ts` cuando hay variables de Supabase y el build no es de producción.
 *
 * La vista 23 (añadir colportor: sugeridos, búsqueda e inscripción) va por las RPC de `rpc.ts` y la vista 33 (zonas y
 * acompañamientos por ciudad) por las de `pestana-rpc.ts`.
 */
export function crearFuenteEquipoSupabase(
  cliente: ClienteSupabase,
  campaniaElegida?: () => Promise<string | null>,
): FuenteDatosEquipo {
  return {
    ...crearFuenteAnadirRpc(cliente, campaniaElegida),
    ...crearFuentePestanaRpc(cliente, undefined, campaniaElegida),
  };
}
