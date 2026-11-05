import type { FuenteDatosInicio, OpcionesTablero, ResultadoTablero } from "@/datos/inicio/contrato";
import { RechazoDelTablero } from "@/datos/inicio/rpc";
import { causaDe } from "@/datos/supabase/cliente";
import { RespuestaInesperada } from "@/datos/supabase/respuesta";

/**
 * Otro día del tablero, sin que una excepción cruce a la pantalla: una server action de producción tapa el mensaje de lo
 * que tira, así que la causa viaja en el resultado. Una caída de red, un 5xx, un límite de tráfico o una sesión que no se
 * pudo renovar es «sin conexión» (se ofrece reintentar); un rechazo de la base trae su texto; una respuesta que el panel
 * no entiende es un error. **Una falla nunca se toma por un día sin gente.**
 */
export async function pedirTablero(fuente: FuenteDatosInicio, opciones: OpcionesTablero): Promise<ResultadoTablero> {
  try {
    return { ok: true, tablero: await fuente.obtenerTablero(opciones) };
  } catch (error) {
    if (error instanceof RechazoDelTablero) return { ok: false, causa: "rechazo", mensaje: error.message };
    if (error instanceof RespuestaInesperada) return { ok: false, causa: "error" };
    return { ok: false, causa: causaDe(error) === "rechazo" ? "error" : "sin-conexion" };
  }
}
