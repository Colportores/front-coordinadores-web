import { describe, expect, it } from "vitest";

import { claveDe, type DatosDePrecios } from "@/datos/precios";
import { CIUDADES_SIMULADAS, crearDatosDePreciosSimulados, ITEMS_SIMULADOS } from "@/datos/precios/simulado";

import canvas from "./canvas-27.json";
import {
  armarFilasDeCiudad,
  armarFilasGenerales,
  armarPestanas,
  agruparFilas,
  etiquetasDe,
  formatoPesos,
  subtituloDeCiudad,
  SUBTITULO_GENERAL,
  bonificablesSinPrecioEnCiudad,
  textoDeAlertaSinPrecioEnCiudad,
  textoDeAplicacion,
  textoDeCambios,
  textoDeCorregir,
  textoDeGuardado,
  TEXTO_DE_ACCION,
  TEXTO_DE_ESTADO,
  type Borrador,
  type FilaDeCiudad,
} from "./modelo";

/**
 * `canvas-27.json` es la salida del script del canvas (`27 Precios por Zona.dc.html`, sección «Precios: general y excepciones
 * por ciudad»: node + `class DCLogic{}` + `new Function`) para los diez artboards 27G·01 a 27G·10. Cada artboard se arma acá con
 * el modelo y se compara celda por celda. Diferencias de escritura que NO son de datos y se normalizan: el canvas escribe «$ »
 * donde el panel escribe «$U » (HU-CAT-005, vista 36 y la sección 27A) y «-» donde el panel escribe el signo menos «−».
 */

type FilaDelCanvas = { name: string; tag: string; code: string; comp: string; gen: string; c: string; d: string; st: string; act: string; err: string };
type ArtboardDelCanvas = (typeof canvas)[number];

const [MONTEVIDEO, LAS_PIEDRAS] = CIUDADES_SIMULADAS;
const por = (codigo: string) => ITEMS_SIMULADOS.find((i) => i.codigo === codigo)!;
const SH = por("SH-12");
const NH = por("NH-04");
const DG = por("DG-01");
const COL1 = por("COL-1");

function normalizar(texto: string): string {
  return texto
    .replace(/\$ /g, "$U ")
    .replace(/^▼ /, "▼ −")
    .replace(/(^|[ +])-(?=\d)/g, "$1−");
}

function celdaDelPrecio(fila: FilaDeCiudad): string {
  if (fila.campo.tipo === "texto") return fila.campo.texto;
  return /^\d+$/.test(fila.campo.valor) ? formatoPesos(Number(fila.campo.valor)) : fila.campo.valor;
}

function filasDelCanvas(artboard: ArtboardDelCanvas): FilaDelCanvas[] {
  return artboard.rows.filter((r): r is FilaDelCanvas => "name" in r);
}

function comoLoDiceElModelo(fila: FilaDeCiudad): Omit<FilaDelCanvas, "tag"> & { tags: string } {
  return {
    name: fila.item.nombre,
    tags: etiquetasDe(fila.item).map((e) => e.texto).join(" "),
    code: fila.item.codigo ?? "",
    comp: fila.item.detalle ?? "",
    gen: fila.general,
    c: celdaDelPrecio(fila),
    d: fila.diferencia?.texto ?? "",
    st: fila.estado ? TEXTO_DE_ESTADO[fila.estado] : "",
    act: fila.accion ? TEXTO_DE_ACCION[fila.accion] : "",
    err: fila.error ?? "",
  };
}

function esperadoDelCanvas(r: FilaDelCanvas) {
  return {
    name: r.name,
    tags: r.tag,
    code: r.code,
    comp: r.comp,
    gen: normalizar(r.gen),
    c: normalizar(r.c),
    d: normalizar(r.d),
    st: r.st,
    act: r.act,
    err: r.err,
  };
}

function artboard(id: string): ArtboardDelCanvas {
  const encontrado = canvas.find((a) => a.id === id);
  if (!encontrado) throw new Error(`falta el artboard ${id}`);
  return encontrado;
}

function valor(texto: string): Borrador[string] {
  return { tipo: "valor", texto, tocado: true };
}

function compararCiudad(id: string, datos: DatosDePrecios, ciudadId: string, borrador: Borrador) {
  const del = artboard(id);
  const mias = armarFilasDeCiudad(datos, ciudadId, borrador).map(comoLoDiceElModelo);
  expect(mias).toEqual(filasDelCanvas(del).map(esperadoDelCanvas));
  // Los grupos, en el orden del canvas.
  expect(agruparFilas(armarFilasDeCiudad(datos, ciudadId, borrador)).map((g) => g.titulo)).toEqual(
    del.rows.filter((r): r is { group: string } => "group" in r).map((r) => r.group),
  );
}

