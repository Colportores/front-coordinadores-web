import { describe, expect, it, vi } from "vitest";

import { asignarTipoDeBecaRpc, elegirCarreraRpc, leerBecas } from "@/datos/equipo/becas-rpc";
import { ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import { RespuestaInesperada } from "@/datos/supabase/respuesta";

const CAMPANIA = "11111111-1111-4111-8111-111111111111";
const EMILIANO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PAULA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TEOLOGIA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SISTEMAS = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

/** Una fila de `carreras_de_beca()`: las metas del tipo de la campaña, en centavos. */
function carrera(parcial: Record<string, unknown> = {}) {
  return { carrera_id: TEOLOGIA, nombre: "Teología", meta_media: 100, meta_media_monto: 15000000, meta_completa: 200, meta_completa_monto: 30000000, ...parcial };
}

/** Una fila de `becas_de_campania()` (0149). */
function beca(parcial: Record<string, unknown> = {}) {
  return {
    usuario_id: EMILIANO,
    nombre: "Emiliano",
    apellido: "Sosa",
    carrera_id: TEOLOGIA,
    carrera_nombre: "Teología",
    // 22:30 del 31/08 en Montevideo: el día que se muestra es el de Montevideo, no el de UTC.
    carrera_elegida_en: "2026-09-01T01:30:00+00:00",
    tipo_beca: "COMPLETA",
    meta_libros: 200,
    meta_monto_ces: 30000000,
    meta_configurada: true,
    meta_recalculada_en: null,
    libros_bonificables: 210,
    compra_ces: 31000000,
    estado_beca: "ALCANZADA",
    beca_alcanzada_tipo: "COMPLETA",
    ...parcial,
  };
}

type Respuestas = Record<string, unknown>;

function clienteCon(respuestas: Respuestas) {
  const llamarRpc = vi.fn<(nombre: string, argumentos: Record<string, unknown>) => Promise<unknown>>(async (nombre) => {
    const respuesta = respuestas[nombre];
    if (typeof respuesta === "function") return (respuesta as () => unknown)();
    if (respuesta instanceof Error) throw respuesta;
    return respuesta;
  });
  return { cliente: { llamarRpc } as unknown as ClienteRpc, llamarRpc };
}

const rechazo = (codigo: string, mensaje: string, estado = 400) => new ErrorSupabase(mensaje, estado, codigo);

describe("leerBecas", () => {
  it("arma el catálogo (centavos → pesos) y la beca de cada inscripto con lo que marcó el servidor", async () => {
    const { cliente } = clienteCon({
      carreras_de_beca: [carrera(), carrera({ carrera_id: SISTEMAS, nombre: "Ingeniería en Sistemas", meta_media: null, meta_media_monto: null, meta_completa: null, meta_completa_monto: null })],
      becas_de_campania: [
        beca({ meta_recalculada_en: "2026-10-28T12:00:00+00:00" }),
        beca({
          usuario_id: PAULA,
          carrera_id: null,
          carrera_nombre: null,
          carrera_elegida_en: null,
          tipo_beca: null,
          meta_libros: null,
          meta_monto_ces: null,
          meta_configurada: false,
          libros_bonificables: 0,
          compra_ces: 0,
          estado_beca: null,
          beca_alcanzada_tipo: null,
        }),
      ],
    });

    expect(await leerBecas(cliente, CAMPANIA)).toEqual({
      carreras: [
        { id: TEOLOGIA, nombre: "Teología", metaMedia: { libros: 100, monto: 150000 }, metaCompleta: { libros: 200, monto: 300000 } },
        // Sin meta cargada para el tipo de la campaña: la vista avisa «Falta configurar la meta».
        { id: SISTEMAS, nombre: "Ingeniería en Sistemas", metaMedia: null, metaCompleta: null },
      ],
      porColportor: {
        [EMILIANO]: {
          carrera: { id: TEOLOGIA, nombre: "Teología", elegidaEl: "2026-08-31" },
          apuntaA: "completa",
          meta: { libros: 200, monto: 300000 },
          avance: { libros: 210, monto: 310000 },
          alcanzada: "completa",
          metaRecalculadaEn: "2026-10-28T12:00:00+00:00",
        },
        [PAULA]: { carrera: null, apuntaA: null, meta: null, avance: { libros: 0, monto: 0 } },
      },
    });
  });

  it("lo alcanzado sigue aunque pase a «Sin beca»; una carrera sin día guardado no inventa uno", async () => {
    const { cliente } = clienteCon({
      carreras_de_beca: [carrera()],
      becas_de_campania: [beca({ tipo_beca: null, meta_libros: null, meta_monto_ces: null, carrera_elegida_en: null, beca_alcanzada_tipo: "MEDIA" })],
    });

    expect((await leerBecas(cliente, CAMPANIA))?.porColportor[EMILIANO]).toEqual({
      carrera: { id: TEOLOGIA, nombre: "Teología", elegidaEl: null },
      apuntaA: null,
      meta: null,
      avance: { libros: 210, monto: 310000 },
      alcanzada: "media",
    });
  });

  it("sin las RPC publicadas o con la campaña rechazada (BC001, 42501) no hay becas: null", async () => {
    for (const respuestas of [
      { carreras_de_beca: rechazo("PGRST202", "Could not find the function", 404), becas_de_campania: [] },
      { carreras_de_beca: [], becas_de_campania: rechazo("42883", "function does not exist", 404) },
      { carreras_de_beca: [], becas_de_campania: rechazo("BC001", "La campaña ya terminó") },
      { carreras_de_beca: rechazo("42501", "permiso", 403), becas_de_campania: [] },
    ]) {
      expect(await leerBecas(clienteCon(respuestas).cliente, CAMPANIA)).toBeNull();
    }
  });

  it("una caída o una sesión vencida no es «nadie tiene beca»: sale como excepción", async () => {
    for (const falla of [new ErrorSupabase("upstream", 503), new ErrorSupabase("JWT expired", 401, "PGRST301"), new TypeError("fetch failed")]) {
      await expect(leerBecas(clienteCon({ carreras_de_beca: [], becas_de_campania: falla }).cliente, CAMPANIA)).rejects.toBe(falla);
    }
  });

  it("una respuesta con otra forma falla en vez de mostrar becas a medias", async () => {
    for (const respuestas of [
      { carreras_de_beca: [carrera()], becas_de_campania: [beca({ tipo_beca: "TOTAL" })] },
      { carreras_de_beca: [carrera()], becas_de_campania: [beca({ compra_ces: "mucho" })] },
      { carreras_de_beca: [carrera()], becas_de_campania: [beca({ carrera_elegida_en: "ayer" })] },
      { carreras_de_beca: [carrera({ nombre: null })], becas_de_campania: [] },
      { carreras_de_beca: { no: "es una lista" }, becas_de_campania: [] },
    ]) {
      await expect(leerBecas(clienteCon(respuestas).cliente, CAMPANIA)).rejects.toBeInstanceOf(RespuestaInesperada);
    }
  });
});

describe("elegirCarreraRpc", () => {
  it("elige la carrera y devuelve la beca como quedó, leída de nuevo de la base", async () => {
    const { cliente, llamarRpc } = clienteCon({
      elegir_carrera: [{ usuario_id: PAULA, carrera_id: TEOLOGIA, cambio: true }],
      becas_de_campania: [beca(), beca({ usuario_id: PAULA, tipo_beca: null, meta_libros: null, meta_monto_ces: null, compra_ces: 0, libros_bonificables: 0, beca_alcanzada_tipo: null })],
    });

    const resultado = await elegirCarreraRpc(cliente, CAMPANIA, PAULA, TEOLOGIA);

    expect(resultado).toEqual({
      ok: true,
      beca: { carrera: { id: TEOLOGIA, nombre: "Teología", elegidaEl: "2026-08-31" }, apuntaA: null, meta: null, avance: { libros: 0, monto: 0 } },
    });
    expect(llamarRpc).toHaveBeenCalledWith("elegir_carrera", { p_campania_id: CAMPANIA, p_usuario_id: PAULA, p_carrera_id: TEOLOGIA });
  });

  it("ids que no son ids se frenan antes de llamar, con la página por recargar", async () => {
    const { cliente, llamarRpc } = clienteCon({});
    expect(await elegirCarreraRpc(cliente, CAMPANIA, "x", TEOLOGIA)).toMatchObject({ ok: false, recargar: true });
    expect(await elegirCarreraRpc(cliente, CAMPANIA, PAULA, "sis")).toMatchObject({ ok: false, recargar: true, mensaje: expect.stringContaining("Esa carrera no está en la lista") });
    expect(llamarRpc).not.toHaveBeenCalled();
  });

  it("ya elegida por otra persona (BC005), carrera borrada (BC002) o colportor fuera (CZ003): el texto de la base y recargar", async () => {
    for (const [codigo, mensaje] of [
      ["BC005", "La carrera de este colportor ya está elegida y no se cambia desde acá. Si fue un error, pedile a un administrador que la corrija."],
      ["BC002", "Esa carrera no está en la lista. Elegí una de las que ofrece el panel."],
      ["CZ003", "El colportor no está en esta campaña."],
    ]) {
      const { cliente } = clienteCon({ elegir_carrera: rechazo(codigo, mensaje) });
      expect(await elegirCarreraRpc(cliente, CAMPANIA, PAULA, TEOLOGIA)).toEqual({ ok: false, mensaje, recargar: true });
    }
  });

  it("sin permiso o con un código que el panel no conoce, un texto propio; la campaña terminada (BC001), el de la base", async () => {
    const casos: [ErrorSupabase, string][] = [
      [rechazo("42501", "permission denied", 403), "Solo el coordinador de la campaña puede cambiar las becas de su equipo."],
      [rechazo("P0001", "algo raro"), "No se pudo guardar la beca. Probá de nuevo más tarde."],
      [rechazo("BC001", "La campaña ya terminó y sus becas quedan como estaban. Elegí una campaña en curso o por empezar."), "La campaña ya terminó y sus becas quedan como estaban. Elegí una campaña en curso o por empezar."],
    ];
    for (const [error, mensaje] of casos) {
      expect(await elegirCarreraRpc(clienteCon({ elegir_carrera: error }).cliente, CAMPANIA, PAULA, TEOLOGIA)).toEqual({ ok: false, mensaje });
    }
  });

  it("una caída no es un rechazo: llega como excepción para mostrar «sin conexión» (también si cae al releer)", async () => {
    const caida = new TypeError("fetch failed");
    await expect(elegirCarreraRpc(clienteCon({ elegir_carrera: caida }).cliente, CAMPANIA, PAULA, TEOLOGIA)).rejects.toBe(caida);
    await expect(elegirCarreraRpc(clienteCon({ elegir_carrera: [], becas_de_campania: caida }).cliente, CAMPANIA, PAULA, TEOLOGIA)).rejects.toBe(caida);
  });

  it("si al releer ya no figura entre los inscriptos, avisa y pide recargar", async () => {
    const { cliente } = clienteCon({ elegir_carrera: [], becas_de_campania: [beca()] });
    expect(await elegirCarreraRpc(cliente, CAMPANIA, PAULA, TEOLOGIA)).toMatchObject({ ok: false, recargar: true });
  });
});

describe("asignarTipoDeBecaRpc", () => {
  it("manda el tipo en mayúsculas (o null para «Sin beca») y devuelve la beca como quedó", async () => {
    const { cliente, llamarRpc } = clienteCon({ asignar_beca: [], becas_de_campania: [beca()] });

    expect(await asignarTipoDeBecaRpc(cliente, CAMPANIA, EMILIANO, "completa")).toMatchObject({ ok: true, beca: { apuntaA: "completa", meta: { libros: 200, monto: 300000 } } });
    await asignarTipoDeBecaRpc(cliente, CAMPANIA, EMILIANO, "media");
    await asignarTipoDeBecaRpc(cliente, CAMPANIA, EMILIANO, null);

    expect(llamarRpc.mock.calls.filter(([nombre]) => nombre === "asignar_beca").map(([, argumentos]) => argumentos)).toEqual([
      { p_campania_id: CAMPANIA, p_usuarios: [EMILIANO], p_tipo: "COMPLETA" },
      { p_campania_id: CAMPANIA, p_usuarios: [EMILIANO], p_tipo: "MEDIA" },
      { p_campania_id: CAMPANIA, p_usuarios: [EMILIANO], p_tipo: null },
    ]);
  });

  it("sin meta cargada (BC004) avisa al administrador; sin carrera (BC003) pide recargar; campaña permanente (BC006), el texto de la base", async () => {
    const sinMeta = "Falta configurar la meta de esta carrera. Avisale al administrador para que la cargue y volvé a asignar la beca.";
    expect(await asignarTipoDeBecaRpc(clienteCon({ asignar_beca: rechazo("BC004", sinMeta) }).cliente, CAMPANIA, EMILIANO, "media")).toEqual({ ok: false, mensaje: sinMeta, sinMeta: true });
    // Un rechazo sin mensaje usa el mismo texto.
    expect(await asignarTipoDeBecaRpc(clienteCon({ asignar_beca: rechazo("BC004", "") }).cliente, CAMPANIA, EMILIANO, "media")).toEqual({ ok: false, mensaje: sinMeta, sinMeta: true });

    const sinCarrera = "Falta elegir la carrera de 1 colportor(es). Elegila en Becas y volvé a asignar la beca.";
    expect(await asignarTipoDeBecaRpc(clienteCon({ asignar_beca: rechazo("BC003", sinCarrera) }).cliente, CAMPANIA, EMILIANO, "media")).toEqual({ ok: false, mensaje: sinCarrera, recargar: true });

    const permanente = "En una campaña permanente no hay becas.";
    expect(await asignarTipoDeBecaRpc(clienteCon({ asignar_beca: rechazo("BC006", permanente) }).cliente, CAMPANIA, EMILIANO, "media")).toEqual({ ok: false, mensaje: permanente });
  });

  it("un colportor que no es un id se frena antes de llamar", async () => {
    const { cliente, llamarRpc } = clienteCon({});
    expect(await asignarTipoDeBecaRpc(cliente, CAMPANIA, "fila-3", "media")).toMatchObject({ ok: false, recargar: true });
    expect(llamarRpc).not.toHaveBeenCalled();
  });

  it("una caída sale como excepción", async () => {
    const caida = new ErrorSupabase("upstream", 502);
    await expect(asignarTipoDeBecaRpc(clienteCon({ asignar_beca: caida }).cliente, CAMPANIA, EMILIANO, "media")).rejects.toBe(caida);
  });
});
