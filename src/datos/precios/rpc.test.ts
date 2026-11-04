import { describe, expect, it, vi } from "vitest";

import { crearFuentePreciosRpc } from "@/datos/precios/rpc";
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
    ...extra,
  };
}

const lecturaMvd = [
  fila({ precio_modificado: 260000, precio_vigente: 260000, origen: "EXCEPCION" }),
  fila({ id: SIN_PRECIO, nombre: "Nuestros Hijos", precio_general: null, precio_vigente: null, origen: "SIN_PRECIO" }),
  fila({ tipo: "COLECCION", id: COMBO, nombre: "Colección de 2 libros", es_bonificable: null, precio_general: 890000, precio_vigente: 890000, libros_a_elegir: 2, componentes_de_baja: 1 }),
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

  it("guardar contesta un rechazo honesto: hoy no hay RPC de escritura y nunca se afirma que se guardó", async () => {
    const { cliente, llamarRpc } = fuente();
    const resultado = await crearFuentePreciosRpc(cliente).guardarPrecios(CAMPANIA, MVD, [{ tipo: "PRODUCTO", id: LIBRO, precio: 2700 }]);
    expect(resultado).toMatchObject({ ok: false, causa: "rechazado" });
    expect(resultado.ok === false && resultado.mensaje).toMatch(/no se guardó/);
    expect(llamarRpc).not.toHaveBeenCalled();
  });
});
