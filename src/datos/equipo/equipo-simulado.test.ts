import { describe, expect, it } from "vitest";

import { COORDINADOR_SIMULADO, crearEquipoSimulado, HOY_SIMULADO } from "@/datos/equipo/equipo-simulado";

async function datosDe(fuente = crearEquipoSimulado()) {
  const datos = await fuente.obtenerEquipoPorCiudad();
  if (!datos) throw new Error("la simulada siempre tiene campaña");
  return datos;
}

describe("fuente simulada de la vista 33", () => {
  it("trae las tres ciudades del diseño, sus 25 colportores y la que se sumó hoy sin zona", async () => {
    const datos = await datosDe();

    expect(datos.hoy).toBe(HOY_SIMULADO);
    expect(datos.ciudades.map((c) => [c.nombre, c.departamento])).toEqual([
      ["Rivera", "Rivera"],
      ["Artigas", "Artigas"],
      ["Bella Unión", "Artigas"],
    ]);
    expect(datos.colportores).toHaveLength(26);
    const rocio = datos.colportores.find((c) => c.nombre === "Rocío Benítez");
    expect(rocio).toMatchObject({ ciudadId: null, zonaActual: null, acompanamientos: [] });
    expect(datos.colportores.filter((c) => c.ciudadId === "riv")).toHaveLength(10);
    expect(datos.solicitudesPendientes).toBe(0);
  });

  it("Emiliano Sosa fue acompañado el 08/09 y el 02/10; Florencia Pintos, nunca", async () => {
    const datos = await datosDe();
    const por = (nombre: string) => datos.colportores.find((c) => c.nombre === nombre);

    expect(por("Emiliano Sosa")?.acompanamientos.map((a) => a.dia)).toEqual(["2026-10-02", "2026-09-08"]);
    expect(por("Florencia Pintos")?.acompanamientos).toEqual([]);
  });

  it("las zonas anteriores son las del diseño, con sus fechas", async () => {
    const datos = await datosDe();
    const sofia = datos.colportores.find((c) => c.nombre === "Sofía Cabral");

    expect(sofia?.zonaActual).toMatchObject({ nombre: "Centro", desde: "2026-10-12" });
    expect(sofia?.zonasAnteriores.map((z) => [z.nombre, z.desde, z.hasta])).toEqual([
      ["Ayuí", "2026-09-01", "2026-09-20"],
      ["Rampla", "2026-09-21", "2026-10-11"],
    ]);
  });

  it("los datos son los mismos en cada arranque", async () => {
    expect(await datosDe()).toEqual(await datosDe());
  });

  it("las jornadas de un colportor van de la más nueva a la más vieja, ninguna es de hoy, y las de Florencia están todas libres", async () => {
    const fuente = crearEquipoSimulado();
    const florencia = (await datosDe(fuente)).colportores.find((c) => c.nombre === "Florencia Pintos");

    const r = await fuente.jornadasParaAcompanar("c", florencia?.id ?? "");

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.jornadas.length).toBeGreaterThan(10);
    expect(r.jornadas.every((j) => j.acompanante === null)).toBe(true);
    const dias = r.jornadas.map((j) => j.dia);
    expect(dias).toEqual([...dias].sort().reverse());
    expect(dias[0] < HOY_SIMULADO).toBe(true);
  });

  it("un colportor que no está en la campaña no tiene jornadas", async () => {
    expect(await crearEquipoSimulado().jornadasParaAcompanar("c", "nadie")).toEqual({ ok: false, mensaje: "El colportor no está en esta campaña." });
  });

  it("registrar una jornada libre la anota a nombre del coordinador y la siguiente lectura la trae; repetir no suma", async () => {
    const fuente = crearEquipoSimulado();
    const florencia = (await datosDe(fuente)).colportores.find((c) => c.nombre === "Florencia Pintos");
    const lista = await fuente.jornadasParaAcompanar("c", florencia?.id ?? "");
    if (!lista.ok) throw new Error("sin jornadas");
    const libre = lista.jornadas[0];

    expect(await fuente.registrarAcompanamiento("c", libre.id)).toEqual({
      ok: true,
      dia: libre.dia,
      acompanante: COORDINADOR_SIMULADO,
      yaEstaba: false,
      origen: "COORDINADOR",
      nota: null,
    });
    expect(await fuente.registrarAcompanamiento("c", libre.id)).toEqual({
      ok: true,
      dia: libre.dia,
      acompanante: COORDINADOR_SIMULADO,
      yaEstaba: true,
      origen: "COORDINADOR",
      nota: null,
    });

    const despues = (await datosDe(fuente)).colportores.find((c) => c.nombre === "Florencia Pintos");
    expect(despues?.acompanamientos).toEqual([
      { jornadaId: libre.id, dia: libre.dia, horas: expect.any(Number), acompanante: COORDINADOR_SIMULADO, acompananteEsVos: true, origen: "COORDINADOR", cargadoPor: { esVos: true }, nota: null },
    ]);
  });

  /** La primera jornada libre de Florencia (nadie la acompañó) y el resto de los colportores de la campaña. */
  async function conJornadaLibre() {
    const fuente = crearEquipoSimulado();
    const datos = await datosDe(fuente);
    const florencia = datos.colportores.find((c) => c.nombre === "Florencia Pintos");
    const santiago = datos.colportores.find((c) => c.nombre === "Santiago Pereira");
    const lista = await fuente.jornadasParaAcompanar("c", florencia?.id ?? "");
    if (!lista.ok || !florencia || !santiago) throw new Error("falta el ejemplo");
    return { fuente, florencia, santiago, libre: lista.jornadas[0] };
  }

  it("registrar a nombre de otro colportor, con una nota: queda con origen COORDINADOR y la nota recortada; ya no es «vos»", async () => {
    const { fuente, florencia, santiago, libre } = await conJornadaLibre();

    const r = await fuente.registrarAcompanamiento("c", libre.id, { acompananteId: santiago.id, nota: "  Trabajamos juntos el sector norte.  " });

    expect(r).toEqual({ ok: true, dia: libre.dia, acompanante: "Santiago Pereira", yaEstaba: false, origen: "COORDINADOR", nota: "Trabajamos juntos el sector norte." });
    const despues = (await datosDe(fuente)).colportores.find((c) => c.id === florencia.id);
    expect(despues?.acompanamientos[0]).toMatchObject({ acompanante: "Santiago Pereira", acompananteEsVos: false, origen: "COORDINADOR", nota: "Trabajamos juntos el sector norte." });
  });

  it("repetir con la misma persona es «ya estaba» y la nota nueva no se guarda; con otra persona, no se pisa", async () => {
    const { fuente, florencia, santiago, libre } = await conJornadaLibre();
    await fuente.registrarAcompanamiento("c", libre.id, { acompananteId: santiago.id, nota: "La primera" });

    expect(await fuente.registrarAcompanamiento("c", libre.id, { acompananteId: santiago.id, nota: "Otra" })).toMatchObject({ ok: true, yaEstaba: true, nota: "La primera" });
    expect(await fuente.registrarAcompanamiento("c", libre.id)).toMatchObject({ ok: false, recargar: true });
    const despues = (await datosDe(fuente)).colportores.find((c) => c.id === florencia.id);
    expect(despues?.acompanamientos[0].nota).toBe("La primera");
  });

  it("un colportor no puede acompañar su propia jornada (JO004) ni alguien de afuera de la campaña (JO005)", async () => {
    const { fuente, florencia, libre } = await conJornadaLibre();

    expect(await fuente.registrarAcompanamiento("c", libre.id, { acompananteId: florencia.id })).toMatchObject({ ok: false, mensaje: expect.stringContaining("propia jornada") });
    expect(await fuente.registrarAcompanamiento("c", libre.id, { acompananteId: "usr-de-afuera" })).toMatchObject({ ok: false, mensaje: expect.stringContaining("no está inscripto") });
    const despues = (await datosDe(fuente)).colportores.find((c) => c.id === florencia.id);
    expect(despues?.acompanamientos).toEqual([]);
  });

  it("una nota de más de 500 caracteres se rechaza y la jornada queda libre", async () => {
    const { fuente, florencia, libre } = await conJornadaLibre();

    expect(await fuente.registrarAcompanamiento("c", libre.id, { nota: "a".repeat(501) })).toMatchObject({ ok: false, mensaje: expect.stringContaining("hasta 500 caracteres y esta tiene 501") });
    expect((await datosDe(fuente)).colportores.find((c) => c.id === florencia.id)?.acompanamientos).toEqual([]);
  });

  it("el diseño: Emiliano tiene uno que marcó el colportor y uno cargado desde el panel con su nota; quien se sumó hoy cuenta desde hoy", async () => {
    const datos = await datosDe(crearEquipoSimulado());
    const emiliano = datos.colportores.find((c) => c.nombre === "Emiliano Sosa");
    const rocio = datos.colportores.find((c) => c.nombre === "Rocío Benítez");

    expect(emiliano?.acompanamientos.map((a) => [a.dia, a.origen, a.cargadoPor, a.nota])).toEqual([
      ["2026-10-02", "COORDINADOR", { esVos: true }, expect.any(String)],
      ["2026-09-08", "COLPORTOR", null, null],
    ]);
    expect(emiliano?.contadoDesde).toBe("2026-09-01");
    expect(rocio?.contadoDesde).toBe(datos.hoy);
  });

  it("no pisa el acompañamiento de otra persona y pide recargar", async () => {
    const fuente = crearEquipoSimulado();
    const emiliano = (await datosDe(fuente)).colportores.find((c) => c.nombre === "Emiliano Sosa");
    const deTomas = emiliano?.acompanamientos.find((a) => a.acompanante !== COORDINADOR_SIMULADO);
    if (!deTomas) throw new Error("el diseño tiene un acompañamiento de otra persona");

    const r = await fuente.registrarAcompanamiento("c", deTomas.jornadaId);

    expect(r).toMatchObject({ ok: false, recargar: true });
    expect(r.ok === false && r.mensaje).toContain(`ya figura acompañada por ${deTomas.acompanante}`);
  });

  it("una jornada que no existe pide recargar", async () => {
    expect(await crearEquipoSimulado().registrarAcompanamiento("c", "jor-inexistente")).toMatchObject({ ok: false, recargar: true });
  });

  it("cada fuente lleva su propio estado", async () => {
    const una = crearEquipoSimulado();
    const otra = crearEquipoSimulado();
    const florencia = (await datosDe(una)).colportores.find((c) => c.nombre === "Florencia Pintos");
    const lista = await una.jornadasParaAcompanar("c", florencia?.id ?? "");
    if (!lista.ok) throw new Error("sin jornadas");

    await una.registrarAcompanamiento("c", lista.jornadas[0].id);

    const enLaOtra = (await datosDe(otra)).colportores.find((c) => c.nombre === "Florencia Pintos");
    expect(enLaOtra?.acompanamientos).toEqual([]);
  });
});
