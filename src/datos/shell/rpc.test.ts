import { describe, expect, it, vi } from "vitest";

import { crearFuenteShellRpc, hoyEnMontevideo, inicialesDe, resumenDeCampania } from "@/datos/shell/rpc";
import { ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import { RespuestaInesperada } from "@/datos/supabase/respuesta";

const PRIMAVERA = "11111111-1111-4111-8111-111111111111";
const PERMANENTE = "22222222-2222-4222-8222-222222222222";
const VERANO = "33333333-3333-4333-8333-333333333333";

/** Las filas de `campanias_del_coordinador()` (migración 0033): primero las en curso y después las por empezar. */
const campanias = [
  { id: PRIMAVERA, nombre: "Primavera 2026", tipo: "VERANO", fecha_inicio: "2026-09-15", fecha_fin: "2026-12-15" },
  { id: PERMANENTE, nombre: "Permanente 2026", tipo: "PERMANENTE", fecha_inicio: "2026-03-01", fecha_fin: null },
  { id: VERANO, nombre: "Verano 2027", tipo: "VERANO", fecha_inicio: "2027-01-04", fecha_fin: "2027-03-31" },
];

const ciudad = (nombre: string) => ({ campania_ciudad_id: `cc-${nombre}`, ciudad_id: `c-${nombre}`, nombre, departamento: null });

const ciudadesPorCampania: Record<string, unknown[]> = {
  [PRIMAVERA]: [ciudad("Las Piedras"), ciudad("Montevideo")],
  [PERMANENTE]: [ciudad("Salto")],
  [VERANO]: [],
};

type Respuesta = unknown | ((argumentos: Record<string, unknown>) => unknown);

function clienteCon(respuestas: Record<string, Respuesta>) {
  const llamarRpc = vi.fn<(nombre: string, argumentos: Record<string, unknown>) => Promise<unknown>>(async (nombre, argumentos) => {
    if (!(nombre in respuestas)) throw new Error(`Sin respuesta preparada para ${nombre}`);
    const respuesta = respuestas[nombre];
    if (typeof respuesta === "function") return (respuesta as (a: Record<string, unknown>) => unknown)(argumentos);
    if (respuesta instanceof Error) throw respuesta;
    return respuesta;
  });
  return { cliente: { llamarRpc } as unknown as ClienteRpc, llamarRpc };
}

function lecturas(cambios: Record<string, Respuesta> = {}) {
  return clienteCon({
    mi_perfil: [{ usuario_id: "u-1", nombre: "Marta", apellido: "Pérez" }],
    campanias_del_coordinador: campanias,
    ciudades_de_campania: (a: Record<string, unknown>) => ciudadesPorCampania[a.p_campania_id as string] ?? [],
    ...cambios,
  });
}

const sinElegir = async () => null;
/** El 23/10/2026 a media mañana en Montevideo. */
const ahora = () => new Date("2026-10-23T13:00:00Z");

describe("fuente del shell contra las RPC", () => {
  describe("listarCampanias", () => {
    it("trae las campañas con sus ciudades, en el orden de la RPC, y dice cuáles ya empezaron", async () => {
      const { cliente, llamarRpc } = lecturas();

      const lista = await crearFuenteShellRpc(cliente, sinElegir, ahora).listarCampanias();

      expect(lista).toEqual([
        {
          id: PRIMAVERA,
          nombre: "Primavera 2026",
          ciudades: ["Las Piedras", "Montevideo"],
          fechaInicio: "2026-09-15",
          fechaFin: "2026-12-15",
          estado: "en-curso",
        },
        { id: PERMANENTE, nombre: "Permanente 2026", ciudades: ["Salto"], fechaInicio: "2026-03-01", fechaFin: null, estado: "en-curso" },
        { id: VERANO, nombre: "Verano 2027", ciudades: [], fechaInicio: "2027-01-04", fechaFin: "2027-03-31", estado: "por-empezar" },
      ]);
      expect(llamarRpc).toHaveBeenCalledWith("campanias_del_coordinador", {});
      expect(llamarRpc).toHaveBeenCalledWith("ciudades_de_campania", { p_campania_id: PRIMAVERA });
      expect(llamarRpc).toHaveBeenCalledWith("ciudades_de_campania", { p_campania_id: VERANO });
    });

    it("una campaña que empieza hoy ya está en curso; la que empieza mañana, no (el día se cuenta en Montevideo)", async () => {
      const { cliente } = lecturas({
        campanias_del_coordinador: [
          { id: PRIMAVERA, nombre: "Hoy", fecha_inicio: "2026-10-23", fecha_fin: null },
          { id: VERANO, nombre: "Mañana", fecha_inicio: "2026-10-24", fecha_fin: null },
        ],
      });

      // 02:30 UTC del 24/10 todavía es el 23/10 a las 23:30 en Montevideo (UTC-3).
      const lista = await crearFuenteShellRpc(cliente, sinElegir, () => new Date("2026-10-24T02:30:00Z")).listarCampanias();

      expect(lista.map((c) => [c.nombre, c.estado])).toEqual([
        ["Hoy", "en-curso"],
        ["Mañana", "por-empezar"],
      ]);
    });

    it("sin campañas, la lista es vacía (y no pregunta por ciudades)", async () => {
      const { cliente, llamarRpc } = lecturas({ campanias_del_coordinador: [] });

      expect(await crearFuenteShellRpc(cliente, sinElegir, ahora).listarCampanias()).toEqual([]);
      expect(llamarRpc).toHaveBeenCalledTimes(1);
    });

    it("una falla de la red o del servicio NO es una lista vacía: sale como excepción", async () => {
      const caida = new TypeError("fetch failed");
      const servicio = new ErrorSupabase("boom", 503);

      await expect(crearFuenteShellRpc(lecturas({ campanias_del_coordinador: caida }).cliente, sinElegir).listarCampanias()).rejects.toBe(caida);
      await expect(crearFuenteShellRpc(lecturas({ ciudades_de_campania: servicio }).cliente, sinElegir).listarCampanias()).rejects.toBe(servicio);
    });

    it("una respuesta que no es la del contrato es inesperada", async () => {
      await expect(
        crearFuenteShellRpc(lecturas({ campanias_del_coordinador: { id: PRIMAVERA } }).cliente, sinElegir).listarCampanias(),
      ).rejects.toBeInstanceOf(RespuestaInesperada);
      await expect(
        crearFuenteShellRpc(lecturas({ campanias_del_coordinador: [{ id: PRIMAVERA, nombre: "Sin fechas" }] }).cliente, sinElegir).listarCampanias(),
      ).rejects.toBeInstanceOf(RespuestaInesperada);
      await expect(
        crearFuenteShellRpc(lecturas({ ciudades_de_campania: [{ nombre: 5 }] }).cliente, sinElegir).listarCampanias(),
      ).rejects.toBeInstanceOf(RespuestaInesperada);
    });
  });

  describe("obtenerResumenCoordinador", () => {
    it("sin elegir, muestra la primera campaña con sus ciudades y las iniciales del perfil", async () => {
      const { cliente } = lecturas();

      const resumen = await crearFuenteShellRpc(cliente, sinElegir, ahora).obtenerResumenCoordinador();

      expect(resumen).toEqual({
        nombre: "Marta Pérez",
        iniciales: "MP",
        region: "Las Piedras · Montevideo",
        campania: "Primavera 2026",
        campaniaId: PRIMAVERA,
      });
    });

    it("muestra la que eligió la coordinadora si figura en su lista", async () => {
      const { cliente } = lecturas();

      const resumen = await crearFuenteShellRpc(cliente, async () => PERMANENTE, ahora).obtenerResumenCoordinador();

      expect(resumen).toMatchObject({ region: "Salto", campania: "Permanente 2026", campaniaId: PERMANENTE });
    });

    it("una elegida que ya no figura (terminó, o la cookie es ajena) vuelve a la primera", async () => {
      const { cliente } = lecturas();

      const resumen = await crearFuenteShellRpc(cliente, async () => "99999999-9999-4999-8999-999999999999", ahora).obtenerResumenCoordinador();

      expect(resumen).toMatchObject({ campaniaId: PRIMAVERA });
    });

    it("una campaña sin ciudades todavía deja la región vacía", async () => {
      const { cliente } = lecturas();

      const resumen = await crearFuenteShellRpc(cliente, async () => VERANO, ahora).obtenerResumenCoordinador();

      expect(resumen).toMatchObject({ region: "", campania: "Verano 2027", campaniaId: VERANO });
    });

    it("sin campañas dice «Sin campaña»", async () => {
      const { cliente } = lecturas({ campanias_del_coordinador: [] });

      const resumen = await crearFuenteShellRpc(cliente, sinElegir, ahora).obtenerResumenCoordinador();

      expect(resumen).toMatchObject({ region: "", campania: "Sin campaña", campaniaId: null });
    });

    it("una cuenta sin nombre ni apellido no deja el avatar ni el nombre vacíos", async () => {
      const { cliente } = lecturas({ mi_perfil: [{ usuario_id: "u-1", nombre: "", apellido: "" }] });

      const resumen = await crearFuenteShellRpc(cliente, sinElegir, ahora).obtenerResumenCoordinador();

      expect(resumen).toMatchObject({ nombre: "Coordinador", iniciales: "?" });
    });

    it("una falla al traer el perfil o las campañas sale como excepción: no se inventa un topbar", async () => {
      const servicio = new ErrorSupabase("boom", 503);

      await expect(crearFuenteShellRpc(lecturas({ mi_perfil: servicio }).cliente, sinElegir).obtenerResumenCoordinador()).rejects.toBe(servicio);
      await expect(
        crearFuenteShellRpc(lecturas({ campanias_del_coordinador: servicio }).cliente, sinElegir).obtenerResumenCoordinador(),
      ).rejects.toBe(servicio);
    });
  });
});

describe("hoyEnMontevideo", () => {
  it("es el día de Montevideo (UTC-3), no el de UTC", () => {
    expect(hoyEnMontevideo(new Date("2026-10-24T02:30:00Z"))).toBe("2026-10-23");
    expect(hoyEnMontevideo(new Date("2026-10-24T03:00:00Z"))).toBe("2026-10-24");
  });
});

describe("inicialesDe", () => {
  it("toma la inicial del nombre y la del apellido, en mayúscula", () => {
    expect(inicialesDe("marta", "pérez")).toBe("MP");
    expect(inicialesDe("  Álvaro ", "")).toBe("Á");
    expect(inicialesDe("", "")).toBe("?");
  });

  it("no parte un emoji por la mitad", () => {
    expect(inicialesDe("😀 Ana", "Pérez")).toBe("😀P");
  });
});

describe("resumenDeCampania", () => {
  it("une las ciudades con « · » y, sin campaña, dice «Sin campaña»", () => {
    expect(
      resumenDeCampania({ id: "c", nombre: "N", ciudades: ["A", "B"], fechaInicio: "2026-01-01", fechaFin: null, estado: "en-curso" }),
    ).toEqual({ region: "A · B", campania: "N", campaniaId: "c" });
    expect(resumenDeCampania(undefined)).toEqual({ region: "", campania: "Sin campaña", campaniaId: null });
  });
});
