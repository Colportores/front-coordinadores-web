import { describe, expect, it, vi } from "vitest";

import { crearFuentePestanaRpc } from "@/datos/equipo/pestana-rpc";
import { ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import { MENSAJE_SESION_VENCIDA } from "@/lib/mensajes";

const CAMPANIA = "11111111-1111-4111-8111-111111111111";
const EMILIANO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function clienteQue(resultado: unknown) {
  const llamarRpc = vi.fn<(nombre: string, argumentos: Record<string, unknown>) => Promise<unknown>>(async () => {
    if (resultado instanceof Error) throw resultado;
    return resultado;
  });
  return { cliente: { llamarRpc } as unknown as ClienteRpc, llamarRpc };
}

const rechazo = (codigo: string, mensaje: string, estado = 400) => new ErrorSupabase(mensaje, estado, codigo);

/** #184: «Quitar de la campaña» contra `quitar_de_campania(p_campania_id, p_usuario_id)` (migración 0192). */
describe("#184 · quitarDeCampania contra la RPC", () => {
  it("llama con la campaña y el usuario, y devuelve ok", async () => {
    const { cliente, llamarRpc } = clienteQue([{ inscripcion_id: "i", quitado_en: "2026-11-22T10:00:00Z", jornadas_cerradas: 1, estado: "PENDIENTE_ASIGNACION" }]);

    expect(await crearFuentePestanaRpc(cliente).quitarDeCampania(CAMPANIA, EMILIANO)).toEqual({ ok: true });
    expect(llamarRpc).toHaveBeenCalledExactlyOnceWith("quitar_de_campania", { p_campania_id: CAMPANIA, p_usuario_id: EMILIANO });
  });

  it("un id que no es una cuenta no llama a la base y se toma por ya quitado", async () => {
    const { cliente, llamarRpc } = clienteQue([]);

    expect(await crearFuentePestanaRpc(cliente).quitarDeCampania(CAMPANIA, "no-es-un-id")).toEqual({ ok: true, yaEstaba: true });
    expect(llamarRpc).not.toHaveBeenCalled();
  });

  it("QC003 (ya lo quitaron) no es un error: la fila se va igual", async () => {
    const { cliente } = clienteQue(rechazo("QC003", "No está en el equipo de esta campaña: puede que ya lo hayan quitado. Actualizá la lista."));

    expect(await crearFuentePestanaRpc(cliente).quitarDeCampania(CAMPANIA, EMILIANO)).toEqual({ ok: true, yaEstaba: true });
  });

  it("QC001 y QC002 muestran el texto de la base", async () => {
    for (const [codigo, texto] of [
      ["QC001", "La campaña no existe o fue dada de baja. Actualizá la lista de campañas."],
      ["QC002", "La campaña ya terminó y su equipo queda como está. Elegí una campaña en curso o por empezar."],
    ]) {
      const { cliente } = clienteQue(rechazo(codigo, texto));
      expect(await crearFuentePestanaRpc(cliente).quitarDeCampania(CAMPANIA, EMILIANO)).toEqual({ ok: false, mensaje: texto });
    }
  });

  it("42501 con permiso negado dice qué cuenta hace falta", async () => {
    const { cliente } = clienteQue(rechazo("42501", "interno", 403));

    const resultado = await crearFuentePestanaRpc(cliente).quitarDeCampania(CAMPANIA, EMILIANO);
    expect(resultado).toMatchObject({ ok: false });
    expect(resultado.ok === false && resultado.mensaje).toMatch(/coordinador de esta campaña/);
  });

  it("la sesión vencida vuelve como resultado, con su texto", async () => {
    const { cliente } = clienteQue(rechazo("PGRST301", "JWT expired", 401));

    expect(await crearFuentePestanaRpc(cliente).quitarDeCampania(CAMPANIA, EMILIANO)).toEqual({
      ok: false,
      mensaje: MENSAJE_SESION_VENCIDA,
      sesionVencida: true,
    });
  });

  it("un rechazo desconocido o una función sin publicar dan un texto que dice qué hacer", async () => {
    const desconocido = clienteQue(rechazo("XX999", "interno"));
    expect(await crearFuentePestanaRpc(desconocido.cliente).quitarDeCampania(CAMPANIA, EMILIANO)).toEqual({
      ok: false,
      mensaje: "No se pudo quitar a la persona de la campaña. Probá de nuevo más tarde.",
    });

    const sinFuncion = clienteQue(new ErrorSupabase("Could not find the function", 404, "PGRST202"));
    expect(await crearFuentePestanaRpc(sinFuncion.cliente).quitarDeCampania(CAMPANIA, EMILIANO)).toMatchObject({ ok: false });
  });

  it("una falla de conexión o de servicio sale como excepción (la vista ofrece «Reintentar»)", async () => {
    for (const error of [new TypeError("fetch failed"), rechazo("", "Bad gateway", 502)]) {
      const { cliente } = clienteQue(error);
      await expect(crearFuentePestanaRpc(cliente).quitarDeCampania(CAMPANIA, EMILIANO)).rejects.toBe(error);
    }
  });
});