describe("canvas 27G (precios: general y excepciones por ciudad)", () => {
  it("27G·01 · pestaña General: cada producto con su general y en cuántas ciudades se aparta", () => {
    const del = artboard("27G-01");
    // El canvas cuenta 2 ciudades con excepción en El Deseado, sin dibujar la tercera pestaña: se la suma a los datos.
    const datos = crearDatosDePreciosSimulados();
    const tercera = { id: "00000000-0000-4000-8000-000000000303", nombre: "Rivera" };
    datos.ciudades.push(tercera);
    datos.excepciones[tercera.id] = { [DG.clave]: 380 };

    const mias = armarFilasGenerales(datos).map((f) => ({
      name: f.item.nombre,
      tags: etiquetasDe(f.item).map((e) => e.texto).join(" "),
      code: f.item.codigo ?? "",
      comp: f.item.detalle ?? "",
      gen: f.precio,
      c: f.textoDeExcepciones,
    }));
    expect(mias).toEqual(
      filasDelCanvas(del).map((r) => ({
        name: r.name,
        tags: r.tag,
        code: r.code,
        comp: r.comp,
        gen: normalizar(r.gen),
        c: r.c,
      })),
    );
    expect(agruparFilas(armarFilasGenerales(datos)).map((g) => g.titulo)).toEqual(
      del.rows.filter((r): r is { group: string } => "group" in r).map((r) => r.group),
    );
    expect(SUBTITULO_GENERAL).toBe(del.sub);
    expect(del.heads.slice(0, 4)).toEqual(["PRODUCTO O COLECCIÓN", "CÓDIGO", "PRECIO GENERAL", "CON EXCEPCIÓN EN"]);
  });

  it("27G·01 y 27G·02 · las pestañas: General y una por ciudad, con sus excepciones", () => {
    const pestanas = armarPestanas(crearDatosDePreciosSimulados(), {});
    for (const id of ["27G-01", "27G-02"]) {
      const del = artboard(id).tabs;
      expect(pestanas.map((p) => ({ t: p.nombre, badge: p.excepciones ?? "" }))).toEqual(del.map((t) => ({ t: t.t, badge: id === "27G-02" && t.t === "Las Piedras" ? "" : t.badge })));
    }
  });

  it("27G·02 · ciudad con excepciones", () => {
    compararCiudad("27G-02", crearDatosDePreciosSimulados(), MONTEVIDEO.id, {});
    expect(subtituloDeCiudad("Montevideo")).toBe(artboard("27G-02").sub);
  });

  it("27G·03 · cambios sin guardar: una nueva, una quitada y una modificada", () => {
    const datos = crearDatosDePreciosSimulados();
    compararCiudad("27G-03", datos, MONTEVIDEO.id, {
      [NH.clave]: valor("2000"),
      [DG.clave]: { tipo: "quitar" },
      [COL1.clave]: valor("4400"),
    });
    expect(textoDeCambios(3)).toBe(artboard("27G-03").bar);
    expect(textoDeAplicacion("Montevideo")).toBe(artboard("27G-03").barSub);
  });

  it("27G·04 · valor inválido", () => {
    compararCiudad("27G-04", crearDatosDePreciosSimulados(), MONTEVIDEO.id, { [NH.clave]: valor("1900,50") });
    expect(textoDeCambios(1)).toBe(artboard("27G-04").bar);
    expect(textoDeCorregir(1)).toBe(artboard("27G-04").barSub);
  });

  it("27G·05 · producto sin precio en una ciudad: las filas, la insignia de la pestaña y la alerta (decisión del 05/11, «Sin general»)", () => {
    const datos = crearDatosDePreciosSimulados();
    datos.items = datos.items.map((i) => (i.clave === NH.clave ? { ...i, precioGeneral: null } : i));
    compararCiudad("27G-05", datos, LAS_PIEDRAS.id, {});
    expect(subtituloDeCiudad("Las Piedras")).toBe(artboard("27G-05").sub);

    const del = artboard("27G-05");
    // La insignia de Las Piedras es la del canvas; Montevideo conserva la suya (el canvas no le dibuja la falta de precio).
    expect(armarPestanas(datos, {}).find((p) => p.nombre === "Las Piedras")?.faltan).toBe(del.tabs[2].badge);
    // La alerta empieza con la frase del canvas; después dice qué hacer (decisión del 05/11).
    const alerta = textoDeAlertaSinPrecioEnCiudad(bonificablesSinPrecioEnCiudad(datos, LAS_PIEDRAS.id), "Las Piedras");
    expect(alerta?.startsWith(del.banner)).toBe(true);
    expect(alerta).toBe(`${del.banner} Cargá su precio en Las Piedras o pedile el general a Administración.`);
    expect(del.bRole).toBe("alert");
    expect(del.bBtn).toBe("Agregar precio");
  });

  it("27G·08 y 27G·09 · error al guardar y sin conexión: dos cambios marcados / uno marcado", () => {
    const datos = crearDatosDePreciosSimulados();
    compararCiudad("27G-08", datos, MONTEVIDEO.id, { [NH.clave]: valor("2000"), [COL1.clave]: valor("4400") });
    expect(textoDeCambios(2)).toBe(artboard("27G-08").bar);
    compararCiudad("27G-09", datos, MONTEVIDEO.id, { [NH.clave]: valor("2000") });
    expect(textoDeCambios(1)).toBe(artboard("27G-09").bar);
  });

  it("27G·10 · guardado: lo que quedó guardado y el aviso", () => {
    const datos = crearDatosDePreciosSimulados();
    datos.excepciones[MONTEVIDEO.id] = { [SH.clave]: 2600, [NH.clave]: 2000, [DG.clave]: 400, [COL1.clave]: 4400 };
    compararCiudad("27G-10", datos, MONTEVIDEO.id, {});
    expect(
      textoDeGuardado(
        [
          { tipo: "PRODUCTO", id: NH.id, precio: 2000 },
          { tipo: "COLECCION", id: COL1.id, precio: 4400 },
        ],
        "Montevideo",
      ),
    ).toBe(artboard("27G-10").toast);
  });

  it("los estados y los textos de acción son los del canvas", () => {
    const usados = new Set<string>();
    for (const a of canvas) {
      for (const r of filasDelCanvas(a)) {
        usados.add(r.st);
        usados.add(r.act);
      }
    }
    usados.delete("");
    const mios = new Set<string>([...Object.values(TEXTO_DE_ESTADO), ...Object.values(TEXTO_DE_ACCION)]);
    for (const texto of usados) expect(mios, texto).toContain(texto);
    // La clave de un producto y la de una colección no se pisan.
    expect(claveDe("PRODUCTO", "x")).not.toBe(claveDe("COLECCION", "x"));
  });
});
