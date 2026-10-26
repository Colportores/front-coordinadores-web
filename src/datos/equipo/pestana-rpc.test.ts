import { describe, expect, it, vi } from "vitest";

import { crearFuentePestanaRpc } from "@/datos/equipo/pestana-rpc";
import { ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import { RespuestaInesperada } from "@/datos/supabase/respuesta";

const CAMPANIA = "11111111-1111-4111-8111-111111111111";
const EMILIANO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROCIO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const JORNADA = "22222222-2222-4222-8222-222222222222";
const RIVERA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ARTIGAS = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

// 22:30 del 21/10 en Montevideo = 01:30 UTC del 22/10.
const AHORA = () => new Date("2026-10-22T01:30:00Z");

const campania = { id: CAMPANIA, nombre: "Primavera 2026", tipo: "PRIMAVERA", fecha_inicio: "2026-09-01", fecha_fin: "2026-12-19" };

const ciudades = [
  { campania_ciudad_id: "x1", ciudad_id: RIVERA, nombre: "Rivera", departamento: "Rivera", lat_centro: 0, lon_centro: 0, zoom_inicial: 12, cantidad_zonas: 3 },
  { campania_ciudad_id: "x2", ciudad_id: ARTIGAS, nombre: "Artigas", departamento: "Artigas", lat_centro: 0, lon_centro: 0, zoom_inicial: 12, cantidad_zonas: 1 },
];

/** Una fila de `zonas_por_colportor()` (migración 0062). */
function zonas(parcial: Record<string, unknown> = {}) {
  return {
    colportor_id: EMILIANO,
    nombre: "Emiliano",
    apellido: "Sosa",
    ciudad_id: RIVERA,
    ciudad_nombre: "Rivera",
    zona_id: "z-1",
    zona_nombre: "Santa Isabel",
    zona_desde: "2026-10-06",
    zona_desde_inicial: false,
    zonas_anteriores: [{ zona_id: "z-0", nombre: "Bisso", ciudad_id: RIVERA, ciudad_nombre: "Rivera", desde: "2026-09-01", hasta: "2026-10-05", inicial: false, eliminada: false }],
    casas_registradas: 340,
    ...parcial,
  };
}

/** Una fila de `historial_de_acompaniamientos()` (migración 0043). */
function historial(parcial: Record<string, unknown> = {}) {
  return {
    jornada_id: JORNADA,
    colportor_id: EMILIANO,
    nombre: "Emiliano",
    apellido: "Sosa",
    dia: "2026-10-02",
    horas: 4.5,
    en_curso: false,
    acompaniante_id: "m",
    acompaniante_nombre: "Mariana",
    acompaniante_apellido: "Pérez",
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

const perfil = [{ usuario_id: "m", nombre: "Mariana", apellido: "Pérez" }];

const completas = (cambios: Respuestas = {}): Respuestas => ({
  mi_perfil: perfil,
  campanias_del_coordinador: [campania],
  ciudades_de_campania: ciudades,
  zonas_por_colportor: [zonas()],
  historial_de_acompaniamientos: [historial()],
  ...cambios,
});

const rechazo = (codigo: string, mensaje: string, estado = 400) => new ErrorSupabase(mensaje, estado, codigo);

describe("obtenerEquipoPorCiudad", () => {
  it("arma la vista con la campaña, las ciudades, las zonas y los acompañamientos de cada colportor", async () => {
    const { cliente, llamarRpc } = clienteCon(completas());

    const datos = await crearFuentePestanaRpc(cliente, AHORA).obtenerEquipoPorCiudad();

    expect(datos).toEqual({
      campaniaId: CAMPANIA,
      campania: "Primavera 2026",
      campaniaInicio: "2026-09-01",
      campaniaFin: "2026-12-19",
      hoy: "2026-10-21",
      ciudades: [
        { id: ARTIGAS, nombre: "Artigas", departamento: "Artigas" },
        { id: RIVERA, nombre: "Rivera", departamento: "Rivera" },
      ],
      colportores: [
        {
          id: EMILIANO,
          nombre: "Emiliano Sosa",
          ciudadId: RIVERA,
          zonaActual: { id: "z-1", nombre: "Santa Isabel", desde: "2026-10-06", desdeInicial: false },
          zonasAnteriores: [{ nombre: "Bisso", desde: "2026-09-01", hasta: "2026-10-05", eliminada: false, inicial: false }],
          casasRegistradas: 340,
          acompanamientos: [{ jornadaId: JORNADA, dia: "2026-10-02", horas: 4.5, acompanante: "Mariana Pérez", acompananteEsVos: true }],
        },
      ],
      solicitudesPendientes: 0,
    });
    expect(llamarRpc).toHaveBeenCalledWith("zonas_por_colportor", { p_campania_id: CAMPANIA });
    expect(llamarRpc).toHaveBeenCalledWith("historial_de_acompaniamientos", { p_campania_id: CAMPANIA, p_colportor_id: null });
    expect(llamarRpc).toHaveBeenCalledWith("ciudades_de_campania", { p_campania_id: CAMPANIA });
  });

  it("un colportor sin zona ni acompañamientos: sin ciudad, sin zona y lista vacía", async () => {
    const sinZona = zonas({
      colportor_id: ROCIO,
      nombre: "Rocío",
      apellido: "Benítez",
      ciudad_id: null,
      ciudad_nombre: null,
      zona_id: null,
      zona_nombre: null,
      zona_desde: null,
      zona_desde_inicial: null,
      zonas_anteriores: [],
      casas_registradas: 0,
    });
    const { cliente } = clienteCon(completas({ zonas_por_colportor: [sinZona], historial_de_acompaniamientos: [] }));

    const datos = await crearFuentePestanaRpc(cliente, AHORA).obtenerEquipoPorCiudad();

    expect(datos?.colportores).toEqual([
      { id: ROCIO, nombre: "Rocío Benítez", ciudadId: null, zonaActual: null, zonasAnteriores: [], casasRegistradas: 0, acompanamientos: [] },
    ]);
  });

  it("junta los acompañamientos de cada colportor en el orden en que los manda la base y deja las horas nulas de una jornada abierta", async () => {
    const respuestas = completas({
      historial_de_acompaniamientos: [
        historial({ jornada_id: "j-3", dia: "2026-10-21", horas: null, en_curso: true }),
        historial({ jornada_id: "j-2", dia: "2026-10-02" }),
        historial({ jornada_id: "j-1", dia: "2026-09-08", acompaniante_nombre: "", acompaniante_apellido: "" }),
        historial({ jornada_id: "j-x", colportor_id: ROCIO, dia: "2026-09-10" }),
      ],
    });
    const { cliente } = clienteCon(respuestas);

    const datos = await crearFuentePestanaRpc(cliente, AHORA).obtenerEquipoPorCiudad();

    expect(datos?.colportores[0].acompanamientos).toEqual([
      { jornadaId: "j-3", dia: "2026-10-21", horas: null, acompanante: "Mariana Pérez", acompananteEsVos: true },
      { jornadaId: "j-2", dia: "2026-10-02", horas: 4.5, acompanante: "Mariana Pérez", acompananteEsVos: true },
      // Sin nombre ni apellido, la fila no queda sin acompañante.
      { jornadaId: "j-1", dia: "2026-09-08", horas: 4.5, acompanante: "Cuenta sin nombre", acompananteEsVos: true },
    ]);
  });

  it("«(vos)» solo donde acompañó quien tiene la sesión (`mi_perfil`); sin perfil, en ninguno", async () => {
    const otro = historial({ jornada_id: "j-otro", acompaniante_id: "t", acompaniante_nombre: "Tomás", acompaniante_apellido: "Ibarra" });
    const { cliente } = clienteCon(completas({ historial_de_acompaniamientos: [historial(), otro] }));
    const datos = await crearFuentePestanaRpc(cliente, AHORA).obtenerEquipoPorCiudad();
    expect(datos?.colportores[0].acompanamientos.map((a) => [a.acompanante, a.acompananteEsVos])).toEqual([
      ["Mariana Pérez", true],
      ["Tomás Ibarra", false],
    ]);

    const sinPerfil = clienteCon(completas({ mi_perfil: [], historial_de_acompaniamientos: [historial()] }));
    const otroDatos = await crearFuentePestanaRpc(sinPerfil.cliente, AHORA).obtenerEquipoPorCiudad();
    expect(otroDatos?.colportores[0].acompanamientos[0].acompananteEsVos).toBe(false);
  });

  it("el departamento de cada ciudad es el de la base; una ciudad vieja sin cargar queda en null (sin inventarlo)", async () => {
    const sinCargar = { ...ciudades[0], departamento: null };
    const sinColumna = { ...ciudades[1] } as Record<string, unknown>;
    delete sinColumna.departamento;
    const { cliente } = clienteCon(completas({ ciudades_de_campania: [sinCargar, sinColumna] }));

    const datos = await crearFuentePestanaRpc(cliente, AHORA).obtenerEquipoPorCiudad();

    expect(datos?.ciudades.map((c) => [c.nombre, c.departamento])).toEqual([
      ["Artigas", null],
      ["Rivera", null],
    ]);
  });

  it("un departamento que no es un texto es una respuesta inesperada", async () => {
    const { cliente } = clienteCon(completas({ ciudades_de_campania: [{ ...ciudades[0], departamento: 7 }] }));

    await expect(crearFuentePestanaRpc(cliente, AHORA).obtenerEquipoPorCiudad()).rejects.toBeInstanceOf(RespuestaInesperada);
  });

  it("una zona de una ciudad que la lista de la campaña no trae suma esa ciudad", async () => {
    const { cliente } = clienteCon(completas({ ciudades_de_campania: [ciudades[1]] }));

    const datos = await crearFuentePestanaRpc(cliente, AHORA).obtenerEquipoPorCiudad();

    expect(datos?.ciudades.map((c) => c.nombre)).toEqual(["Artigas", "Rivera"]);
  });

  it("sin campaña que no haya terminado es null y no pide nada más", async () => {
    const { cliente, llamarRpc } = clienteCon(completas({ campanias_del_coordinador: [] }));

    expect(await crearFuentePestanaRpc(cliente, AHORA).obtenerEquipoPorCiudad()).toBeNull();
    expect(llamarRpc).toHaveBeenCalledTimes(1);
  });

  it.each(["CZ001", "CZ011"])("si la campaña se terminó o se dio de baja mientras se pedía (%s) es como no tener campaña", async (codigo) => {
    const { cliente } = clienteCon(completas({ zonas_por_colportor: rechazo(codigo, "La campaña ya terminó.") }));

    expect(await crearFuentePestanaRpc(cliente, AHORA).obtenerEquipoPorCiudad()).toBeNull();
  });

  it("una falla de conexión, de servicio o de permiso no se toma por un equipo vacío", async () => {
    for (const error of [new TypeError("fetch failed"), rechazo("", "Bad gateway", 502), rechazo("42501", "Sin permiso", 403)]) {
      const { cliente } = clienteCon(completas({ historial_de_acompaniamientos: error }));
      await expect(crearFuentePestanaRpc(cliente, AHORA).obtenerEquipoPorCiudad()).rejects.toBe(error);
    }
  });

  it("una respuesta que no es la del contrato falla en vez de mostrar datos a medias", async () => {
    const malas: Respuestas[] = [
      { zonas_por_colportor: { no: "es una lista" } },
      { zonas_por_colportor: [zonas({ casas_registradas: "340" })] },
      { zonas_por_colportor: [zonas({ zona_desde: "06/10/2026" })] },
      { zonas_por_colportor: [zonas({ zonas_anteriores: "no" })] },
      { zonas_por_colportor: [zonas({ zonas_anteriores: [{ nombre: "Bisso" }] })] },
      { historial_de_acompaniamientos: [historial({ dia: "ayer" })] },
      { historial_de_acompaniamientos: [historial({ horas: "4" })] },
      { campanias_del_coordinador: [{ ...campania, fecha_inicio: "septiembre" }] },
      { campanias_del_coordinador: [{ ...campania, fecha_fin: "fin" }] },
    ];
    for (const cambio of malas) {
      const { cliente } = clienteCon(completas(cambio));
      await expect(crearFuentePestanaRpc(cliente, AHORA).obtenerEquipoPorCiudad()).rejects.toBeInstanceOf(RespuestaInesperada);
    }
  });

  it("una campaña sin fecha de fin la deja en null", async () => {
    const { cliente } = clienteCon(completas({ campanias_del_coordinador: [{ ...campania, fecha_fin: null }] }));

    expect((await crearFuentePestanaRpc(cliente, AHORA).obtenerEquipoPorCiudad())?.campaniaFin).toBeNull();
  });
});

describe("jornadasParaAcompanar", () => {
  const jornada = (parcial: Record<string, unknown> = {}) => ({
    jornada_id: JORNADA,
    dia: "2026-10-20",
    horas: 5.5,
    acompaniante_id: null,
    acompaniante_nombre: null,
    acompaniante_apellido: null,
    ...parcial,
  });

  it("devuelve las jornadas terminadas con quién las acompañó, o null si nadie", async () => {
    const { cliente, llamarRpc } = clienteCon({
      mi_perfil: perfil,
      jornadas_cerradas_de_colportor: [
        jornada(),
        jornada({ jornada_id: "otra", acompaniante_id: "t", acompaniante_nombre: "Tomás", acompaniante_apellido: "Ibarra" }),
        jornada({ jornada_id: "mia", acompaniante_id: "m", acompaniante_nombre: "Mariana", acompaniante_apellido: "Pérez" }),
      ],
    });

    const r = await crearFuentePestanaRpc(cliente).jornadasParaAcompanar(CAMPANIA, EMILIANO);

    expect(r).toEqual({
      ok: true,
      jornadas: [
        { id: JORNADA, dia: "2026-10-20", horas: 5.5, acompanante: null, acompananteEsVos: false },
        { id: "otra", dia: "2026-10-20", horas: 5.5, acompanante: "Tomás Ibarra", acompananteEsVos: false },
        { id: "mia", dia: "2026-10-20", horas: 5.5, acompanante: "Mariana Pérez", acompananteEsVos: true },
      ],
    });
    expect(llamarRpc).toHaveBeenCalledWith("jornadas_cerradas_de_colportor", { p_campania_id: CAMPANIA, p_colportor_id: EMILIANO });
  });

  it("un colportor que no es de la campaña da la lista vacía", async () => {
    const { cliente } = clienteCon({ mi_perfil: perfil, jornadas_cerradas_de_colportor: [] });

    expect(await crearFuentePestanaRpc(cliente).jornadasParaAcompanar(CAMPANIA, EMILIANO)).toEqual({ ok: true, jornadas: [] });
  });

  it("un id que no es una cuenta se frena antes de llamar", async () => {
    const { cliente, llamarRpc } = clienteCon({});

    const r = await crearFuentePestanaRpc(cliente).jornadasParaAcompanar(CAMPANIA, "no-es-uuid");

    expect(r).toEqual({ ok: false, mensaje: "El colportor no está en esta campaña." });
    expect(llamarRpc).not.toHaveBeenCalled();
  });

  it("traduce los rechazos y deja pasar las caídas", async () => {
    const sinPermiso = clienteCon({ mi_perfil: perfil, jornadas_cerradas_de_colportor: rechazo("42501", "x", 403) });
    expect(await crearFuentePestanaRpc(sinPermiso.cliente).jornadasParaAcompanar(CAMPANIA, EMILIANO)).toEqual({
      ok: false,
      mensaje: "Solo el coordinador de la campaña puede ver las jornadas de su equipo.",
    });

    const inexistente = clienteCon({ mi_perfil: perfil, jornadas_cerradas_de_colportor: rechazo("CZ001", "La campaña no existe.") });
    expect(await crearFuentePestanaRpc(inexistente.cliente).jornadasParaAcompanar(CAMPANIA, EMILIANO)).toEqual({ ok: false, mensaje: "La campaña no existe." });

    const rarisimo = clienteCon({ mi_perfil: perfil, jornadas_cerradas_de_colportor: rechazo("XX999", "interno") });
    expect(await crearFuentePestanaRpc(rarisimo.cliente).jornadasParaAcompanar(CAMPANIA, EMILIANO)).toEqual({
      ok: false,
      mensaje: "No se pudieron traer las jornadas. Probá de nuevo más tarde.",
    });

    const caida = new TypeError("fetch failed");
    await expect(crearFuentePestanaRpc(clienteCon({ mi_perfil: perfil, jornadas_cerradas_de_colportor: caida }).cliente).jornadasParaAcompanar(CAMPANIA, EMILIANO)).rejects.toBe(caida);
  });
});

describe("registrarAcompanamiento", () => {
  const confirmacion = (parcial: Record<string, unknown> = {}) => [
    {
      jornada_id: JORNADA,
      colportor_id: EMILIANO,
      dia: "2026-10-20",
      acompaniante_id: "m",
      acompaniante_nombre: "Mariana",
      acompaniante_apellido: "Pérez",
      ya_estaba: false,
      ...parcial,
    },
  ];

  it("registra y devuelve el día y quién quedó como acompañante", async () => {
    const { cliente, llamarRpc } = clienteCon({ agregar_acompaniamiento: confirmacion() });

    const r = await crearFuentePestanaRpc(cliente).registrarAcompanamiento(CAMPANIA, JORNADA);

    expect(r).toEqual({ ok: true, dia: "2026-10-20", acompanante: "Mariana Pérez", yaEstaba: false });
    expect(llamarRpc).toHaveBeenCalledWith("agregar_acompaniamiento", { p_campania_id: CAMPANIA, p_jornada_id: JORNADA });
  });

  it("si ya figuraba a nombre del coordinador (un reintento) lo dice", async () => {
    const { cliente } = clienteCon({ agregar_acompaniamiento: confirmacion({ ya_estaba: true }) });

    expect(await crearFuentePestanaRpc(cliente).registrarAcompanamiento(CAMPANIA, JORNADA)).toMatchObject({ ok: true, yaEstaba: true });
  });

  it.each([
    ["JO001", "La jornada no existe o no es de un colportor de esta campaña.", true],
    ["JO002", "La jornada todavía no terminó.", true],
    ["JO003", "Esta jornada ya figura acompañada por Lorena Gil.", true],
    ["JO004", "No podés registrarte como acompañante de tu propia jornada.", false],
    ["CZ011", "La campaña ya terminó y sus acompañamientos quedan como están.", false],
  ])("un rechazo %s muestra el texto de la base (%s) y pide recargar solo si la jornada cambió", async (codigo, mensaje, recargar) => {
    const { cliente } = clienteCon({ agregar_acompaniamiento: rechazo(codigo, mensaje) });

    const r = await crearFuentePestanaRpc(cliente).registrarAcompanamiento(CAMPANIA, JORNADA);

    expect(r).toEqual(recargar ? { ok: false, mensaje, recargar: true } : { ok: false, mensaje });
  });

  it("sin permiso o con un código que el panel no conoce, un texto propio", async () => {
    const sinPermiso = clienteCon({ agregar_acompaniamiento: rechazo("42501", "x", 403) });
    expect(await crearFuentePestanaRpc(sinPermiso.cliente).registrarAcompanamiento(CAMPANIA, JORNADA)).toEqual({
      ok: false,
      mensaje: "Solo el coordinador de la campaña puede registrar acompañamientos en ella.",
    });

    const desconocido = clienteCon({ agregar_acompaniamiento: rechazo("22023", "Elegí la jornada") });
    expect(await crearFuentePestanaRpc(desconocido.cliente).registrarAcompanamiento(CAMPANIA, JORNADA)).toEqual({
      ok: false,
      mensaje: "No se pudo registrar el acompañamiento. Probá de nuevo más tarde.",
    });
  });

  it("un rechazo sin mensaje usa el texto de la regla", async () => {
    const { cliente } = clienteCon({ agregar_acompaniamiento: rechazo("JO003", "") });

    expect(await crearFuentePestanaRpc(cliente).registrarAcompanamiento(CAMPANIA, JORNADA)).toEqual({
      ok: false,
      mensaje: "No se pudo registrar el acompañamiento. Probá de nuevo más tarde.",
      recargar: true,
    });
  });

  it("un id que no es una jornada se frena antes de llamar, con la lista por recargar", async () => {
    const { cliente, llamarRpc } = clienteCon({});

    const r = await crearFuentePestanaRpc(cliente).registrarAcompanamiento(CAMPANIA, "no-es-uuid");

    expect(r).toMatchObject({ ok: false, recargar: true });
    expect(llamarRpc).not.toHaveBeenCalled();
  });

  it("una caída no es un rechazo: llega como excepción para mostrar «sin conexión»", async () => {
    const caida = new TypeError("fetch failed");
    const { cliente } = clienteCon({ agregar_acompaniamiento: caida });

    await expect(crearFuentePestanaRpc(cliente).registrarAcompanamiento(CAMPANIA, JORNADA)).rejects.toBe(caida);
  });

  it("una respuesta vacía o con otra forma es inesperada", async () => {
    for (const respuesta of [[], { no: "es una lista" }, confirmacion({ dia: "hoy" }), confirmacion({ ya_estaba: "no" })]) {
      const { cliente } = clienteCon({ agregar_acompaniamiento: respuesta });
      await expect(crearFuentePestanaRpc(cliente).registrarAcompanamiento(CAMPANIA, JORNADA)).rejects.toBeInstanceOf(RespuestaInesperada);
    }
  });
});
