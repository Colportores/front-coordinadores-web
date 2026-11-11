import { describe, expect, it, vi } from "vitest";

import { crearFuenteZonasRpc } from "@/datos/equipo/zonas/rpc";
import { ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import { RespuestaInesperada } from "@/datos/supabase/respuesta";

const CAMPANIA = "11111111-1111-4111-8111-111111111111";
const ZONA_A = "66666666-6666-4666-8666-666666666666";
const ZONA_B = "77777777-7777-4777-8777-777777777777";

/** `n` UUID distintos y ordenados, para armar páginas de casas. */
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const fila = (n: number, estado: string | null = null, extra: Record<string, unknown> = {}) => ({
  ubicacion_id: uuid(n),
  lat: -34.87,
  lon: -56.26,
  tipo: "CASA",
  estado,
  ...extra,
});

type Llamada = (nombre: string, argumentos: Record<string, unknown>) => unknown;

function clienteCon(responder: Llamada) {
  const llamarRpc = vi.fn<(nombre: string, argumentos: Record<string, unknown>) => Promise<unknown>>(async (nombre, argumentos) => {
    const respuesta = responder(nombre, argumentos);
    if (respuesta instanceof Error) throw respuesta;
    return respuesta;
  });
  return { fuente: crearFuenteZonasRpc({ llamarRpc } as unknown as ClienteRpc), llamarRpc };
}

describe("casasDeZonas (casas_de_zona, vista 24)", () => {
  it("traduce los siete estados de house_status y deja la casa sin estado como «Sin visita»", async () => {
    const estados = [
      "ENTREGA_Y_COBRANZA_PENDIENTE",
      "COBRANZA_PENDIENTE",
      "ENTREVISTA_PROGRAMADA",
      "VENTA_COMPLETA",
      "ENTREVISTA_SIN_VENTA",
      "SIN_CONTESTAR",
      "RECHAZO",
    ];
    const { fuente } = clienteCon(() => [...estados.map((e, i) => fila(i + 1, e)), fila(8, null)]);

    const casas = await fuente.casasDeZonas(CAMPANIA, [ZONA_A]);

    expect(casas.map((c) => c.estado)).toEqual([...estados, "SIN_VISITA"]);
    expect(casas[0]).toEqual({ id: uuid(1), lon: -56.26, lat: -34.87, tipo: "CASA", estado: "ENTREGA_Y_COBRANZA_PENDIENTE", ultimoCambio: null, zonaIds: [ZONA_A] });
  });

  it("no deja pasar nada que no sea punto, tipo y estado: ni montos, ni personas, ni dirección", async () => {
    const { fuente } = clienteCon(() => [fila(1, "COBRANZA_PENDIENTE", { monto: 1500, persona: "Ana", direccion: "Heredia 1234", notas: "x" })]);

    const [casa] = await fuente.casasDeZonas(CAMPANIA, [ZONA_A]);

    expect(Object.keys(casa).sort()).toEqual(["estado", "id", "lat", "lon", "tipo", "ultimoCambio", "zonaIds"]);
  });

  it("lee la fecha del último cambio de estado (ultimo_cambio) y la deja nula si la casa no tiene estado", async () => {
    const { fuente } = clienteCon(() => [
      fila(1, "VENTA_COMPLETA", { ultimo_cambio: "2026-10-18T21:30:00+00:00" }),
      fila(2, null, { ultimo_cambio: null }),
      fila(3, "RECHAZO"),
    ]);

    const casas = await fuente.casasDeZonas(CAMPANIA, [ZONA_A]);

    expect(casas.map((c) => c.ultimoCambio)).toEqual(["2026-10-18T21:30:00+00:00", null, null]);
  });

  it("una fecha que no es un texto es una respuesta inesperada, no un «sin fecha»", async () => {
    const { fuente } = clienteCon(() => [fila(1, "VENTA_COMPLETA", { ultimo_cambio: 1760736600 })]);

    await expect(fuente.casasDeZonas(CAMPANIA, [ZONA_A])).rejects.toBeInstanceOf(RespuestaInesperada);
  });

  it("pide de a una zona, con la campaña y sin cursor en la primera página", async () => {
    const { fuente, llamarRpc } = clienteCon(() => []);

    await fuente.casasDeZonas(CAMPANIA, [ZONA_A, ZONA_B]);

    expect(llamarRpc).toHaveBeenCalledTimes(2);
    expect(llamarRpc).toHaveBeenCalledWith("casas_de_zona", { p_campania_id: CAMPANIA, p_zona_id: ZONA_A, p_limite: 1000 });
    expect(llamarRpc).toHaveBeenCalledWith("casas_de_zona", { p_campania_id: CAMPANIA, p_zona_id: ZONA_B, p_limite: 1000 });
  });

  it("sigue pidiendo páginas hasta que una venga con menos de 1000: un tope no esconde casas", async () => {
    const { fuente, llamarRpc } = clienteCon((_n, a) => {
      if (a.p_despues_de === undefined) return Array.from({ length: 1000 }, (_, i) => fila(i + 1));
      if (a.p_despues_de === uuid(1000)) return Array.from({ length: 1000 }, (_, i) => fila(1001 + i));
      return Array.from({ length: 5 }, (_, i) => fila(2001 + i));
    });

    const casas = await fuente.casasDeZonas(CAMPANIA, [ZONA_A]);

    expect(casas).toHaveLength(2005);
    expect(llamarRpc).toHaveBeenCalledTimes(3);
    expect(llamarRpc.mock.calls[1][1]).toMatchObject({ p_despues_de: uuid(1000) });
    expect(llamarRpc.mock.calls[2][1]).toMatchObject({ p_despues_de: uuid(2000) });
  });

  it("una página justo de 1000 pide una más (puede haber más) y una vacía cierra", async () => {
    const { fuente, llamarRpc } = clienteCon((_n, a) => (a.p_despues_de === undefined ? Array.from({ length: 1000 }, (_, i) => fila(i + 1)) : []));

    expect(await fuente.casasDeZonas(CAMPANIA, [ZONA_A])).toHaveLength(1000);
    expect(llamarRpc).toHaveBeenCalledTimes(2);
  });

  it("una respuesta que nunca termina de paginar es un error, no un cuelgue", async () => {
    let n = 0;
    const { fuente } = clienteCon(() => Array.from({ length: 1000 }, () => fila(++n)));

    await expect(fuente.casasDeZonas(CAMPANIA, [ZONA_A])).rejects.toBeInstanceOf(RespuestaInesperada);
  });

  it("una casa que cae en dos zonas superpuestas es un solo punto con las dos zonas", async () => {
    const { fuente } = clienteCon((_n, a) =>
      a.p_zona_id === ZONA_A ? [fila(1, "RECHAZO"), fila(2, "SIN_CONTESTAR")] : [fila(2, "SIN_CONTESTAR"), fila(3, null)],
    );

    const casas = await fuente.casasDeZonas(CAMPANIA, [ZONA_A, ZONA_B]);

    expect(casas.map((c) => [c.id, c.zonaIds])).toEqual([
      [uuid(1), [ZONA_A]],
      [uuid(2), [ZONA_A, ZONA_B]],
      [uuid(3), [ZONA_B]],
    ]);
  });

  it("la misma zona dos veces se pide una vez", async () => {
    const { fuente, llamarRpc } = clienteCon(() => [fila(1)]);

    const casas = await fuente.casasDeZonas(CAMPANIA, [ZONA_A, ZONA_A]);

    expect(llamarRpc).toHaveBeenCalledTimes(1);
    expect(casas[0].zonaIds).toEqual([ZONA_A]);
  });

  it("una zona dada de baja mientras tanto (CZ004) no tiene casas; las demás siguen", async () => {
    const { fuente } = clienteCon((_n, a) =>
      a.p_zona_id === ZONA_A ? new ErrorSupabase("La zona no existe o ya se dio de baja. Recargá el mapa.", 400, "CZ004") : [fila(1)],
    );

    const casas = await fuente.casasDeZonas(CAMPANIA, [ZONA_A, ZONA_B]);

    expect(casas.map((c) => c.zonaIds)).toEqual([[ZONA_B]]);
  });

  it("cualquier otra falla corta todo y no se toma por «no hay casas»", async () => {
    const { fuente } = clienteCon((_n, a) => (a.p_zona_id === ZONA_B ? new ErrorSupabase("sin permiso", 403, "42501") : [fila(1)]));

    await expect(fuente.casasDeZonas(CAMPANIA, [ZONA_A, ZONA_B])).rejects.toMatchObject({ codigo: "42501" });
    const caida = new TypeError("fetch failed");
    await expect(clienteCon(() => caida).fuente.casasDeZonas(CAMPANIA, [ZONA_A])).rejects.toBe(caida);
  });

  it("un estado o un tipo que el panel no conoce es una respuesta inesperada, no un punto gris", async () => {
    await expect(clienteCon(() => [fila(1, "ESTADO_NUEVO")]).fuente.casasDeZonas(CAMPANIA, [ZONA_A])).rejects.toBeInstanceOf(RespuestaInesperada);
    await expect(clienteCon(() => [fila(1, null, { tipo: "PLAZA" })]).fuente.casasDeZonas(CAMPANIA, [ZONA_A])).rejects.toBeInstanceOf(RespuestaInesperada);
    await expect(clienteCon(() => [fila(1, null, { lat: "x" })]).fuente.casasDeZonas(CAMPANIA, [ZONA_A])).rejects.toBeInstanceOf(RespuestaInesperada);
    await expect(clienteCon(() => ({ casas: [] })).fuente.casasDeZonas(CAMPANIA, [ZONA_A])).rejects.toBeInstanceOf(RespuestaInesperada);
  });

  it("un id que no es UUID se frena antes de llamar", async () => {
    const { fuente, llamarRpc } = clienteCon(() => []);

    await expect(fuente.casasDeZonas(CAMPANIA, ["zona-1"])).rejects.toBeInstanceOf(RespuestaInesperada);
    expect(llamarRpc).not.toHaveBeenCalled();
  });

  it("sin zonas no llama a nadie", async () => {
    const { fuente, llamarRpc } = clienteCon(() => []);

    expect(await fuente.casasDeZonas(CAMPANIA, [])).toEqual([]);
    expect(llamarRpc).not.toHaveBeenCalled();
  });
});
