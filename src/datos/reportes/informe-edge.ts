import type { SupabaseClient } from "@supabase/supabase-js";

import type { PedidoDeInforme, ResultadoDeInforme } from "@/datos/reportes/informe";

/**
 * Le pide el «Informe PDF» a la Edge Function `informe-reportes` con la sesión de quien pide (backend-supabase#144, issue
 * #84). Corre solo en el servidor (server action): el JWT de la coordinadora está en sus cookies. La función lee las mismas
 * RPC que la pantalla con ese JWT, así que manda la RLS; el panel no manda ningún dato de la pantalla, solo qué se mira.
 *
 * Nada de lo que contesta la función se tira hacia arriba: un rechazo vuelve con su texto (`{error:{codigo,mensaje}}`, ya
 * escrito para la persona) y una caída de la red como `sin-conexion`.
 */
export const FUNCION_DEL_INFORME = "informe-reportes";

const ENCABEZADO_DE_PDF = "%PDF-";

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function tieneMetodo(valor: unknown, metodo: string): boolean {
  // Sin `instanceof`: el `Blob` y el `Response` del SDK pueden venir de otro entorno que el global de quien lo prueba.
  return typeof valor === "object" && valor !== null && typeof (valor as Record<string, unknown>)[metodo] === "function";
}

/** El `mensaje` de un error de la función (`{error:{codigo,mensaje}}`), si la respuesta tiene esa forma y un texto usable. */
async function mensajeDeLaFuncion(respuesta: unknown): Promise<string | undefined> {
  if (!tieneMetodo(respuesta, "json")) return undefined;
  try {
    const cuerpo: unknown = await (respuesta as Response).json();
    if (!esObjeto(cuerpo) || !esObjeto(cuerpo.error)) return undefined;
    const mensaje = cuerpo.error.mensaje;
    return typeof mensaje === "string" && mensaje.trim() !== "" ? mensaje : undefined;
  } catch {
    return undefined;
  }
}

async function aBase64(blob: Blob): Promise<string | null> {
  const bytes = Buffer.from(await blob.arrayBuffer());
  return bytes.subarray(0, ENCABEZADO_DE_PDF.length).toString("latin1") === ENCABEZADO_DE_PDF ? bytes.toString("base64") : null;
}

export async function pedirInformePdf(
  supabase: Pick<SupabaseClient, "functions">,
  pedido: PedidoDeInforme,
  campaniaId: string | null,
): Promise<ResultadoDeInforme> {
  try {
    const { data, error } = await supabase.functions.invoke<unknown>(FUNCION_DEL_INFORME, {
      // Solo lo que la función espera: nada más del pedido del navegador pasa.
      body: { campaniaId, ambito: pedido.ambito, granularidad: pedido.granularidad },
    });
    if (error) {
      if (error.name === "FunctionsFetchError") return { ok: false, causa: "sin-conexion" };
      const mensaje = error.name === "FunctionsHttpError" ? await mensajeDeLaFuncion((error as { context?: unknown }).context) : undefined;
      return { ok: false, causa: "rechazado", ...(mensaje ? { mensaje } : {}) };
    }
    const pdfBase64 = tieneMetodo(data, "arrayBuffer") ? await aBase64(data as Blob) : null;
    // Un 200 que no es un PDF (otra función con el mismo nombre, un proxy) no se baja como si lo fuera.
    return pdfBase64 === null ? { ok: false, causa: "rechazado" } : { ok: true, pdfBase64 };
  } catch {
    // El SDK no tira por una falla de la función, pero sí si la red se cae antes de que haya respuesta.
    return { ok: false, causa: "sin-conexion" };
  }
}
