import { UUID } from "@/datos/supabase/respuesta";
import { COOKIE_CAMPANIA_ELEGIDA } from "@/shell/campania-elegida";

/**
 * El id de la campaña que eligió la coordinadora en el topbar (#70), de la cookie del pedido; `null` si no eligió o la
 * cookie no tiene la forma de un id. Solo se llama desde las fuentes que hablan con las RPC (el puente de desarrollo): ahí
 * se valida contra la lista de campañas de la coordinadora. Las fuentes simuladas (producción y sitio de prueba) no la
 * leen, así que las rutas siguen siendo estáticas.
 */
export async function leerCampaniaElegida(): Promise<string | null> {
  // Import dinámico: este módulo cuelga de los `index.ts` de las fuentes, que no deben arrastrar `next/headers` a ningún bundle.
  const { cookies } = await import("next/headers");
  const valor = (await cookies()).get(COOKIE_CAMPANIA_ELEGIDA)?.value;
  return valor !== undefined && UUID.test(valor) ? valor : null;
}
