import { describe, expect, it, vi } from "vitest";

import { crearFuentePestanaRpc } from "@/datos/equipo/pestana-rpc";
import { ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import { RespuestaInesperada } from "@/datos/supabase/respuesta";

/**
 * `acompanantesDelPanel` (seguimiento #161 de #146): los coordinadores de cualquier campaña y los administradores que el
 * panel ofrece en «Quién lo acompañó», de `acompaniantes_del_panel()` (backend-supabase#257).
 */

const CAMPANIA = "11111111-1111-4111-8111-111111111111";
const YO = "99999999-9999-4999-8999-999999999999";
const MARTA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ALICIA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type Respuestas = Record<string, unknown>;

function clienteCon(respuestas: Respuestas) {
  const llamarRpc = vi.fn<(nombre: string, argumentos: Record<string, unknown>) => Promise<unknown>>(async (nombre) => {
    const respuesta = respuestas[nombre];
    if (respuesta instanceof Error) throw respuesta;
    return respuesta;
  });
  return { cliente: { llamarRpc } as unknown as ClienteRpc, llamarRpc };
}

const perfil = [{ usuario_id: YO, nombre: "Mariana", apellido: "Pérez" }];
const rechazo = (codigo: string, mensaje: string, estado = 400) => new ErrorSupabase(mensaje, estado, codigo);

describe("acompanantesDelPanel", () => {
  it("pide la lista de la campaña y devuelve id (la columna `usuario_id` de la RPC 0183) y nombre, sin ningún otro dato", async () => {
    const { cliente, llamarRpc } = clienteCon({
      mi_perfil: perfil,
      acompaniantes_del_panel: [
        { usuario_id: MARTA, nombre: "Marta", apellido: "Rivas", email: "marta@example.com", telefono: "099" },
        { usuario_id: ALICIA, nombre: "Alicia", apellido: "Benítez" },
      ],
    });

    const r = await crearFuentePestanaRpc(cliente).acompanantesDelPanel(CAMPANIA);

    expect(llamarRpc).toHaveBeenCalledWith("acompaniantes_del_panel", { p_campania_id: CAMPANIA });
    expect(r).toEqual({
      ok: true,
      acompanantes: [
        { id: MARTA, nombre: "Marta Rivas" },
        { id: ALICIA, nombre: "Alicia Benítez" },
      ],
    });
  });

  it("quien tiene la sesión no figura (es «Yo») y una persona repetida por dos roles sale una vez", async () => {
    const { cliente } = clienteCon({
      mi_perfil: perfil,
      acompaniantes_del_panel: [
        { usuario_id: YO, nombre: "Mariana", apellido: "Pérez" },
        { usuario_id: MARTA, nombre: "Marta", apellido: "Rivas" },
        { usuario_id: MARTA, nombre: "Marta", apellido: "Rivas" },
      ],
    });

    expect(await crearFuentePestanaRpc(cliente).acompanantesDelPanel(CAMPANIA)).toEqual({
      ok: true,
      acompanantes: [{ id: MARTA, nombre: "Marta Rivas" }],
    });
  });

  it("una cuenta sin nombre ni apellido no se muestra vacía", async () => {
    const { cliente } = clienteCon({ mi_perfil: perfil, acompaniantes_del_panel: [{ usuario_id: MARTA, nombre: null, apellido: null }] });

    expect(await crearFuentePestanaRpc(cliente).acompanantesDelPanel(CAMPANIA)).toEqual({
      ok: true,
      acompanantes: [{ id: MARTA, nombre: "Cuenta sin nombre" }],
    });
  });

  it("una lista vacía es una lista vacía", async () => {
    const { cliente } = clienteCon({ mi_perfil: perfil, acompaniantes_del_panel: [] });

    expect(await crearFuentePestanaRpc(cliente).acompanantesDelPanel(CAMPANIA)).toEqual({ ok: true, acompanantes: [] });
  });

  it("si la base todavía no publicó la RPC, el selector queda como antes: lista vacía, sin error", async () => {
    for (const codigo of ["PGRST202", "42883"]) {
      const { cliente } = clienteCon({ mi_perfil: perfil, acompaniantes_del_panel: rechazo(codigo, "no existe", 404) });
      expect(await crearFuentePestanaRpc(cliente).acompanantesDelPanel(CAMPANIA)).toEqual({ ok: true, acompanantes: [] });
    }
  });

  it("sin permiso o con un código que el panel no conoce, un texto propio (nunca una lista vacía)", async () => {
    const sinPermiso = clienteCon({ mi_perfil: perfil, acompaniantes_del_panel: rechazo("42501", "x", 403) });
    expect(await crearFuentePestanaRpc(sinPermiso.cliente).acompanantesDelPanel(CAMPANIA)).toEqual({
      ok: false,
      mensaje: "Solo el coordinador de la campaña puede ver a quién anotar como acompañante.",
    });

    const desconocido = clienteCon({ mi_perfil: perfil, acompaniantes_del_panel: rechazo("P0001", "Algo raro") });
    expect(await crearFuentePestanaRpc(desconocido.cliente).acompanantesDelPanel(CAMPANIA)).toEqual({
      ok: false,
      mensaje: "No se pudieron traer los coordinadores y administradores. Probá de nuevo más tarde.",
    });
  });

  it("una caída no es un rechazo: llega como excepción para mostrar «sin conexión»", async () => {
    const caida = new TypeError("fetch failed");
    const { cliente } = clienteCon({ mi_perfil: perfil, acompaniantes_del_panel: caida });

    await expect(crearFuentePestanaRpc(cliente).acompanantesDelPanel(CAMPANIA)).rejects.toBe(caida);
  });

  it("una respuesta con otra forma es inesperada, no una lista vacía", async () => {
    for (const respuesta of [{ no: "es una lista" }, [{ nombre: "Sin id" }], [{ usuario_id: 7 }], [{ id: MARTA, nombre: "Marta", apellido: "Rivas" }]]) {
      const { cliente } = clienteCon({ mi_perfil: perfil, acompaniantes_del_panel: respuesta });
      await expect(crearFuentePestanaRpc(cliente).acompanantesDelPanel(CAMPANIA)).rejects.toBeInstanceOf(RespuestaInesperada);
    }
  });
});
