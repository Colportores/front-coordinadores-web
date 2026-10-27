import type { FuenteDatosShell, ResultadoCampanias } from "@/datos/shell/contrato";
import { causaDe } from "@/datos/supabase/cliente";
import { RespuestaInesperada } from "@/datos/supabase/respuesta";

/**
 * La lista de campañas para el topbar, sin que una excepción cruce a la pantalla: una server action de producción tapa el
 * mensaje de lo que tira, así que la causa viaja en el resultado. Una caída de red, un 5xx, un límite de tráfico o una
 * sesión que no se pudo renovar es «sin conexión» (se ofrece reintentar); un rechazo de la base o una respuesta que el
 * panel no entiende es un error. **Una falla nunca se toma por «sin campañas».**
 */
export async function pedirCampanias(fuente: FuenteDatosShell): Promise<ResultadoCampanias> {
  try {
    return { ok: true, campanias: await fuente.listarCampanias() };
  } catch (error) {
    if (error instanceof RespuestaInesperada) return { ok: false, causa: "error" };
    return { ok: false, causa: causaDe(error) === "rechazo" ? "error" : "sin-conexion" };
  }
}
