/**
 * Contrato del «Informe PDF» de la vista 32 (HU-REP-005, issue #84, decisión de Cristian del 23/10, «PDF informe»): el
 * informe lo arma la Edge Function `informe-reportes` de Supabase (backend-supabase#144) y el panel baja el `.pdf`.
 *
 * Es un archivo que se arma en el servidor, no un BFF (ADR-013). Este módulo no importa nada que no sea un tipo: lo
 * carga también el navegador (la vista usa `informeNoDisponible` cuando no hay servidor del panel detrás).
 */

/** Cómo agrupa el informe: lo mismo que `Granularidad` de la función. El rango libre de fechas todavía no existe allá. */
export type GranularidadDelInforme = "dia" | "semana" | "mes";

/** Qué mira el informe: lo mismo que el `Ambito` de la vista 32 (`features/reportes/horas/ambito.ts`) y de la función. */
export type AmbitoDelInforme =
  | { tipo: "todas" }
  | { tipo: "departamento"; departamento: string }
  | { tipo: "ciudad"; ciudadId: string }
  | { tipo: "colportor"; colportorId: string };

/**
 * Lo que la vista pide. La campaña no va: la toma el servidor de la cookie que eligió la coordinadora (y la función la
 * comprueba contra `campanias_del_coordinador()`), así el navegador no la puede cambiar.
 */
export interface PedidoDeInforme {
  ambito: AmbitoDelInforme;
  granularidad: GranularidadDelInforme;
}

/**
 * Qué pasó con el pedido. Viaja de la server action al navegador, por eso el PDF va en base64 (un texto) y la causa de
 * una falla va en el resultado: una server action de producción tapa el mensaje de lo que tira.
 * - `sin-conexion`: no hubo con quién hablar (el panel no llega a Supabase). La vista dice «Necesitás conexión…».
 * - `rechazado`: la función contestó que no (sin permiso, sin datos, no pudo armarlo). `mensaje` es su texto, ya escrito
 *   para la persona; sin `mensaje`, la vista usa el suyo.
 */
export type ResultadoDeInforme =
  | { ok: true; pdfBase64: string }
  | { ok: false; causa: "sin-conexion" | "rechazado"; mensaje?: string };

/** Lo que la vista llama al apretar «Informe PDF». Un throw cuenta como sin conexión (el pedido ni llegó al servidor). */
export type DescargarInforme = (pedido: PedidoDeInforme) => Promise<ResultadoDeInforme>;

/**
 * El informe donde no hay función que lo arme: el sitio de prueba (export estático, sin servidor), el desarrollo sin
 * Supabase y el puente de la demo. Dice la verdad y qué hacer, en vez de bajar un archivo inventado.
 */
export const informeNoDisponible: DescargarInforme = async () => ({
  ok: false,
  causa: "rechazado",
  mensaje: "El informe PDF lo arma el servidor del panel y esta versión de prueba no lo tiene. Usá «Datos CSV» o entrá al panel con tu cuenta.",
});
