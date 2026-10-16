import { describe, expect, it, vi } from "vitest";

import type { FormaZona } from "@/datos/equipo/zonas/contrato";
import { COLOR_ZONA_SIN_COLOR } from "@/datos/equipo/zonas/paleta";
import { crearFuenteZonasRpc, FuncionSinConectar } from "@/datos/equipo/zonas/rpc";
import { ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import { RespuestaInesperada } from "@/datos/supabase/respuesta";
import { crearClienteRpc } from "@/datos/supabase/sdk";
import { crearSupabasePrueba, json, respuestaDeSesion } from "@/test/supabase";

const CAMPANIA = "11111111-1111-4111-8111-111111111111";
const MVD = "22222222-2222-4222-8222-222222222222";
const MVD_CATALOGO = "33333333-3333-4333-8333-333333333333";
const LAS_PIEDRAS = "44444444-4444-4444-8444-444444444444";
const LAS_PIEDRAS_CATALOGO = "55555555-5555-4555-8555-555555555555";
const ZONA_RADIAL = "66666666-6666-4666-8666-666666666666";
const ZONA_ESQUINAS = "77777777-7777-4777-8777-777777777777";
const DIEGO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ANA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SERGIO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const CIRCULO = {
  type: "Polygon",
  coordinates: [
    [
      [-56.26, -34.87],
      [-56.25, -34.87],
      [-56.25, -34.86],
      [-56.26, -34.87],
    ],
  ],
};

type Respuesta = unknown | ((argumentos: Record<string, unknown>) => unknown);

/** Un cliente que contesta por nombre de RPC: el valor tal cual, el error que sea una excepción, o lo que devuelva la función. */
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

const rechazo = (codigo: string, mensaje: string, estado = 400) => new ErrorSupabase(mensaje, estado, codigo);

const campanias = [{ id: CAMPANIA, nombre: "Verano 2026", tipo: "VERANO", fecha_inicio: "2026-09-01", fecha_fin: "2026-12-31" }];

const ciudades = [
  { campania_ciudad_id: MVD, ciudad_id: MVD_CATALOGO, nombre: "Montevideo", lat_centro: -34.87, lon_centro: -56.26, zoom_inicial: 13, cantidad_zonas: 2 },
  { campania_ciudad_id: LAS_PIEDRAS, ciudad_id: LAS_PIEDRAS_CATALOGO, nombre: "Las Piedras", lat_centro: -34.73, lon_centro: -56.22, zoom_inicial: 14, cantidad_zonas: 0 },
];

const inscriptos = [
  { usuario_id: DIEGO, nombre: "Diego", apellido: "Rocha", zona_id: ZONA_RADIAL, zona_nombre: "Paso de la Arena", suspendido: false, email: "diego@example.com", estado: "ACTIVA" },
  { usuario_id: ANA, nombre: "Ana", apellido: "Martínez", zona_id: null, zona_nombre: null, suspendido: false, email: "ana@example.com", estado: "ACTIVA" },
  { usuario_id: SERGIO, nombre: "", apellido: "", zona_id: null, zona_nombre: null, suspendido: true, email: "sergio@example.com", estado: "SUSPENDIDA" },
];

const zonaRadial = {
  zona_id: ZONA_RADIAL,
  nombre: "Paso de la Arena",
  tipo_forma: "RADIAL",
  color: "#1F6E3A",
  centro_lat: -34.85,
  centro_lon: -56.24,
  radio_m: 600,
  poligono_geojson: CIRCULO,
  esquinas: null,
  colportores: [{ usuario_id: DIEGO, nombre: "Diego", apellido: "Rocha", suspendido: false }],
  ubicaciones_registradas: 64,
};

const zonaEsquinas = {
  zona_id: ZONA_ESQUINAS,
  nombre: "Belvedere",
  tipo_forma: "ESQUINAS",
  color: "#A98330",
  centro_lat: null,
  centro_lon: null,
  radio_m: null,
  poligono_geojson: CIRCULO,
  esquinas: [
    { orden: 2, lat: -34.88, lon: -56.27, calle_a: "Rusia", calle_b: null },
    { orden: 1, lat: -34.87, lon: -56.26, calle_a: "Pororó", calle_b: "Heredia" },
    { orden: 3, lat: -34.86, lon: -56.25, calle_a: null, calle_b: null },
  ],
  colportores: [],
  ubicaciones_registradas: 21,
};

/** Las cinco lecturas de la vista, con las dos zonas en Montevideo y ninguna en Las Piedras. */
function lecturas(cambios: Record<string, Respuesta> = {}) {
  return clienteCon({
    campanias_del_coordinador: campanias,
    ciudades_de_campania: ciudades,
    colportores_de_campania: inscriptos,
    zonas_de_ciudad: (a: Record<string, unknown>) => (a.p_campania_ciudad_id === MVD ? [zonaRadial, zonaEsquinas] : []),
    ...cambios,
  });
}

describe("fuente de la vista 24 contra las RPC", () => {
  describe("obtenerZonas", () => {
    it("trae la campaña con sus ciudades, zonas, colportores y ubicaciones, con las RPC del contrato", async () => {
      const { cliente, llamarRpc } = lecturas();

      const datos = await crearFuenteZonasRpc(cliente).obtenerZonas();

      expect(datos).toEqual({
        campaniaId: CAMPANIA,
        campania: "Verano 2026",
        ciudades: [
          {
            id: MVD,
            catalogoId: MVD_CATALOGO,
            nombre: "Montevideo",
            centro: { lon: -56.26, lat: -34.87 },
            zoom: 13,
            zonas: [
              {
                id: ZONA_RADIAL,
                nombre: "Paso de la Arena",
                tipoForma: "RADIAL",
                color: "#1F6E3A",
                centro: { lon: -56.24, lat: -34.85 },
                radioM: 600,
                poligonoGeojson: CIRCULO,
                colportores: [{ id: DIEGO, nombre: "Diego Rocha" }],
                ubicacionesRegistradas: 64,
              },
              {
                id: ZONA_ESQUINAS,
                nombre: "Belvedere",
                tipoForma: "ESQUINAS",
                color: "#A98330",
                esquinas: [
                  { lon: -56.26, lat: -34.87, calleA: "Pororó", calleB: "Heredia" },
                  { lon: -56.27, lat: -34.88, calleA: "Rusia", calleB: "" },
                  { lon: -56.25, lat: -34.86, calleA: "", calleB: "" },
                ],
                poligonoGeojson: CIRCULO,
                colportores: [],
                ubicacionesRegistradas: 21,
              },
            ],
            colportores: [
              { id: DIEGO, nombre: "Diego Rocha", zonaId: ZONA_RADIAL, zonaNombre: "Paso de la Arena" },
              { id: ANA, nombre: "Ana Martínez", zonaId: null, zonaNombre: null },
              { id: SERGIO, nombre: "sergio@example.com", zonaId: null, zonaNombre: null, suspendido: true },
            ],
          },
          expect.objectContaining({ id: LAS_PIEDRAS, catalogoId: LAS_PIEDRAS_CATALOGO, nombre: "Las Piedras", zoom: 14, zonas: [] }),
        ],
      });
      expect(llamarRpc.mock.calls).toEqual(
        expect.arrayContaining([
          ["campanias_del_coordinador", {}],
          ["ciudades_de_campania", { p_campania_id: CAMPANIA }],
          ["colportores_de_campania", { p_campania_id: CAMPANIA }],
          ["zonas_de_ciudad", { p_campania_id: CAMPANIA, p_campania_ciudad_id: MVD }],
          ["zonas_de_ciudad", { p_campania_id: CAMPANIA, p_campania_ciudad_id: LAS_PIEDRAS }],
        ]),
      );
      expect(llamarRpc).toHaveBeenCalledTimes(5);
    });

    it("toma la primera campaña del coordinador (las en curso vienen antes)", async () => {
      const otra = "99999999-9999-4999-8999-999999999999";
      const { cliente, llamarRpc } = lecturas({
        campanias_del_coordinador: [...campanias, { id: otra, nombre: "Otoño", tipo: "OTONO", fecha_inicio: "2027-03-01", fecha_fin: null }],
      });

      await crearFuenteZonasRpc(cliente).obtenerZonas();

      expect(llamarRpc).toHaveBeenCalledWith("ciudades_de_campania", { p_campania_id: CAMPANIA });
      expect(llamarRpc).not.toHaveBeenCalledWith("ciudades_de_campania", { p_campania_id: otra });
    });

    it("sin campaña (ninguna que no haya terminado) devuelve null y no pide nada más", async () => {
      const { cliente, llamarRpc } = lecturas({ campanias_del_coordinador: [] });

      expect(await crearFuenteZonasRpc(cliente).obtenerZonas()).toBeNull();
      expect(llamarRpc).toHaveBeenCalledTimes(1);
    });

    it("una campaña por empezar se lee: sin colportores inscriptos y con las ciudades y zonas que ya armó", async () => {
      const { cliente } = lecturas({ colportores_de_campania: [] });

      const datos = await crearFuenteZonasRpc(cliente).obtenerZonas();

      expect(datos?.ciudades[0].colportores).toEqual([]);
      expect(datos?.ciudades[0].zonas).toHaveLength(2);
    });

    it("una ciudad sin zonas llega con la lista vacía", async () => {
      const { cliente } = lecturas();

      const datos = await crearFuenteZonasRpc(cliente).obtenerZonas();

      expect(datos?.ciudades[1].zonas).toEqual([]);
    });

    it("cada ciudad lista a todos los inscriptos, con la zona que tienen en la campaña (una sola por colportor)", async () => {
      const { cliente } = lecturas();

      const datos = await crearFuenteZonasRpc(cliente).obtenerZonas();

      for (const ciudad of datos?.ciudades ?? []) {
        expect(ciudad.colportores.map((c) => [c.id, c.zonaId])).toEqual([
          [DIEGO, ZONA_RADIAL],
          [ANA, null],
          [SERGIO, null],
        ]);
      }
    });

    it("una zona que se guardó sin color llega con el color de «sin color» y marcada `sinColor`; uno que no es #RRGGBB, también", async () => {
      const { cliente } = lecturas({
        zonas_de_ciudad: (a: Record<string, unknown>) =>
          a.p_campania_ciudad_id === MVD ? [{ ...zonaRadial, color: null }, { ...zonaEsquinas, color: "rojo" }] : [],
      });

      const datos = await crearFuenteZonasRpc(cliente).obtenerZonas();

      expect(datos?.ciudades[0].zonas.map((z) => z.color)).toEqual([COLOR_ZONA_SIN_COLOR, COLOR_ZONA_SIN_COLOR]);
      expect(datos?.ciudades[0].zonas.map((z) => z.sinColor)).toEqual([true, true]);
    });

    it("una zona con color propio no lleva `sinColor`", async () => {
      const { cliente } = lecturas({
        zonas_de_ciudad: (a: Record<string, unknown>) => (a.p_campania_ciudad_id === MVD ? [{ ...zonaRadial, color: "#1F6E3A" }] : []),
      });

      const [zona] = (await crearFuenteZonasRpc(cliente).obtenerZonas())?.ciudades[0].zonas ?? [];

      expect(zona.color).toBe("#1F6E3A");
      expect(zona).not.toHaveProperty("sinColor");
    });

    it("las esquinas salen por `orden` y una calle nula queda vacía, sin inventar un nombre", async () => {
      const { cliente } = lecturas();

      const datos = await crearFuenteZonasRpc(cliente).obtenerZonas();
      const belvedere = datos?.ciudades[0].zonas[1];

      expect(belvedere?.esquinas?.map((e) => [e.calleA, e.calleB])).toEqual([
        ["Pororó", "Heredia"],
        ["Rusia", ""],
        ["", ""],
      ]);
    });

    it("el colportor de una zona sin nombre ni apellido se nombra con su cuenta de la lista de inscriptos", async () => {
      const { cliente } = lecturas({
        zonas_de_ciudad: (a: Record<string, unknown>) =>
          a.p_campania_ciudad_id === MVD
            ? [{ ...zonaRadial, colportores: [{ usuario_id: SERGIO, nombre: "", apellido: "", suspendido: true }] }]
            : [],
      });

      const datos = await crearFuenteZonasRpc(cliente).obtenerZonas();

      expect(datos?.ciudades[0].zonas[0].colportores).toEqual([{ id: SERGIO, nombre: "sergio@example.com", suspendido: true }]);
    });

    it("si ni así tiene nombre, dice «Cuenta sin nombre» en vez de dejar la fila vacía", async () => {
      const { cliente } = lecturas({
        colportores_de_campania: [],
        zonas_de_ciudad: (a: Record<string, unknown>) =>
          a.p_campania_ciudad_id === MVD
            ? [{ ...zonaRadial, colportores: [{ usuario_id: SERGIO, nombre: " ", apellido: "", suspendido: false }] }]
            : [],
      });

      const datos = await crearFuenteZonasRpc(cliente).obtenerZonas();

      expect(datos?.ciudades[0].zonas[0].colportores).toEqual([{ id: SERGIO, nombre: "Cuenta sin nombre" }]);
    });

    it.each(["campanias_del_coordinador", "ciudades_de_campania", "colportores_de_campania", "zonas_de_ciudad"])(
      "si falla %s por la red NO se toma por una lista vacía: sale como excepción",
      async (rpc) => {
        const caida = new TypeError("fetch failed");
        const { cliente } = lecturas({ [rpc]: caida });

        await expect(crearFuenteZonasRpc(cliente).obtenerZonas()).rejects.toBe(caida);
      },
    );

    it.each([
      ["Supabase caído (500)", new ErrorSupabase("boom", 500)],
      ["límite de tráfico (429)", new ErrorSupabase("Too Many Requests", 429)],
      ["tiempo agotado (408)", new ErrorSupabase("Request Timeout", 408)],
      ["sesión vencida", new ErrorSupabase("JWT expired", 401, "PGRST301")],
      ["sin permiso (42501)", rechazo("42501", "Solo el coordinador de la campaña puede ver sus ciudades y zonas.", 403)],
      ["otro rechazo", rechazo("CZ012", "La ciudad no está en esta campaña.")],
    ])("%s no se toma por una lista vacía: sale como excepción", async (_caso, error) => {
      const { cliente } = lecturas({ ciudades_de_campania: error });

      await expect(crearFuenteZonasRpc(cliente).obtenerZonas()).rejects.toBe(error);
    });

    it.each([
      ["CZ011", "La campaña ya terminó y su mapa queda como estaba."],
      ["CZ001", "La campaña no existe. Elegí otra campaña."],
    ])("%s (la campaña terminó o se dio de baja entre una llamada y otra) es «sin campaña», no una caída", async (codigo, mensaje) => {
      const { cliente } = lecturas({ zonas_de_ciudad: rechazo(codigo, mensaje) });

      expect(await crearFuenteZonasRpc(cliente).obtenerZonas()).toBeNull();
    });

    it.each([
      ["una lista que no es una lista", { campanias_del_coordinador: { id: CAMPANIA } }],
      ["una ciudad sin nombre", { ciudades_de_campania: [{ ...ciudades[0], nombre: null }] }],
      ["un centro de ciudad que no es un número", { ciudades_de_campania: [{ ...ciudades[0], lat_centro: "-34.87" }] }],
      ["una forma desconocida", { zonas_de_ciudad: [{ ...zonaRadial, tipo_forma: "HEXAGONO" }] }],
      ["una zona radial sin centro", { zonas_de_ciudad: [{ ...zonaRadial, centro_lat: null }] }],
      ["una zona por esquinas sin esquinas", { zonas_de_ciudad: [{ ...zonaEsquinas, esquinas: null }] }],
      ["un polígono que no es un polígono", { zonas_de_ciudad: [{ ...zonaRadial, poligono_geojson: { type: "Point" } }] }],
      ["un polígono con una posición rota", { zonas_de_ciudad: [{ ...zonaRadial, poligono_geojson: { type: "Polygon", coordinates: [[[1, "x"]]] } }] }],
      ["sin la cantidad de ubicaciones", { zonas_de_ciudad: [{ ...zonaRadial, ubicaciones_registradas: null }] }],
      ["colportores de zona que no son una lista", { zonas_de_ciudad: [{ ...zonaRadial, colportores: "nadie" }] }],
      ["un inscripto sin email", { colportores_de_campania: [{ ...inscriptos[0], email: null }] }],
    ])("%s es una respuesta inesperada, no datos a medias", async (_caso, cambios) => {
      const { cliente } = lecturas(cambios);

      await expect(crearFuenteZonasRpc(cliente).obtenerZonas()).rejects.toBeInstanceOf(RespuestaInesperada);
    });
  });

  describe("esquinaMasCercana y tramoPorCalles (backend-supabase#25)", () => {
    it("todavía no están conectadas: avisan que falta el backend, sin inventar calles ni llamar a la base", async () => {
      const { cliente, llamarRpc } = clienteCon({});
      const fuente = crearFuenteZonasRpc(cliente);

      await expect(fuente.esquinaMasCercana(MVD, { lon: -56.2, lat: -34.9 })).rejects.toBeInstanceOf(FuncionSinConectar);
      await expect(fuente.tramoPorCalles(MVD, { lon: -56.2, lat: -34.9 }, { lon: -56.3, lat: -34.8 })).rejects.toThrow(/backend-supabase#25/);
      expect(llamarRpc).not.toHaveBeenCalled();
    });
  });

  describe("vistaPreviaZona", () => {
    const radial: FormaZona = { tipoForma: "RADIAL", centro: { lon: -56.24, lat: -34.85 }, radioM: 400 };
    const respuestaPrevia = { guardada: false, zona: null, vertices: null, poligono_geojson: CIRCULO, ubicaciones_incluidas: 27 };

    it("llama a guardar_zona con p_vista_previa y devuelve el polígono y «Incluye N ubicaciones»", async () => {
      const { cliente, llamarRpc } = clienteCon({ guardar_zona: respuestaPrevia });

      const previa = await crearFuenteZonasRpc(cliente).vistaPreviaZona({ ciudadId: MVD, forma: radial });

      expect(previa).toEqual({ poligonoGeojson: CIRCULO, ubicacionesIncluidas: 27, superposicion: null, comparteCalle: null });
      expect(llamarRpc).toHaveBeenCalledWith("guardar_zona", {
        p_campania_ciudad_id: MVD,
        p_nombre: expect.stringMatching(/^[0-9a-f-]{36}$/),
        p_tipo_forma: "RADIAL",
        p_centro_lat: -34.85,
        p_centro_lon: -56.24,
        p_radio_m: 400,
        p_zona_id: null,
        p_vista_previa: true,
      });
    });

    it("el nombre que exige la base va distinto cada vez y no se parece al de ninguna zona", async () => {
      const { cliente, llamarRpc } = clienteCon({ guardar_zona: respuestaPrevia });
      const fuente = crearFuenteZonasRpc(cliente);

      await fuente.vistaPreviaZona({ ciudadId: MVD, forma: radial });
      await fuente.vistaPreviaZona({ ciudadId: MVD, forma: radial });

      const [primero, segundo] = llamarRpc.mock.calls.map(([, a]) => a.p_nombre as string);
      expect(primero).not.toBe(segundo);
      expect(primero.length).toBeLessThanOrEqual(40);
    });

    it("al editar manda la zona (no cuenta como repetida consigo misma) y redondea el radio a un entero", async () => {
      const { cliente, llamarRpc } = clienteCon({ guardar_zona: respuestaPrevia });

      await crearFuenteZonasRpc(cliente).vistaPreviaZona({ ciudadId: MVD, zonaId: ZONA_RADIAL, forma: { ...radial, radioM: 400.6 } });

      expect(llamarRpc).toHaveBeenCalledWith("guardar_zona", expect.objectContaining({ p_zona_id: ZONA_RADIAL, p_radio_m: 401 }));
    });

    it("nunca inventa una superposición ni una calle compartida: ninguna RPC las calcula", async () => {
      const { cliente } = clienteCon({ guardar_zona: { ...respuestaPrevia, superposiciones: [{ zona: "X" }] } });

      const previa = await crearFuenteZonasRpc(cliente).vistaPreviaZona({ ciudadId: MVD, forma: radial });

      expect(previa).toMatchObject({ superposicion: null, comparteCalle: null });
    });

    it.each([
      ["CZ011", "La campaña ya terminó y su mapa queda como estaba. Dibujá las zonas en una campaña activa o futura.", 400],
      ["CZ012", "La ciudad no está en esta campaña. Agregala con «+ Agregar ciudad» y volvé a intentar.", 400],
      ["CZ001", "La campaña no existe. Elegí otra campaña.", 400],
      ["CZ004", "La zona no existe o ya se dio de baja. Recargá el mapa.", 400],
      ["CZ008", "El radio de la zona es de 4000 m y el máximo es 3000 m. Achicalo, o dividí el área en varias zonas.", 400],
    ] as const)("%s se devuelve como rechazo con el texto de la base (no como «sin conexión»)", async (codigo, mensaje, estado) => {
      const { cliente } = clienteCon({ guardar_zona: rechazo(codigo, mensaje, estado) });

      expect(await crearFuenteZonasRpc(cliente).vistaPreviaZona({ ciudadId: MVD, forma: radial })).toEqual({ rechazo: mensaje });
    });

    it("42501 dice quién puede cambiar el mapa; un código desconocido, un texto genérico que guía", async () => {
      const permiso = clienteCon({ guardar_zona: rechazo("42501", "permission denied for function guardar_zona", 403) });
      const raro = clienteCon({ guardar_zona: rechazo("22P02", "invalid input syntax for type uuid") });

      expect(await crearFuenteZonasRpc(permiso.cliente).vistaPreviaZona({ ciudadId: MVD, forma: radial })).toEqual({
        rechazo: "Solo el coordinador de la campaña o un administrador puede cambiar su mapa.",
      });
      expect(await crearFuenteZonasRpc(raro.cliente).vistaPreviaZona({ ciudadId: MVD, forma: radial })).toEqual({
        rechazo: "No se pudieron calcular las ubicaciones de la zona. Probá de nuevo más tarde.",
      });
    });

    it("una falla de conexión, de servicio o de sesión sigue como excepción", async () => {
      for (const error of [new TypeError("fetch failed"), new ErrorSupabase("boom", 503), new ErrorSupabase("JWT expired", 401, "PGRST301")]) {
        const { cliente } = clienteCon({ guardar_zona: error });
        await expect(crearFuenteZonasRpc(cliente).vistaPreviaZona({ ciudadId: MVD, forma: radial })).rejects.toBe(error);
      }
    });

    it("por esquinas todavía no se puede (falta el borde por calles): avisa y no llama a la base", async () => {
      const { cliente, llamarRpc } = clienteCon({});
      const esquinas: FormaZona = { tipoForma: "ESQUINAS", esquinas: [], cerrada: true };

      await expect(crearFuenteZonasRpc(cliente).vistaPreviaZona({ ciudadId: MVD, forma: esquinas })).rejects.toBeInstanceOf(FuncionSinConectar);
      expect(llamarRpc).not.toHaveBeenCalled();
    });

    it("un id que no es un UUID se rechaza sin llamar a la base", async () => {
      const { cliente, llamarRpc } = clienteCon({});
      const fuente = crearFuenteZonasRpc(cliente);

      expect(await fuente.vistaPreviaZona({ ciudadId: "montevideo", forma: radial })).toMatchObject({ rechazo: expect.stringContaining("La ciudad no está en esta campaña") });
      expect(await fuente.vistaPreviaZona({ ciudadId: MVD, zonaId: "x", forma: radial })).toMatchObject({ rechazo: expect.stringContaining("La zona no existe") });
      expect(llamarRpc).not.toHaveBeenCalled();
    });

    it("si la base contesta que guardó la zona en una vista previa, es una respuesta inesperada", async () => {
      const { cliente } = clienteCon({ guardar_zona: { ...respuestaPrevia, guardada: true } });

      await expect(crearFuenteZonasRpc(cliente).vistaPreviaZona({ ciudadId: MVD, forma: radial })).rejects.toBeInstanceOf(RespuestaInesperada);
    });
  });

  describe("guardarZona", () => {
    const radial: FormaZona = { tipoForma: "RADIAL", centro: { lon: -56.24, lat: -34.85 }, radioM: 400 };
    const guardada = {
      guardada: true,
      zona: {
        id: ZONA_RADIAL,
        nombre: "Casabó",
        campania_ciudad_id: MVD,
        tipo_forma: "RADIAL",
        centro_lat: -34.85,
        centro_lon: -56.24,
        radio_m: 400,
        poligono_geojson: CIRCULO,
        color: "#13407A",
        sync_version: 3,
      },
      vertices: [],
      poligono_geojson: CIRCULO,
      ubicaciones_incluidas: 27,
    };

    it("crea la zona con su nombre, forma y color, y devuelve la que quedó guardada", async () => {
      const { cliente, llamarRpc } = clienteCon({ guardar_zona: guardada });

      const resultado = await crearFuenteZonasRpc(cliente).guardarZona({ ciudadId: MVD, nombre: "Casabó", forma: radial, color: "#13407A" });

      expect(resultado).toEqual({
        ok: true,
        zona: {
          id: ZONA_RADIAL,
          nombre: "Casabó",
          tipoForma: "RADIAL",
          color: "#13407A",
          centro: { lon: -56.24, lat: -34.85 },
          radioM: 400,
          poligonoGeojson: CIRCULO,
          colportores: [],
          ubicacionesRegistradas: 27,
        },
      });
      expect(llamarRpc).toHaveBeenCalledWith("guardar_zona", {
        p_campania_ciudad_id: MVD,
        p_nombre: "Casabó",
        p_tipo_forma: "RADIAL",
        p_color: "#13407A",
        p_centro_lat: -34.85,
        p_centro_lon: -56.24,
        p_radio_m: 400,
        p_zona_id: null,
      });
    });

    it("al editar manda la zona y su color: guardar no se lo pisa", async () => {
      const { cliente, llamarRpc } = clienteCon({ guardar_zona: guardada });

      await crearFuenteZonasRpc(cliente).guardarZona({ ciudadId: MVD, zonaId: ZONA_RADIAL, nombre: "Casabó", forma: radial, color: "#1F6E3A" });

      expect(llamarRpc).toHaveBeenCalledWith("guardar_zona", expect.objectContaining({ p_zona_id: ZONA_RADIAL, p_color: "#1F6E3A" }));
    });

    it("sin un color válido no manda ninguno: la base lo permite y no se inventa uno", async () => {
      const { cliente, llamarRpc } = clienteCon({ guardar_zona: guardada });
      const fuente = crearFuenteZonasRpc(cliente);

      await fuente.guardarZona({ ciudadId: MVD, nombre: "Casabó", forma: radial });
      await fuente.guardarZona({ ciudadId: MVD, nombre: "Casabó", forma: radial, color: "azul" });

      for (const [, argumentos] of llamarRpc.mock.calls) expect(argumentos).not.toHaveProperty("p_color");
    });

    it("el radio va entero (la base pide un integer) y el nombre tal cual lo escribió: lo recorta y lo valida la base", async () => {
      const { cliente, llamarRpc } = clienteCon({ guardar_zona: guardada });

      await crearFuenteZonasRpc(cliente).guardarZona({ ciudadId: MVD, nombre: "  Casabó ", forma: { ...radial, radioM: 399.5 } });

      expect(llamarRpc).toHaveBeenCalledWith("guardar_zona", expect.objectContaining({ p_nombre: "  Casabó ", p_radio_m: 400 }));
    });

    it("una zona guardada sin color por la base vuelve con el color de «sin color»", async () => {
      const { cliente } = clienteCon({ guardar_zona: { ...guardada, zona: { ...guardada.zona, color: null } } });

      const resultado = await crearFuenteZonasRpc(cliente).guardarZona({ ciudadId: MVD, nombre: "Casabó", forma: radial });

      expect(resultado).toMatchObject({ ok: true, zona: { color: COLOR_ZONA_SIN_COLOR, sinColor: true } });
    });

    it.each([
      ["CZ001", "La campaña no existe. Elegí otra campaña."],
      ["CZ004", "La zona no existe o ya se dio de baja. Recargá el mapa."],
      ["CZ008", "Una zona radial necesita centro y un radio mayor a 0. Marcá el centro en el mapa y elegí el radio."],
      ["CZ009", "Ya hay una zona «Casabó» en esta ciudad de la campaña. Elegí otro nombre."],
      ["CZ009", "El nombre de la zona puede tener hasta 40 caracteres y el que escribiste tiene 41. Acortalo."],
      ["CZ009", "La zona necesita un nombre. Escribí uno."],
      ["CZ011", "La campaña ya terminó y su mapa queda como estaba. Dibujá las zonas en una campaña activa o futura."],
      ["CZ012", "La ciudad no está en esta campaña. Agregala con «+ Agregar ciudad» y volvé a intentar."],
    ])("%s vuelve como aviso con el texto de la base: «%s»", async (codigo, mensaje) => {
      const { cliente } = clienteCon({ guardar_zona: rechazo(codigo, mensaje) });

      expect(await crearFuenteZonasRpc(cliente).guardarZona({ ciudadId: MVD, nombre: "Casabó", forma: radial })).toEqual({ ok: false, mensaje });
    });

    it("sin permiso (42501) dice quién puede cambiar el mapa, aunque la base conteste en inglés", async () => {
      const { cliente } = clienteCon({ guardar_zona: rechazo("42501", "permission denied for function guardar_zona", 403) });

      expect(await crearFuenteZonasRpc(cliente).guardarZona({ ciudadId: MVD, nombre: "Casabó", forma: radial })).toEqual({
        ok: false,
        mensaje: "Solo el coordinador de la campaña o un administrador puede cambiar su mapa.",
      });
    });

    it("un código desconocido o un código conocido sin mensaje dan el texto genérico que guía", async () => {
      const desconocido = clienteCon({ guardar_zona: rechazo("PGRST202", "Could not find the function public.guardar_zona", 404) });
      const sinMensaje = clienteCon({ guardar_zona: rechazo("CZ011", "") });
      const esperado = { ok: false, mensaje: "No se pudo guardar la zona. Probá de nuevo más tarde." };

      expect(await crearFuenteZonasRpc(desconocido.cliente).guardarZona({ ciudadId: MVD, nombre: "x", forma: radial })).toEqual(esperado);
      expect(await crearFuenteZonasRpc(sinMensaje.cliente).guardarZona({ ciudadId: MVD, nombre: "x", forma: radial })).toEqual(esperado);
    });

    it("una falla de conexión, de servicio o de sesión NO es un rechazo: sale como excepción y se puede reintentar", async () => {
      for (const error of [new TypeError("fetch failed"), new ErrorSupabase("boom", 502), new ErrorSupabase("slow down", 429), new ErrorSupabase("JWT expired", 401, "PGRST301")]) {
        const { cliente } = clienteCon({ guardar_zona: error });
        await expect(crearFuenteZonasRpc(cliente).guardarZona({ ciudadId: MVD, nombre: "x", forma: radial })).rejects.toBe(error);
      }
    });

    it("por esquinas todavía no se puede guardar (falta el borde por calles): avisa y no llama a la base", async () => {
      const { cliente, llamarRpc } = clienteCon({});
      const esquinas: FormaZona = { tipoForma: "ESQUINAS", esquinas: [], cerrada: true };

      await expect(crearFuenteZonasRpc(cliente).guardarZona({ ciudadId: MVD, nombre: "x", forma: esquinas })).rejects.toThrow(/backend-supabase#25/);
      expect(llamarRpc).not.toHaveBeenCalled();
    });

    it("un id que no es un UUID se rechaza sin llamar a la base", async () => {
      const { cliente, llamarRpc } = clienteCon({});
      const fuente = crearFuenteZonasRpc(cliente);

      expect(await fuente.guardarZona({ ciudadId: "x", nombre: "x", forma: radial })).toMatchObject({ ok: false });
      expect(await fuente.guardarZona({ ciudadId: MVD, zonaId: "x", nombre: "x", forma: radial })).toMatchObject({ ok: false });
      expect(llamarRpc).not.toHaveBeenCalled();
    });

    it("si la base no confirma que guardó la zona, es una respuesta inesperada y no una zona fantasma", async () => {
      const { cliente } = clienteCon({ guardar_zona: { ...guardada, guardada: false } });

      await expect(crearFuenteZonasRpc(cliente).guardarZona({ ciudadId: MVD, nombre: "x", forma: radial })).rejects.toBeInstanceOf(RespuestaInesperada);
    });
  });

  describe("asignarZona y quitarZona", () => {
    const fila = { id: "i-1", campania_id: CAMPANIA, usuario_id: ANA, zona_id: ZONA_RADIAL };

    it("asigna con asignar_zona y los ids que pidió la vista", async () => {
      const { cliente, llamarRpc } = clienteCon({ asignar_zona: fila });

      expect(await crearFuenteZonasRpc(cliente).asignarZona(CAMPANIA, ANA, ZONA_RADIAL)).toEqual({ ok: true });
      expect(llamarRpc).toHaveBeenCalledWith("asignar_zona", { p_campania_id: CAMPANIA, p_usuario_id: ANA, p_zona_id: ZONA_RADIAL });
    });

    it("quita con quitar_zona (deja al colportor sin zona)", async () => {
      const { cliente, llamarRpc } = clienteCon({ quitar_zona: { ...fila, zona_id: null } });

      expect(await crearFuenteZonasRpc(cliente).quitarZona(CAMPANIA, ANA)).toEqual({ ok: true });
      expect(llamarRpc).toHaveBeenCalledWith("quitar_zona", { p_campania_id: CAMPANIA, p_usuario_id: ANA });
    });

    it.each([
      ["CZ001", "La campaña no existe."],
      ["CZ002", "La campaña no está activa."],
      ["CZ003", "El colportor no está en esta campaña."],
      ["CZ004", "La zona no existe o ya se dio de baja. Recargá el mapa."],
      ["CZ005", "La ciudad de esa zona ya no está en «Verano 2026». Elegí una zona de otra ciudad de la campaña o volvé a agregar la ciudad."],
      ["CZ006", "La zona es de otra campaña. Elegí una zona de «Verano 2026»."],
      ["CZ014", "Cuenta suspendida. Pedile a un administrador que la reactive."],
    ])("asignar: %s vuelve como aviso con el texto de la base", async (codigo, mensaje) => {
      const { cliente } = clienteCon({ asignar_zona: rechazo(codigo, mensaje) });

      expect(await crearFuenteZonasRpc(cliente).asignarZona(CAMPANIA, ANA, ZONA_RADIAL)).toEqual({ ok: false, mensaje });
    });

    it.each([
      ["CZ001", "La campaña no existe."],
      ["CZ002", "La campaña no está activa."],
      ["CZ003", "El colportor no está en esta campaña."],
    ])("quitar: %s vuelve como aviso con el texto de la base", async (codigo, mensaje) => {
      const { cliente } = clienteCon({ quitar_zona: rechazo(codigo, mensaje) });

      expect(await crearFuenteZonasRpc(cliente).quitarZona(CAMPANIA, ANA)).toEqual({ ok: false, mensaje });
    });

    it("sin permiso (42501) dice quién puede asignar zonas; un código desconocido, un texto genérico", async () => {
      const permiso = clienteCon({ asignar_zona: rechazo("42501", "permission denied", 403), quitar_zona: rechazo("42501", "permission denied", 403) });
      const raro = clienteCon({ asignar_zona: rechazo("23503", "foreign key"), quitar_zona: rechazo("23503", "foreign key") });

      expect(await crearFuenteZonasRpc(permiso.cliente).asignarZona(CAMPANIA, ANA, ZONA_RADIAL)).toEqual({
        ok: false,
        mensaje: "Solo el coordinador de la campaña puede asignar zonas en ella.",
      });
      expect(await crearFuenteZonasRpc(permiso.cliente).quitarZona(CAMPANIA, ANA)).toMatchObject({ mensaje: "Solo el coordinador de la campaña puede asignar zonas en ella." });
      expect(await crearFuenteZonasRpc(raro.cliente).asignarZona(CAMPANIA, ANA, ZONA_RADIAL)).toEqual({
        ok: false,
        mensaje: "No se pudo asignar la zona. Probá de nuevo más tarde.",
      });
      expect(await crearFuenteZonasRpc(raro.cliente).quitarZona(CAMPANIA, ANA)).toEqual({
        ok: false,
        mensaje: "No se pudo quitar la zona. Probá de nuevo más tarde.",
      });
    });

    it("la red caída, el servicio caído y la sesión vencida no son rechazos: salen como excepción", async () => {
      for (const error of [new TypeError("fetch failed"), new ErrorSupabase("boom", 500), new ErrorSupabase("JWT expired", 401, "PGRST301")]) {
        const { cliente } = clienteCon({ asignar_zona: error, quitar_zona: error });
        await expect(crearFuenteZonasRpc(cliente).asignarZona(CAMPANIA, ANA, ZONA_RADIAL)).rejects.toBe(error);
        await expect(crearFuenteZonasRpc(cliente).quitarZona(CAMPANIA, ANA)).rejects.toBe(error);
      }
    });

    it("un id que no es un UUID se rechaza sin llamar a la base", async () => {
      const { cliente, llamarRpc } = clienteCon({});
      const fuente = crearFuenteZonasRpc(cliente);

      expect(await fuente.asignarZona(CAMPANIA, "ana", ZONA_RADIAL)).toMatchObject({ ok: false });
      expect(await fuente.asignarZona(CAMPANIA, ANA, "zona")).toMatchObject({ ok: false });
      expect(await fuente.quitarZona(CAMPANIA, "ana")).toMatchObject({ ok: false });
      expect(llamarRpc).not.toHaveBeenCalled();
    });
  });

  describe("eliminarZona", () => {
    const baja = { dada_de_baja: true, zona: { id: ZONA_RADIAL }, colportores_asignados: [{ usuario_id: DIEGO }], colportores_sin_zona: 1, ubicaciones_incluidas: 64 };

    it("da de baja con baja_zona y cuenta a los colportores que quedaron sin zona", async () => {
      const { cliente, llamarRpc } = clienteCon({ baja_zona: baja });

      expect(await crearFuenteZonasRpc(cliente).eliminarZona(CAMPANIA, ZONA_RADIAL)).toEqual({ ok: true, colportoresSinZona: 1 });
      expect(llamarRpc).toHaveBeenCalledWith("baja_zona", { p_zona_id: ZONA_RADIAL });
    });

    it.each([
      ["CZ001", "La campaña no existe. Elegí otra campaña."],
      ["CZ004", "La zona no existe o ya se dio de baja. Recargá el mapa."],
      ["CZ011", "La campaña ya terminó y su mapa queda como estaba. Dibujá las zonas en una campaña activa o futura."],
    ])("%s vuelve como aviso con el texto de la base", async (codigo, mensaje) => {
      const { cliente } = clienteCon({ baja_zona: rechazo(codigo, mensaje) });

      expect(await crearFuenteZonasRpc(cliente).eliminarZona(CAMPANIA, ZONA_RADIAL)).toEqual({ ok: false, mensaje });
    });

    it("sin permiso (42501) y un código desconocido dan textos que guían", async () => {
      const permiso = clienteCon({ baja_zona: rechazo("42501", "permission denied", 403) });
      const raro = clienteCon({ baja_zona: rechazo("XX000", "boom") });

      expect(await crearFuenteZonasRpc(permiso.cliente).eliminarZona(CAMPANIA, ZONA_RADIAL)).toEqual({
        ok: false,
        mensaje: "Solo el coordinador de la campaña o un administrador puede cambiar su mapa.",
      });
      expect(await crearFuenteZonasRpc(raro.cliente).eliminarZona(CAMPANIA, ZONA_RADIAL)).toEqual({
        ok: false,
        mensaje: "No se pudo eliminar la zona. Probá de nuevo más tarde.",
      });
    });

    it("la red caída y la sesión vencida salen como excepción", async () => {
      for (const error of [new TypeError("fetch failed"), new ErrorSupabase("JWT expired", 401, "PGRST301")]) {
        const { cliente } = clienteCon({ baja_zona: error });
        await expect(crearFuenteZonasRpc(cliente).eliminarZona(CAMPANIA, ZONA_RADIAL)).rejects.toBe(error);
      }
    });

    it("si la base no confirma la baja o no cuenta a los colportores, es una respuesta inesperada", async () => {
      for (const respuesta of [{ ...baja, dada_de_baja: false }, { ...baja, colportores_sin_zona: null }, null]) {
        const { cliente } = clienteCon({ baja_zona: respuesta });
        await expect(crearFuenteZonasRpc(cliente).eliminarZona(CAMPANIA, ZONA_RADIAL)).rejects.toBeInstanceOf(RespuestaInesperada);
      }
    });

    it("un id que no es un UUID se rechaza sin llamar a la base", async () => {
      const { cliente, llamarRpc } = clienteCon({});

      expect(await crearFuenteZonasRpc(cliente).eliminarZona(CAMPANIA, "zona")).toMatchObject({ ok: false });
      expect(llamarRpc).not.toHaveBeenCalled();
    });
  });

  describe("buscarCiudades", () => {
    const catalogo = [
      { ciudad_id: LAS_PIEDRAS_CATALOGO, nombre: "Las Piedras" },
      { ciudad_id: MVD_CATALOGO, nombre: "Montevideo" },
    ];

    it("busca en el catálogo de la campaña por el texto (sin provincia: la base no la tiene)", async () => {
      const { cliente, llamarRpc } = clienteCon({ ciudades_del_catalogo: catalogo });

      const encontradas = await crearFuenteZonasRpc(cliente).buscarCiudades(CAMPANIA, "  pie ");

      expect(encontradas).toEqual([
        { id: LAS_PIEDRAS_CATALOGO, nombre: "Las Piedras" },
        { id: MVD_CATALOGO, nombre: "Montevideo" },
      ]);
      expect(llamarRpc).toHaveBeenCalledWith("ciudades_del_catalogo", { p_campania_id: CAMPANIA, p_texto: "pie" });
    });

    it("sin texto pide todo el catálogo (p_texto nulo) y corta lo que se escribe a 100 caracteres", async () => {
      const { cliente, llamarRpc } = clienteCon({ ciudades_del_catalogo: [] });
      const fuente = crearFuenteZonasRpc(cliente);

      expect(await fuente.buscarCiudades(CAMPANIA, "   ")).toEqual([]);
      await fuente.buscarCiudades(CAMPANIA, "a".repeat(300));

      expect(llamarRpc.mock.calls[0][1]).toEqual({ p_campania_id: CAMPANIA, p_texto: null });
      expect(llamarRpc.mock.calls[1][1]).toEqual({ p_campania_id: CAMPANIA, p_texto: "a".repeat(100) });
    });

    it("una falla NO se toma por «no hay ciudades»: sale como excepción, sea de red o un rechazo", async () => {
      for (const error of [new TypeError("fetch failed"), new ErrorSupabase("boom", 500), rechazo("CZ011", "La campaña ya terminó."), rechazo("42501", "no", 403)]) {
        const { cliente } = clienteCon({ ciudades_del_catalogo: error });
        await expect(crearFuenteZonasRpc(cliente).buscarCiudades(CAMPANIA, "mon")).rejects.toBe(error);
      }
    });

    it("una respuesta con otra forma es inesperada", async () => {
      const { cliente } = clienteCon({ ciudades_del_catalogo: [{ ciudad_id: MVD_CATALOGO }] });

      await expect(crearFuenteZonasRpc(cliente).buscarCiudades(CAMPANIA, "")).rejects.toBeInstanceOf(RespuestaInesperada);
    });
  });

  describe("agregarCiudad", () => {
    const filaAgregada = { id: LAS_PIEDRAS, campania_id: CAMPANIA, ciudad_id: LAS_PIEDRAS_CATALOGO, deleted_at: null };

    it("agrega con agregar_ciudad_a_campania y devuelve la ciudad armada con sus zonas y colportores", async () => {
      const { cliente, llamarRpc } = lecturas({
        agregar_ciudad_a_campania: filaAgregada,
        zonas_de_ciudad: (a: Record<string, unknown>) => (a.p_campania_ciudad_id === LAS_PIEDRAS ? [zonaRadial] : []),
      });

      const resultado = await crearFuenteZonasRpc(cliente).agregarCiudad(CAMPANIA, LAS_PIEDRAS_CATALOGO);

      expect(resultado).toMatchObject({
        ok: true,
        ciudad: {
          id: LAS_PIEDRAS,
          catalogoId: LAS_PIEDRAS_CATALOGO,
          nombre: "Las Piedras",
          zoom: 14,
          zonas: [expect.objectContaining({ id: ZONA_RADIAL })],
          colportores: [expect.objectContaining({ id: DIEGO }), expect.objectContaining({ id: ANA }), expect.objectContaining({ id: SERGIO })],
        },
      });
      expect(llamarRpc).toHaveBeenCalledWith("agregar_ciudad_a_campania", { p_campania_id: CAMPANIA, p_ciudad_id: LAS_PIEDRAS_CATALOGO });
      // Solo lee las zonas de la ciudad nueva, no las de toda la campaña.
      expect(llamarRpc.mock.calls.filter(([nombre]) => nombre === "zonas_de_ciudad")).toEqual([
        ["zonas_de_ciudad", { p_campania_id: CAMPANIA, p_campania_ciudad_id: LAS_PIEDRAS }],
      ]);
    });

    it.each([
      ["CZ001", "La campaña no existe. Elegí otra campaña."],
      ["CZ011", "La campaña ya terminó y su mapa queda como estaba. Dibujá las zonas en una campaña activa o futura."],
      ["CZ013", "La ciudad no está en el catálogo. Pedile a un administrador que la cargue."],
    ])("%s vuelve como aviso con el texto de la base", async (codigo, mensaje) => {
      const { cliente } = lecturas({ agregar_ciudad_a_campania: rechazo(codigo, mensaje) });

      expect(await crearFuenteZonasRpc(cliente).agregarCiudad(CAMPANIA, LAS_PIEDRAS_CATALOGO)).toEqual({ ok: false, mensaje });
    });

    it("sin permiso (42501) y un código desconocido dan textos que guían", async () => {
      const permiso = lecturas({ agregar_ciudad_a_campania: rechazo("42501", "permission denied", 403) });
      const raro = lecturas({ agregar_ciudad_a_campania: rechazo("23505", "duplicate key") });

      expect(await crearFuenteZonasRpc(permiso.cliente).agregarCiudad(CAMPANIA, LAS_PIEDRAS_CATALOGO)).toEqual({
        ok: false,
        mensaje: "Solo el coordinador de la campaña o un administrador puede cambiar su mapa.",
      });
      expect(await crearFuenteZonasRpc(raro.cliente).agregarCiudad(CAMPANIA, LAS_PIEDRAS_CATALOGO)).toEqual({
        ok: false,
        mensaje: "No se pudo agregar la ciudad. Probá de nuevo más tarde.",
      });
    });

    it("si la ciudad se agregó pero la lectura posterior falla por la red, sale como excepción: tocar «Agregar» de nuevo es seguro", async () => {
      const caida = new TypeError("fetch failed");
      const primera = lecturas({ agregar_ciudad_a_campania: filaAgregada, ciudades_de_campania: caida });
      await expect(crearFuenteZonasRpc(primera.cliente).agregarCiudad(CAMPANIA, LAS_PIEDRAS_CATALOGO)).rejects.toBe(caida);

      // Agregar es idempotente en la base: devuelve la misma fila.
      const segunda = lecturas({ agregar_ciudad_a_campania: filaAgregada });
      expect(await crearFuenteZonasRpc(segunda.cliente).agregarCiudad(CAMPANIA, LAS_PIEDRAS_CATALOGO)).toMatchObject({ ok: true });
    });

    it("la red caída al agregar sale como excepción", async () => {
      const caida = new TypeError("fetch failed");
      const { cliente } = lecturas({ agregar_ciudad_a_campania: caida });

      await expect(crearFuenteZonasRpc(cliente).agregarCiudad(CAMPANIA, LAS_PIEDRAS_CATALOGO)).rejects.toBe(caida);
    });

    it("si la ciudad recién agregada no figura en la campaña, es una respuesta inesperada", async () => {
      const { cliente } = lecturas({ agregar_ciudad_a_campania: { ...filaAgregada, id: "99999999-9999-4999-8999-999999999999" } });

      await expect(crearFuenteZonasRpc(cliente).agregarCiudad(CAMPANIA, LAS_PIEDRAS_CATALOGO)).rejects.toBeInstanceOf(RespuestaInesperada);
    });

    it("un id del catálogo que no es un UUID se rechaza sin llamar a la base", async () => {
      const { cliente, llamarRpc } = clienteCon({});

      expect(await crearFuenteZonasRpc(cliente).agregarCiudad(CAMPANIA, "cat-salto")).toMatchObject({ ok: false });
      expect(llamarRpc).not.toHaveBeenCalled();
    });
  });

  describe("con el cliente de verdad (supabase-js sobre un PostgREST falso)", () => {
    it("un rechazo CZ011 de PostgREST (400) se traduce con el texto de la base, y viaja por POST con el JWT del coordinador", async () => {
      const mensaje = "La campaña ya terminó y su mapa queda como estaba. Dibujá las zonas en una campaña activa o futura.";
      const { supabase, llamadas } = crearSupabasePrueba((l) =>
        l.ruta === "/auth/v1/token" ? respuestaDeSesion({ token: "token-del-coordinador" }) : json({ code: "CZ011", message: mensaje, details: null, hint: null }, 400),
      );
      await supabase.auth.signInWithPassword({ email: "coordinador@example.com", password: "clave" });

      const resultado = await crearFuenteZonasRpc(crearClienteRpc(supabase)).guardarZona({
        ciudadId: MVD,
        nombre: "Casabó",
        forma: { tipoForma: "RADIAL", centro: { lon: -56.24, lat: -34.85 }, radioM: 400 },
      });

      expect(resultado).toEqual({ ok: false, mensaje });
      expect(llamadas.find((l) => l.ruta === "/rest/v1/rpc/guardar_zona")).toMatchObject({
        metodo: "POST",
        token: "token-del-coordinador",
        cuerpo: { p_campania_ciudad_id: MVD, p_nombre: "Casabó", p_tipo_forma: "RADIAL", p_radio_m: 400 },
      });
    });

    it("un 403 de permiso se traduce; la sesión vencida (401 PGRST301) y la caída de red siguen como excepción", async () => {
      const permiso = crearSupabasePrueba(() => json({ code: "42501", message: "permission denied for function asignar_zona", details: null, hint: null }, 403));
      const vencida = crearSupabasePrueba(() => json({ code: "PGRST301", message: "JWT expired", details: null, hint: null }, 401));
      const sinRed = crearSupabasePrueba(() => {
        throw new TypeError("fetch failed");
      });

      expect(await crearFuenteZonasRpc(crearClienteRpc(permiso.supabase)).asignarZona(CAMPANIA, ANA, ZONA_RADIAL)).toEqual({
        ok: false,
        mensaje: "Solo el coordinador de la campaña puede asignar zonas en ella.",
      });
      await expect(crearFuenteZonasRpc(crearClienteRpc(vencida.supabase)).asignarZona(CAMPANIA, ANA, ZONA_RADIAL)).rejects.toBeInstanceOf(ErrorSupabase);
      await expect(crearFuenteZonasRpc(crearClienteRpc(sinRed.supabase)).asignarZona(CAMPANIA, ANA, ZONA_RADIAL)).rejects.toBeTruthy();
      await expect(crearFuenteZonasRpc(crearClienteRpc(sinRed.supabase)).obtenerZonas()).rejects.toBeTruthy();
    });

    it("una lectura con 5xx no se toma por una campaña sin ciudades", async () => {
      const { supabase } = crearSupabasePrueba(() => json({ message: "boom" }, 503));

      await expect(crearFuenteZonasRpc(crearClienteRpc(supabase)).obtenerZonas()).rejects.toBeInstanceOf(ErrorSupabase);
    });
  });
});
