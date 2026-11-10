import { describe, expect, it, vi } from "vitest";

import { crearFuenteZonasRpc } from "@/datos/equipo/zonas/rpc";
import { ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import { RespuestaInesperada } from "@/datos/supabase/respuesta";

const CAMPANIA = "11111111-1111-4111-8111-111111111111";
const CIUDAD = "55555555-5555-4555-8555-555555555555";
const ZONA_A = "66666666-6666-4666-8666-666666666666";

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

describe("casasDeLaCiudad (casas_de_la_ciudad, vista 24)", () => {
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

    const casas = await fuente.casasDeLaCiudad(CAMPANIA, CIUDAD);

    expect(casas.map((c) => c.estado)).toEqual([...estados, "SIN_VISITA"]);
    expect(casas[0]).toEqual({
      id: uuid(1),
      lon: -56.26,
      lat: -34.87,
      tipo: "CASA",
      estado: "ENTREGA_Y_COBRANZA_PENDIENTE",
      ultimoCambio: null,
      zonaIds: [],
      direccion: null,
      registradaPor: null,
    });
  });

  it("no deja pasar montos, personas ni notas: solo el punto, el estado, la zona, la dirección del lugar y quien la registró", async () => {
    const { fuente } = clienteCon(() => [fila(1, "COBRANZA_PENDIENTE", { monto: 1500, persona: "Ana", notas: "x", telefono: "099" })]);

    const [casa] = await fuente.casasDeLaCiudad(CAMPANIA, CIUDAD);

    expect(Object.keys(casa).sort()).toEqual(["direccion", "estado", "id", "lat", "lon", "registradaPor", "tipo", "ultimoCambio", "zonaIds"]);
  });

  it("la zona de la casa: una sola si cae en una, ninguna si no cae en ninguna", async () => {
    const { fuente } = clienteCon(() => [
      fila(1, "RECHAZO", { zona_id: ZONA_A, zona_nombre: "Cerro Norte" }),
      fila(2, "RECHAZO", { zona_id: null, zona_nombre: null }),
    ]);

    const casas = await fuente.casasDeLaCiudad(CAMPANIA, CIUDAD);

    expect(casas.map((c) => c.zonaIds)).toEqual([[ZONA_A], []]);
  });

  it("la dirección junta calle y número; con uno solo escribe ese; sin ninguno es nula", async () => {
    const { fuente } = clienteCon(() => [
      fila(1, null, { calle: "Heredia", numero: "1234" }),
      fila(2, null, { calle: "Heredia", numero: null }),
      fila(3, null, { calle: null, numero: "55" }),
      fila(4, null, { calle: "  ", numero: "" }),
      fila(5, null, { calle: null, numero: null }),
      fila(6, null),
    ]);

    const casas = await fuente.casasDeLaCiudad(CAMPANIA, CIUDAD);

    expect(casas.map((c) => c.direccion)).toEqual(["Heredia 1234", "Heredia", "55", null, null, null]);
  });

  it("quien la registró: nombre y apellido; sin nombre, «Cuenta sin nombre»; sin persona, nulo", async () => {
    const { fuente } = clienteCon(() => [
      fila(1, null, { registrada_por: uuid(90), registrada_por_nombre: "Ana", registrada_por_apellido: "Pérez" }),
      fila(2, null, { registrada_por: uuid(91), registrada_por_nombre: "", registrada_por_apellido: "" }),
      fila(3, null, { registrada_por: null, registrada_por_nombre: null, registrada_por_apellido: null }),
    ]);

    const casas = await fuente.casasDeLaCiudad(CAMPANIA, CIUDAD);

    expect(casas.map((c) => c.registradaPor)).toEqual(["Ana Pérez", "Cuenta sin nombre", null]);
  });

  it("lee la fecha del último cambio de estado (ultimo_cambio) y la deja nula si la casa no tiene estado", async () => {
    const { fuente } = clienteCon(() => [
      fila(1, "VENTA_COMPLETA", { ultimo_cambio: "2026-10-18T21:30:00+00:00" }),
      fila(2, null, { ultimo_cambio: null }),
      fila(3, "RECHAZO"),
    ]);

    const casas = await fuente.casasDeLaCiudad(CAMPANIA, CIUDAD);

    expect(casas.map((c) => c.ultimoCambio)).toEqual(["2026-10-18T21:30:00+00:00", null, null]);
  });

  it("una fecha que no es un texto es una respuesta inesperada, no un «sin fecha»", async () => {
    const { fuente } = clienteCon(() => [fila(1, "VENTA_COMPLETA", { ultimo_cambio: 1760736600 })]);

    await expect(fuente.casasDeLaCiudad(CAMPANIA, CIUDAD)).rejects.toBeInstanceOf(RespuestaInesperada);
  });

  it("pide la ciudad de la campaña, de a 1000 y sin cursor en la primera página", async () => {
    const { fuente, llamarRpc } = clienteCon(() => []);

    await fuente.casasDeLaCiudad(CAMPANIA, CIUDAD);

    expect(llamarRpc).toHaveBeenCalledTimes(1);
    expect(llamarRpc).toHaveBeenCalledWith("casas_de_la_ciudad", { p_campania_id: CAMPANIA, p_campania_ciudad_id: CIUDAD, p_limite: 1000 });
  });

  it("sigue pidiendo páginas hasta que una venga con menos de 1000: un tope no esconde casas", async () => {
    const { fuente, llamarRpc } = clienteCon((_n, a) => {
      if (a.p_despues_de === undefined) return Array.from({ length: 1000 }, (_, i) => fila(i + 1));
      if (a.p_despues_de === uuid(1000)) return Array.from({ length: 1000 }, (_, i) => fila(1001 + i));
      return Array.from({ length: 5 }, (_, i) => fila(2001 + i));
    });

    const casas = await fuente.casasDeLaCiudad(CAMPANIA, CIUDAD);

    expect(casas).toHaveLength(2005);
    expect(llamarRpc).toHaveBeenCalledTimes(3);
    expect(llamarRpc.mock.calls[1][1]).toMatchObject({ p_despues_de: uuid(1000) });
    expect(llamarRpc.mock.calls[2][1]).toMatchObject({ p_despues_de: uuid(2000) });
  });

  it("una página justo de 1000 pide una más (puede haber más) y una vacía cierra", async () => {
    const { fuente, llamarRpc } = clienteCon((_n, a) => (a.p_despues_de === undefined ? Array.from({ length: 1000 }, (_, i) => fila(i + 1)) : []));

    expect(await fuente.casasDeLaCiudad(CAMPANIA, CIUDAD)).toHaveLength(1000);
    expect(llamarRpc).toHaveBeenCalledTimes(2);
  });

  it("una respuesta que nunca termina de paginar es un error, no un cuelgue", async () => {
    let n = 0;
    const { fuente } = clienteCon(() => Array.from({ length: 1000 }, () => fila(++n)));

    await expect(fuente.casasDeLaCiudad(CAMPANIA, CIUDAD)).rejects.toBeInstanceOf(RespuestaInesperada);
  });

  it("cualquier rechazo o caída corta todo y no se toma por «no hay casas» (tampoco la ciudad que ya no es de la campaña)", async () => {
    await expect(clienteCon(() => new ErrorSupabase("sin permiso", 403, "42501")).fuente.casasDeLaCiudad(CAMPANIA, CIUDAD)).rejects.toMatchObject({ codigo: "42501" });
    await expect(clienteCon(() => new ErrorSupabase("La ciudad no es de esta campaña.", 400, "CZ012")).fuente.casasDeLaCiudad(CAMPANIA, CIUDAD)).rejects.toMatchObject({
      codigo: "CZ012",
    });
    const caida = new TypeError("fetch failed");
    await expect(clienteCon(() => caida).fuente.casasDeLaCiudad(CAMPANIA, CIUDAD)).rejects.toBe(caida);
  });

  it("una falla en la segunda página no devuelve la primera como si fuera todo", async () => {
    const { fuente } = clienteCon((_n, a) => (a.p_despues_de === undefined ? Array.from({ length: 1000 }, (_, i) => fila(i + 1)) : new TypeError("fetch failed")));

    await expect(fuente.casasDeLaCiudad(CAMPANIA, CIUDAD)).rejects.toBeInstanceOf(TypeError);
  });

  it("un estado o un tipo que el panel no conoce es una respuesta inesperada, no un punto gris", async () => {
    await expect(clienteCon(() => [fila(1, "ESTADO_NUEVO")]).fuente.casasDeLaCiudad(CAMPANIA, CIUDAD)).rejects.toBeInstanceOf(RespuestaInesperada);
    await expect(clienteCon(() => [fila(1, null, { tipo: "PLAZA" })]).fuente.casasDeLaCiudad(CAMPANIA, CIUDAD)).rejects.toBeInstanceOf(RespuestaInesperada);
    await expect(clienteCon(() => [fila(1, null, { lat: "x" })]).fuente.casasDeLaCiudad(CAMPANIA, CIUDAD)).rejects.toBeInstanceOf(RespuestaInesperada);
    await expect(clienteCon(() => ({ casas: [] })).fuente.casasDeLaCiudad(CAMPANIA, CIUDAD)).rejects.toBeInstanceOf(RespuestaInesperada);
  });

  it("un id de ciudad que no es UUID se frena antes de llamar", async () => {
    const { fuente, llamarRpc } = clienteCon(() => []);

    await expect(fuente.casasDeLaCiudad(CAMPANIA, "ciudad-1")).rejects.toBeInstanceOf(RespuestaInesperada);
    expect(llamarRpc).not.toHaveBeenCalled();
  });
});
