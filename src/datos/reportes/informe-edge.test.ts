import { describe, expect, it } from "vitest";

import type { PedidoDeInforme } from "@/datos/reportes/informe";
import { FUNCION_DEL_INFORME, pedirInformePdf } from "@/datos/reportes/informe-edge";
import { crearSupabasePrueba, json, respuestaDeSesion } from "@/test/supabase";

const CAMPANIA = "6f0c2a52-6a0e-4f53-9a43-5a2e6f3c9a11";
const PEDIDO: PedidoDeInforme = { ambito: { tipo: "ciudad", ciudadId: "rivera" }, granularidad: "semana" };
const PDF = "%PDF-1.7\nun informe de prueba con bytes raros ÿ\u0000";

const pdf = (cuerpo: BodyInit = Buffer.from(PDF, "latin1")) =>
  new Response(cuerpo, { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="x.pdf"' } });
const errorDeLaFuncion = (estado: number, codigo: string, mensaje: string) => json({ error: { codigo, mensaje } }, estado);

/** Un Supabase con la sesión de la coordinadora ya iniciada y la función respondiendo lo que decide `responder`. */
async function conFuncion(responder: () => Response | Promise<Response>) {
  const prueba = crearSupabasePrueba((llamada) => {
    if (llamada.ruta.startsWith("/auth/v1/")) return respuestaDeSesion({ token: "jwt-de-la-coordinadora" });
    return responder();
  });
  await prueba.supabase.auth.signInWithPassword({ email: "coordinador@example.com", password: "x" });
  prueba.llamadas.length = 0;
  return prueba;
}

describe("pedirInformePdf (issue #84)", () => {
  it("llama a la función con la sesión de quien pide y devuelve el PDF en base64, byte por byte", async () => {
    const { supabase, llamadas } = await conFuncion(() => pdf());

    const resultado = await pedirInformePdf(supabase, PEDIDO, CAMPANIA);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(Buffer.from(resultado.pdfBase64, "base64").toString("latin1")).toBe(PDF);
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].metodo).toBe("POST");
    expect(llamadas[0].ruta).toBe(`/functions/v1/${FUNCION_DEL_INFORME}`);
    expect(llamadas[0].token).toBe("jwt-de-la-coordinadora");
    expect(llamadas[0].cuerpo).toEqual({ campaniaId: CAMPANIA, ambito: { tipo: "ciudad", ciudadId: "rivera" }, granularidad: "semana" });
  });

  it("sin campaña elegida manda null (la función usa la primera)", async () => {
    const { supabase, llamadas } = await conFuncion(() => pdf());
    await pedirInformePdf(supabase, { ambito: { tipo: "todas" }, granularidad: "dia" }, null);
    expect(llamadas[0].cuerpo).toEqual({ campaniaId: null, ambito: { tipo: "todas" }, granularidad: "dia" });
  });

  it("del pedido del navegador pasan solo el ámbito y la agrupación: nada más se cuela a la función", async () => {
    const { supabase, llamadas } = await conFuncion(() => pdf());
    const hostil = { ...PEDIDO, campaniaId: "otra", usuario: "admin" } as PedidoDeInforme;

    await pedirInformePdf(supabase, hostil, CAMPANIA);

    expect(Object.keys(llamadas[0].cuerpo as object).sort()).toEqual(["ambito", "campaniaId", "granularidad"]);
    expect((llamadas[0].cuerpo as { campaniaId: string }).campaniaId).toBe(CAMPANIA);
  });

  it.each([
    [400, "pedido_invalido", "El pedido del informe no es válido. Volvé a abrir Reportes e intentá de nuevo."],
    [401, "sin_sesion", "Tu sesión terminó. Iniciá sesión de nuevo para descargar el informe PDF."],
    [403, "sin_permiso", "No tenés permiso para descargar el informe de esta campaña."],
    [404, "sin_campania", "No tenés una campaña en curso para armar el informe."],
    [422, "sin_datos", "No hay colportores para exportar en este reporte."],
    [500, "no_se_pudo_armar", "No pudimos armar el informe PDF. Volvé a intentar en unos minutos."],
    [502, "no_se_pudo_leer", "No pudimos leer los reportes. Esperá unos minutos y volvé a intentar."],
  ])("un %i (%s) vuelve rechazado con el texto de la función, que ya dice qué hacer", async (estado, codigo, mensaje) => {
    const { supabase } = await conFuncion(() => errorDeLaFuncion(estado, codigo, mensaje));
    expect(await pedirInformePdf(supabase, PEDIDO, CAMPANIA)).toEqual({ ok: false, causa: "rechazado", mensaje });
  });

  it("un error sin la forma de la función (la función no está publicada, el gateway) es un rechazo sin texto", async () => {
    for (const respuesta of [
      () => json({ code: "NOT_FOUND", message: "Requested function was not found" }, 404),
      () => new Response("<html>502</html>", { status: 502, headers: { "Content-Type": "text/html" } }),
      () => json({ error: { codigo: "x", mensaje: "   " } }, 500),
      () => json({ error: "texto suelto" }, 500),
    ]) {
      const { supabase } = await conFuncion(respuesta);
      expect(await pedirInformePdf(supabase, PEDIDO, CAMPANIA)).toEqual({ ok: false, causa: "rechazado" });
    }
  });

  it("si la red se cae antes de que haya respuesta es sin-conexion, y no tira", async () => {
    const { supabase } = await conFuncion(() => {
      throw new TypeError("fetch failed");
    });
    expect(await pedirInformePdf(supabase, PEDIDO, CAMPANIA)).toEqual({ ok: false, causa: "sin-conexion" });
  });

  it("un 200 que no es un PDF no se baja como si lo fuera", async () => {
    for (const respuesta of [
      () => pdf("<html>no soy un pdf</html>"),
      () => json({ ok: true }),
      () => new Response("", { status: 200, headers: { "Content-Type": "text/plain" } }),
      () => pdf(""),
    ]) {
      const { supabase } = await conFuncion(respuesta);
      expect(await pedirInformePdf(supabase, PEDIDO, CAMPANIA)).toEqual({ ok: false, causa: "rechazado" });
    }
  });

  it("un informe grande (1 MB) llega entero", async () => {
    const grande = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(1024 * 1024, 7)]);
    const { supabase } = await conFuncion(() => pdf(grande));
    const resultado = await pedirInformePdf(supabase, PEDIDO, CAMPANIA);
    expect(resultado.ok && Buffer.from(resultado.pdfBase64, "base64").equals(grande)).toBe(true);
  });
});
