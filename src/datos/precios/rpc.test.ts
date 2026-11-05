import { describe, expect, it, vi } from "vitest";

import { crearFuentePreciosRpc } from "@/datos/precios/rpc";
import { etiquetasDe, grupoDe } from "@/features/stock/vista-27/modelo";
import { ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import { RespuestaInesperada } from "@/datos/supabase/respuesta";

const CAMPANIA = "11111111-1111-4111-8111-111111111111";
const MVD = "22222222-2222-4222-8222-222222222222";
const LAS_PIEDRAS = "44444444-4444-4444-8444-444444444444";
const LIBRO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SIN_PRECIO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const COMBO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

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

const campanias = [{ id: CAMPANIA, nombre: "Verano 2026", tipo: "VERANO", fecha_inicio: "2026-09-01", fecha_fin: "2026-12-31" }];
const ciudades = [
  { campania_ciudad_id: MVD, ciudad_id: "x1", nombre: "Montevideo", lat_centro: -34.87, lon_centro: -56.26, zoom_inicial: 13, cantidad_zonas: 0 },
  { campania_ciudad_id: LAS_PIEDRAS, ciudad_id: "x2", nombre: "Las Piedras", lat_centro: -34.73, lon_centro: -56.22, zoom_inicial: 14, cantidad_zonas: 0 },
];

function fila(extra: Record<string, unknown>) {
  return {
    tipo: "PRODUCTO",
    id: LIBRO,
    nombre: "Salud y Hogar",
    es_bonificable: true,
    precio_general: 240000,
    precio_modificado: null,
    precio_vigente: 240000,
    origen: "GENERAL",
    valido_desde: null,
    valido_hasta: null,
    componentes_de_baja: null,
    libros_a_elegir: null,
    categoria: "BONIFICABLES",
    codigo_editor: "SH-12",
    ...extra,
  };
}

const lecturaMvd = [
  fila({ precio_modificado: 260000, precio_vigente: 260000, origen: "EXCEPCION" }),
  fila({ id: SIN_PRECIO, nombre: "Nuestros Hijos", precio_general: null, precio_vigente: null, origen: "SIN_PRECIO", codigo_editor: null }),
  fila({ tipo: "COLECCION", id: COMBO, nombre: "Colección de 2 libros", es_bonificable: null, precio_general: 890000, precio_vigente: 890000, libros_a_elegir: 2, componentes_de_baja: 1, categoria: null, codigo_editor: null }),
];
const lecturaLasPiedras = lecturaMvd.map((f) => ({ ...f, precio_modificado: null }));

function fuente(porCiudad: Record<string, unknown> = { [MVD]: lecturaMvd, [LAS_PIEDRAS]: lecturaLasPiedras }) {
  return clienteCon({
    campanias_del_coordinador: campanias,
    ciudades_de_campania: ciudades,
    precios_de_la_ciudad: (a: Record<string, unknown>) => porCiudad[a.p_campania_ciudad_id as string],
  });
}

describe("fuente de precios por RPC (vista 27)", () => {
  it("arma el catálogo, el general y las excepciones de cada ciudad en pesos enteros", async () => {
    const { cliente, llamarRpc } = fuente();
    const datos = await crearFuentePreciosRpc(cliente).obtenerPrecios();

    expect(datos).not.toBeNull();
    expect(datos!.campaniaId).toBe(CAMPANIA);
    expect(datos!.ciudades).toEqual([
      { id: MVD, nombre: "Montevideo" },
      { id: LAS_PIEDRAS, nombre: "Las Piedras" },
    ]);
    expect(datos!.items.map((i) => [i.clave, i.nombre, i.precioGeneral, i.esBonificable])).toEqual([
      [`PRODUCTO:${LIBRO}`, "Salud y Hogar", 2400, true],
      [`PRODUCTO:${SIN_PRECIO}`, "Nuestros Hijos", null, true],
      [`COLECCION:${COMBO}`, "Colección de 2 libros", 8900, false],
    ]);
    expect(datos!.items[2]).toMatchObject({ detalle: "2 libros a elegir", componentesDeBaja: 1 });
    expect(datos!.excepciones).toEqual({ [MVD]: { [`PRODUCTO:${LIBRO}`]: 2600 }, [LAS_PIEDRAS]: {} });
    // Una lectura por ciudad, con el id de la campaña-ciudad.
    expect(llamarRpc.mock.calls.filter(([n]) => n === "precios_de_la_ciudad").map(([, a]) => a.p_campania_ciudad_id)).toEqual([MVD, LAS_PIEDRAS]);
  });

  it("la categoría decide el grupo y la insignia «Misionero»; el código sale de `codigo_editor` (colección: sin código ni categoría)", async () => {
    const lectura = [
      fila({ id: "a1111111-1111-4111-8111-111111111111", categoria: "MISIONEROS", codigo_editor: "DG-01", es_bonificable: false }),
      fila({ id: "a2222222-2222-4222-8222-222222222222", categoria: "ESPIRITUALES", codigo_editor: "" }),
      fila({ id: "a3333333-3333-4333-8333-333333333333", categoria: "REVISTAS", codigo_editor: null }),
      fila({ id: "a4444444-4444-4444-8444-444444444444", categoria: "MATERIAL" }),
      fila({ tipo: "COLECCION", id: COMBO, categoria: "MISIONEROS", codigo_editor: "COL-1", es_bonificable: null }),
    ];
    const { cliente } = fuente({ [MVD]: lectura, [LAS_PIEDRAS]: [] });
    const datos = await crearFuentePreciosRpc(cliente).obtenerPrecios();
    expect(datos!.items.map((i) => [i.categoria, i.esMisionero, i.codigo])).toEqual([
      ["MISIONEROS", true, "DG-01"],
      ["ESPIRITUALES", false, null],
      ["REVISTAS", false, null],
      ["MATERIAL", false, "SH-12"],
      [null, false, null],
    ]);
    expect(datos!.items.map(grupoDe)).toEqual(["LIBROS", "LIBROS", "REVISTAS", "MATERIALES", "COLECCIONES"]);
    expect(etiquetasDe(datos!.items[0]).map((e) => e.texto)).toEqual(["Misionero"]);
    expect(etiquetasDe(datos!.items[2]).map((e) => e.texto)).toEqual(["Bonificable", "Revista"]);
  });

  it("una categoría que no se conoce se frena en vez de adivinar el grupo", async () => {
    const { cliente } = fuente({ [MVD]: [fila({ categoria: "OTRA" })], [LAS_PIEDRAS]: [] });
    await expect(crearFuentePreciosRpc(cliente).obtenerPrecios()).rejects.toBeInstanceOf(RespuestaInesperada);
  });

  it("sin campaña vigente devuelve null", async () => {
    const { cliente } = clienteCon({ campanias_del_coordinador: [] });
    expect(await crearFuentePreciosRpc(cliente).obtenerPrecios()).toBeNull();
  });

  it.each(["CZ001", "CZ011"])("si la campaña dejó de estar vigente entre dos llamadas (%s) es «sin campaña»", async (codigo) => {
    const { cliente } = clienteCon({
      campanias_del_coordinador: campanias,
      ciudades_de_campania: new ErrorSupabase("ya no", 400, codigo),
    });
    expect(await crearFuentePreciosRpc(cliente).obtenerPrecios()).toBeNull();
  });

  it("una falla de servicio o de sesión no se toma por una lista vacía: sale como excepción", async () => {
    const { cliente } = clienteCon({
      campanias_del_coordinador: campanias,
      ciudades_de_campania: new ErrorSupabase("caído", 503, "XX000"),
    });
    await expect(crearFuentePreciosRpc(cliente).obtenerPrecios()).rejects.toBeInstanceOf(ErrorSupabase);
  });

  it("un importe con centavos o un tipo desconocido se frenan en vez de redondearse", async () => {
    const conCentavos = fuente({ [MVD]: [fila({ precio_general: 240050 })], [LAS_PIEDRAS]: [] });
    await expect(crearFuentePreciosRpc(conCentavos.cliente).obtenerPrecios()).rejects.toBeInstanceOf(RespuestaInesperada);
    const tipoRaro = fuente({ [MVD]: [fila({ tipo: "OTRO" })], [LAS_PIEDRAS]: [] });
    await expect(crearFuentePreciosRpc(tipoRaro.cliente).obtenerPrecios()).rejects.toBeInstanceOf(RespuestaInesperada);
  });

  it("campaña sin ciudades: catálogo vacío y sin excepciones", async () => {
    const { cliente } = clienteCon({ campanias_del_coordinador: campanias, ciudades_de_campania: [] });
    expect(await crearFuentePreciosRpc(cliente).obtenerPrecios()).toMatchObject({ items: [], ciudades: [], excepciones: {} });
  });

  it("usa la campaña elegida en el topbar", async () => {
    const { cliente } = fuente();
    const datos = await crearFuentePreciosRpc(cliente, async () => CAMPANIA).obtenerPrecios();
    expect(datos?.campaniaId).toBe(CAMPANIA);
  });

});

describe("guardar los precios de una ciudad por RPC (guardar_precios_de_la_ciudad)", () => {
  const guardado = [{ tipo: "PRODUCTO", id: LIBRO, accion: "CAMBIADA" }];
  const cambios = [
    { tipo: "PRODUCTO" as const, id: LIBRO, precio: 2700 },
    { tipo: "COLECCION" as const, id: COMBO, precio: null },
  ];
  const guardarCon = (respuesta: unknown, c = cambios, ciudad = MVD) => {
    const { cliente, llamarRpc } = clienteCon({ guardar_precios_de_la_ciudad: respuesta });
    return { llamarRpc, resultado: crearFuentePreciosRpc(cliente).guardarPrecios(CAMPANIA, ciudad, c) };
  };

  it("manda la ciudad y solo lo que cambió, en centavos, con null para quitar la excepción", async () => {
    const { llamarRpc, resultado } = guardarCon(guardado);
    expect(await resultado).toEqual({ ok: true });
    expect(llamarRpc).toHaveBeenCalledTimes(1);
    expect(llamarRpc).toHaveBeenCalledWith("guardar_precios_de_la_ciudad", {
      p_campania_ciudad_id: MVD,
      p_cambios: [
        { tipo: "PRODUCTO", id: LIBRO, precio: 270000 },
        { tipo: "COLECCION", id: COMBO, precio: null },
      ],
    });
  });

  it("un cambio sin cambio en la base (SIN_CAMBIO) es un guardado igual", async () => {
    expect(await guardarCon([{ tipo: "PRODUCTO", id: LIBRO, accion: "SIN_CAMBIO" }]).resultado).toEqual({ ok: true });
  });

  it.each([
    ["PP003", "El precio del cambio 1 tiene que ser un número entero mayor que cero. Corregilo, o dejalo vacío para volver al precio general."],
    ["PP005", "El cambio 1 es de un libro que no existe o está dado de baja. Recargá los precios de la ciudad."],
    ["CZ012", "La ciudad no está en una campaña o ya se quitó de ella. Recargá las ciudades de la campaña."],
    ["CZ001", "La campaña no existe. Elegí otra campaña."],
  ])("el rechazo %s vuelve como resultado con el texto de la base", async (codigo, texto) => {
    const resultado = await guardarCon(new ErrorSupabase(texto, 400, codigo)).resultado;
    expect(resultado).toEqual({ ok: false, causa: "rechazado", mensaje: texto });
  });

  it("sin permiso (42501 con 403) lleva el texto del panel, no el técnico de la base", async () => {
    const resultado = await guardarCon(new ErrorSupabase("permission denied for table precio_por_ciudad", 403, "42501")).resultado;
    expect(resultado).toEqual({ ok: false, causa: "rechazado", mensaje: expect.stringMatching(/^Solo el coordinador de la campaña puede cambiar sus precios/) });
    expect(JSON.stringify(resultado)).not.toMatch(/permission denied/);
  });

  it("un rechazo que el panel no conoce (función ausente, mensaje técnico) no muestra el texto de la base", async () => {
    const resultado = await guardarCon(new ErrorSupabase("Could not find the function public.guardar_precios_de_la_ciudad", 404, "PGRST202")).resultado;
    expect(resultado).toEqual({ ok: false, causa: "rechazado", mensaje: expect.stringMatching(/^No se pudieron guardar los precios\. Tus cambios siguen marcados/) });
  });

  it.each([
    ["JWT vencido", new ErrorSupabase("JWT expired", 401, "PGRST301")],
    ["sin credenciales", new ErrorSupabase("No credentials", 401, "PGRST302")],
  ])("%s: vuelve como sesión vencida y no como excepción", async (_caso, error) => {
    expect(await guardarCon(error).resultado).toEqual({
      ok: false,
      causa: "rechazado",
      mensaje: "Tu sesión venció. Volvé a entrar para seguir.",
      sesionVencida: true,
    });
  });

  it.each([
    ["un 503", new ErrorSupabase("caído", 503, "XX000")],
    ["un 429", new ErrorSupabase("límite", 429, "")],
    ["sin red", new TypeError("fetch failed")],
  ])("%s no es un rechazo ni afirma que se guardó: sale como excepción", async (_caso, error) => {
    await expect(guardarCon(error).resultado).rejects.toBe(error);
  });

  it("lo que no es de esta vista se frena sin llamar a la base", async () => {
    const malos: [string, unknown, string?][] = [
      ["precio con centavos", [{ tipo: "PRODUCTO", id: LIBRO, precio: 27.5 }]],
      ["precio cero", [{ tipo: "PRODUCTO", id: LIBRO, precio: 0 }]],
      ["precio negativo", [{ tipo: "PRODUCTO", id: LIBRO, precio: -5 }]],
      ["precio que no cabe en centavos enteros de 32 bits", [{ tipo: "PRODUCTO", id: LIBRO, precio: 21_474_837 }]],
      ["precio NaN", [{ tipo: "PRODUCTO", id: LIBRO, precio: Number.NaN }]],
      ["tipo desconocido", [{ tipo: "OTRO", id: LIBRO, precio: 100 }]],
      ["id que no es un uuid", [{ tipo: "PRODUCTO", id: "x", precio: 100 }]],
      ["el mismo item dos veces", [{ tipo: "PRODUCTO", id: LIBRO, precio: 100 }, { tipo: "PRODUCTO", id: LIBRO.toUpperCase(), precio: 200 }]],
      ["lista vacía", []],
      ["más de 500", Array.from({ length: 501 }, (_, n) => ({ tipo: "PRODUCTO", id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, precio: 100 }))],
      ["ciudad que no es un uuid", [{ tipo: "PRODUCTO", id: LIBRO, precio: 100 }], "no-es-uuid"],
    ];
    for (const [caso, c, ciudad] of malos) {
      const { llamarRpc, resultado } = guardarCon(guardado, c as typeof cambios, ciudad);
      expect(await resultado, caso).toMatchObject({ ok: false, causa: "rechazado", mensaje: expect.any(String) });
      expect(llamarRpc, caso).not.toHaveBeenCalled();
    }
  });

  it("el precio más alto que acepta la base (2147483647 centavos) pasa; uno más no", async () => {
    expect(await guardarCon(guardado, [{ tipo: "PRODUCTO", id: LIBRO, precio: 21_474_836 }]).resultado).toEqual({ ok: true });
    expect(await guardarCon(guardado, [{ tipo: "PRODUCTO", id: LIBRO, precio: 21_474_837 }]).resultado).toMatchObject({ ok: false });
  });
});
