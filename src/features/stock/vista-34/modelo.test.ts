import { describe, expect, it } from "vitest";

import type { ColportorDeStock, DatosDeStock, ExistenciaDeStock, ProductoDeStock } from "@/datos/stock/contrato";

import {
  AMBITO_TODAS,
  abreviar,
  claveDeDepartamento,
  construirAvisos,
  construirLista,
  construirMundo,
  construirRiel,
  construirTabla,
  construirTarjetas,
  estadoDe,
  formatearCantidad,
  mismoAmbito,
  resolverAmbito,
  textoDeSincronizacion,
  type Ambito,
} from "./modelo";

const producto = (id: string, tipo: ProductoDeStock["tipo"], nombre = id, nota: string | null = null): ProductoDeStock => ({ id, nombre, tipo, nota });
const ex = (productoId: string, tiene: number, porEntregar = 0, entregados = 0, porCobrar = 0): ExistenciaDeStock => ({ productoId, tiene, porEntregar, entregados, porCobrar });
const col = (id: string, ciudadId: string | null, ...existencias: ExistenciaDeStock[]): ColportorDeStock => ({ id, nombre: id, ciudadId, ultimoDatoAt: null, existencias });

function datos(parcial: Partial<DatosDeStock> = {}): DatosDeStock {
  return {
    campaniaId: "c1",
    ciudades: [
      { id: "riv", nombre: "Rivera", departamento: "Rivera" },
      { id: "art", nombre: "Artigas", departamento: "Artigas" },
      { id: "bu", nombre: "Bella Unión", departamento: "Artigas" },
    ],
    productos: [producto("l1", "LIBRO", "Libro uno"), producto("r1", "REVISTA", "Revista uno"), producto("r2", "REVISTA", "Revista dos")],
    colportores: [],
    ...parcial,
  };
}

const resolver = (d: DatosDeStock, ambito: Ambito = AMBITO_TODAS) => {
  const mundo = construirMundo(d);
  return { mundo, resuelto: resolverAmbito(mundo, ambito) };
};

describe("estadoDe", () => {
  it("sin nada en la ciudad está agotado, tenga o no entregas pendientes", () => {
    expect(estadoDe({ tiene: 0, porEntregar: 0, entregados: 3, porCobrar: 0 })).toMatchObject({ tipo: "agotado", simbolo: "⊘", texto: "Agotado en la ciudad" });
    expect(estadoDe({ tiene: 0, porEntregar: 4, entregados: 0, porCobrar: 0 }).tipo).toBe("agotado");
  });

  it("no alcanza cuando lo que hay es menos que lo vendido y no entregado, y dice cuánto falta", () => {
    expect(estadoDe({ tiene: 4, porEntregar: 6, entregados: 0, porCobrar: 0 })).toMatchObject({ tipo: "faltan", simbolo: "△", texto: "Faltan 2 para entregar", faltan: 2 });
  });

  it("alcanza justo cuando hay lo mismo que por entregar", () => {
    expect(estadoDe({ tiene: 5, porEntregar: 5, entregados: 0, porCobrar: 0 })).toMatchObject({ tipo: "alcanza", simbolo: "✓", texto: "Alcanza" });
  });
});

describe("formatearCantidad", () => {
  it("separa los miles con punto", () => {
    expect(formatearCantidad(0)).toBe("0");
    expect(formatearCantidad(999)).toBe("999");
    expect(formatearCantidad(1234)).toBe("1.234");
    expect(formatearCantidad(1234567)).toBe("1.234.567");
  });
});

describe("construirMundo", () => {
  it("no cuenta stock negativo ni cantidades que no son números", () => {
    const { resuelto, mundo } = resolver(datos({ colportores: [col("a", "riv", ex("l1", -3, Number.NaN, 2.9, Number.POSITIVE_INFINITY))] }));
    const [fila] = construirTabla(mundo, resuelto)[0].filas;
    expect([fila.tiene, fila.porEntregar, fila.entregados, fila.porCobrar]).toEqual([0, 0, 2, 0]);
  });

  it("un producto que el colportor no tiene cargado vale cero, y uno que no está en el catálogo se ignora", () => {
    const { resuelto, mundo } = resolver(datos({ colportores: [col("a", "riv", ex("fantasma", 50))] }));
    const grupos = construirTabla(mundo, resuelto);
    expect(grupos.flatMap((g) => g.filas).every((f) => f.tiene === 0)).toBe(true);
  });

  it("el mismo colportor repetido cuenta una sola vez", () => {
    const { resuelto } = resolver(datos({ colportores: [col("a", "riv", ex("l1", 3)), col("a", "riv", ex("l1", 3))] }));
    expect(resuelto.personas).toHaveLength(1);
  });

  it("un colportor de una ciudad que no figura queda como sin ciudad", () => {
    const { mundo } = resolver(datos({ colportores: [col("a", "no-existe", ex("l1", 3))] }));
    expect(mundo.sinCiudad.map((p) => p.id)).toEqual(["a"]);
  });

  it("ordena los departamentos de la A a la Z, y dentro de cada uno las ciudades; sin departamento al final", () => {
    const { mundo } = resolver(
      datos({
        ciudades: [
          { id: "z", nombre: "Zeta", departamento: null },
          { id: "riv", nombre: "Rivera", departamento: "Rivera" },
          { id: "bu", nombre: "Bella Unión", departamento: "Artigas" },
          { id: "art", nombre: "Artigas", departamento: "Artigas" },
        ],
      }),
    );
    expect(mundo.ciudades.map((c) => c.id)).toEqual(["art", "bu", "riv", "z"]);
  });
});

describe("resolverAmbito", () => {
  const base = datos({ colportores: [col("a", "riv", ex("l1", 1)), col("b", "art", ex("l1", 1)), col("c", "bu", ex("l1", 1)), col("d", null, ex("l1", 1))] });

  it("todas las ciudades junta a todos, también a los que no tienen ciudad, y lo dice", () => {
    const { resuelto } = resolver(base);
    expect(resuelto.titulo).toBe("Todas las ciudades");
    expect(resuelto.subtitulo).toBe("4 colportores · 3 productos · 1 sin ciudad");
    expect(resuelto.variosLugares).toBe(true);
  });

  it("una ciudad dice su departamento", () => {
    expect(resolver(base, { tipo: "ciudad", ciudadId: "bu" }).resuelto.subtitulo).toBe("1 colportor · 3 productos · Departamento Artigas");
  });

  it("el departamento junta sus ciudades y deja afuera a los que no tienen ciudad", () => {
    const { resuelto } = resolver(base, { tipo: "departamento", clave: "artigas" });
    expect(resuelto.titulo).toBe("Departamento Artigas");
    expect(resuelto.personas.map((p) => p.id)).toEqual(["b", "c"]);
  });

  it("«Sin ciudad» muestra solo a los que no tienen zona", () => {
    const { resuelto } = resolver(base, { tipo: "sin-ciudad" });
    expect(resuelto.titulo).toBe("Sin ciudad");
    expect(resuelto.personas.map((p) => p.id)).toEqual(["d"]);
    expect(resuelto.variosLugares).toBe(false);
  });

  it("un ámbito que ya no existe vuelve a todas las ciudades", () => {
    expect(resolver(base, { tipo: "ciudad", ciudadId: "borrada" }).resuelto.ambito).toEqual(AMBITO_TODAS);
    expect(resolver(base, { tipo: "departamento", clave: "rivera" }).resuelto.ambito).toEqual(AMBITO_TODAS);
    expect(resolver(datos({ colportores: [col("a", "riv")] }), { tipo: "sin-ciudad" }).resuelto.ambito).toEqual(AMBITO_TODAS);
  });

  it("Paysandú y Paysandu son un solo departamento", () => {
    expect(claveDeDepartamento(" Paysandú ")).toBe("paysandu");
    const d = datos({
      ciudades: [
        { id: "p1", nombre: "Paysandú", departamento: "Paysandú" },
        { id: "p2", nombre: "Guichón", departamento: "Paysandu" },
      ],
    });
    const lista = construirLista(construirMundo(d), resolver(d).resuelto);
    expect(lista.grupos).toHaveLength(1);
    expect(lista.grupos[0].nodos.map((n) => n.nombre)).toEqual(["Todo el departamento", "Guichón", "Paysandú"]);
  });

  it("mismoAmbito distingue los cuatro tipos", () => {
    expect(mismoAmbito({ tipo: "todas" }, { tipo: "todas" })).toBe(true);
    expect(mismoAmbito({ tipo: "sin-ciudad" }, { tipo: "todas" })).toBe(false);
    expect(mismoAmbito({ tipo: "ciudad", ciudadId: "a" }, { tipo: "ciudad", ciudadId: "b" })).toBe(false);
    expect(mismoAmbito({ tipo: "departamento", clave: "a" }, { tipo: "departamento", clave: "a" })).toBe(true);
  });
});

describe("construirLista y construirRiel", () => {
  it("«Todo el departamento» solo donde el departamento tiene más de una ciudad", () => {
    const d = datos({ colportores: [col("a", "riv", ex("l1", 1))] });
    const { mundo, resuelto } = resolver(d);
    const lista = construirLista(mundo, resuelto);
    expect(lista.grupos.map((g) => [g.titulo, g.nodos.map((n) => n.nombre)])).toEqual([
      ["DEPTO. ARTIGAS", ["Todo el departamento", "Artigas", "Bella Unión"]],
      ["DEPTO. RIVERA", ["Rivera"]],
    ]);
  });

  it("cuenta los avisos de cada ciudad, y una ciudad sin colportores no tiene avisos sino que lo dice", () => {
    const d = datos({ colportores: [col("a", "riv", ex("l1", 0, 2)), col("b", "art", ex("l1", 5), ex("r1", 3))] });
    const { mundo, resuelto } = resolver(d);
    const detalle = Object.fromEntries(construirLista(mundo, resuelto).grupos.flatMap((g) => g.nodos).map((n) => [n.nombre, n.detalle]));
    // Rivera: el libro se agotó y las revistas también (nadie tiene): 2 avisos. Artigas: sin libros no, las revistas sí tienen.
    expect(detalle).toMatchObject({ Rivera: "2 avisos", Artigas: "sin avisos", "Bella Unión": "sin colportores", "Todo el departamento": "" });
  });

  it("agrega «Sin ciudad» solo si hay colportores sin ciudad", () => {
    const sin = resolver(datos({ colportores: [col("a", "riv")] }));
    expect(construirLista(sin.mundo, sin.resuelto).grupos.some((g) => g.clave === "sin-ciudad")).toBe(false);
    const con = resolver(datos({ colportores: [col("a", null), col("b", null)] }));
    const nodo = construirLista(con.mundo, con.resuelto).grupos.find((g) => g.clave === "sin-ciudad")?.nodos[0];
    expect(nodo).toMatchObject({ nombre: "Sin ciudad", detalle: "2 colportores" });
  });

  it("el riel abrevia cada ciudad", () => {
    const { mundo, resuelto } = resolver(datos({ colportores: [col("a", null)] }));
    const riel = construirRiel(construirLista(mundo, resuelto));
    expect(riel.map((i) => i.abreviatura)).toEqual(["Todas", "Dpto.", "Art.", "B. Un.", "Riv.", "Sin c."]);
    expect(abreviar("")).toBe("");
    expect(abreviar("Paso de los Toros")).toBe("P. de. lo. To.");
  });
});

describe("construirTarjetas", () => {
  const d = datos({
    productos: [producto("l1", "LIBRO"), producto("r1", "REVISTA"), producto("r2", "REVISTA")],
    colportores: [col("a", "riv", ex("l1", 0, 1), ex("r1", 4))],
  });

  it("revistas y misioneros se cuentan juntos; un tipo sin productos lo dice y no inventa avisos", () => {
    const { mundo, resuelto } = resolver(d);
    const tarjetas = construirTarjetas(mundo, resuelto);
    expect(tarjetas.map((t) => [t.etiqueta, t.total, t.extra, t.detalle])).toEqual([
      ["Libros", 0, "1 producto", "1 con aviso"],
      ["Revistas", 4, "se cuentan juntas", "hay en la ciudad"],
      ["Material", 0, "sin productos", ""],
      ["Misioneros", 0, "sin productos", ""],
    ]);
  });

  it("si la categoría se agota o no alcanza, la tarjeta dice cuál de las dos", () => {
    const sinRevistas = resolver(datos({ colportores: [col("a", "riv", ex("r1", 0, 3))] }));
    expect(construirTarjetas(sinRevistas.mundo, sinRevistas.resuelto)[1].detalle).toBe("Agotado en la ciudad");
    const noAlcanza = resolver(datos({ colportores: [col("a", "riv", ex("r1", 1, 3))] }));
    expect(construirTarjetas(noAlcanza.mundo, noAlcanza.resuelto)[1].detalle).toBe("Faltan 2 para entregar");
  });
});

describe("construirAvisos", () => {
  it("un colportor en cero no es un aviso: lo es la ciudad cuando nadie lo tiene", () => {
    const d = datos({ colportores: [col("a", "riv", ex("l1", 0), ex("r1", 2)), col("b", "riv", ex("l1", 3), ex("r1", 0))] });
    const { mundo, resuelto } = resolver(d, { tipo: "ciudad", ciudadId: "riv" });
    expect(construirAvisos(mundo, resuelto)).toEqual([]);
  });

  it("agotado dice cuánto hay por entregar; no alcanza dice cuánto hay y cuánto falta", () => {
    const d = datos({
      productos: [producto("l1", "LIBRO", "Libro uno"), producto("l2", "LIBRO", "Libro dos")],
      colportores: [col("a", "riv", ex("l1", 0, 2), ex("l2", 3, 5))],
    });
    const { mundo, resuelto } = resolver(d, { tipo: "ciudad", ciudadId: "riv" });
    expect(construirAvisos(mundo, resuelto).map((a) => [a.negrita, a.texto, a.boton])).toEqual([
      ["Libro uno", "agotado · 2 por entregar", "Ver pedidos"],
      ["Libro dos", "hay 3, faltan 2", "Ver quién tiene"],
    ]);
  });

  it("al mirar varias ciudades el aviso nombra la ciudad, y cada ciudad se evalúa por separado", () => {
    const d = datos({
      productos: [producto("l1", "LIBRO", "Libro uno")],
      colportores: [col("a", "riv", ex("l1", 0)), col("b", "art", ex("l1", 4, 6)), col("c", "bu", ex("l1", 9))],
    });
    const { mundo, resuelto } = resolver(d);
    expect(construirAvisos(mundo, resuelto).map((a) => a.texto)).toEqual(["Artigas: hay 4, faltan 2", "agotado en Rivera"]);
  });

  it("una ciudad sin colportores no avisa nada", () => {
    const { mundo, resuelto } = resolver(datos());
    expect(construirAvisos(mundo, resuelto)).toEqual([]);
  });
});

describe("construirTabla", () => {
  const d = datos({
    productos: [producto("l1", "LIBRO", "Libro uno", "tipo a confirmar"), producto("r1", "REVISTA", "Revista uno"), producto("r2", "REVISTA", "Revista dos")],
    colportores: [
      col("ana", "riv", ex("l1", 2, 1, 5, 1), ex("r1", 3), ex("r2", 1, 2)),
      col("beto", "riv", ex("l1", 0, 0, 7, 2)),
      col("cata", "art", ex("l1", 4, 0, 1, 0)),
    ],
  });

  it("libros por producto, revistas en una sola fila por categoría que suma sus títulos", () => {
    const { mundo, resuelto } = resolver(d, { tipo: "ciudad", ciudadId: "riv" });
    const grupos = construirTabla(mundo, resuelto);
    expect(grupos.map((g) => [g.titulo, g.detalle, g.filas.map((f) => f.nombre)])).toEqual([
      ["Libros", "1 producto", ["Libro uno"]],
      ["Revistas", "por categoría", ["Revistas · todas"]],
    ]);
    const revistas = grupos[1].filas[0];
    expect(revistas).toMatchObject({ clave: "categoria:REVISTA", tiene: 4, porEntregar: 2, nota: "Revista uno, Revista dos" });
    expect(grupos[0].filas[0].nota).toBe("tipo a confirmar");
  });

  it("«en manos de» cuenta a quienes tienen algo, sobre todos los de la ciudad", () => {
    const { mundo, resuelto } = resolver(d, { tipo: "ciudad", ciudadId: "riv" });
    expect(construirTabla(mundo, resuelto)[0].filas[0]).toMatchObject({ poseedores: 1, totalPersonas: 2, entregados: 12, porCobrar: 3 });
  });

  it("quién lo tiene: los que tienen o deben entregar, sin la ciudad cuando se mira una sola", () => {
    const { mundo, resuelto } = resolver(d, { tipo: "ciudad", ciudadId: "riv" });
    expect(construirTabla(mundo, resuelto)[0].filas[0].quien.map((q) => q.nombre)).toEqual(["ana"]);
  });

  it("al mirar varias ciudades cada nombre lleva la suya", () => {
    const { mundo, resuelto } = resolver(d);
    expect(construirTabla(mundo, resuelto)[0].filas[0].quien.map((q) => q.nombre)).toEqual(["cata · Artigas", "ana · Rivera"]);
  });

  it("si nadie lo tiene dice dónde", () => {
    const { mundo, resuelto } = resolver(d, { tipo: "ciudad", ciudadId: "art" });
    const revistas = construirTabla(mundo, resuelto)[1].filas[0];
    expect(revistas.quien).toEqual([]);
    expect(revistas.sinNadie).toBe("Nadie lo tiene en Artigas.");
    expect(revistas.estado.tipo).toBe("agotado");
  });

  it("un tipo sin productos no tiene cabecera", () => {
    const { mundo, resuelto } = resolver(d);
    expect(construirTabla(mundo, resuelto).map((g) => g.tipo)).toEqual(["LIBRO", "REVISTA"]);
  });

  it("con muchos colportores y productos sigue dando una fila por unidad", () => {
    const productos = Array.from({ length: 60 }, (_, i) => producto(`p${i}`, "LIBRO", `Producto ${i}`));
    const colportores = Array.from({ length: 400 }, (_, i) => col(`c${i}`, "riv", ...productos.map((p) => ex(p.id, i % 7, i % 3))));
    const { mundo, resuelto } = resolver(datos({ productos, colportores }), { tipo: "ciudad", ciudadId: "riv" });
    const [libros] = construirTabla(mundo, resuelto);
    expect(libros.filas).toHaveLength(60);
    expect(libros.filas[0].totalPersonas).toBe(400);
  });
});

describe("textoDeSincronizacion y la fila del colportor", () => {
  const AHORA = new Date("2026-10-27T15:00:00Z");

  it("«Sincronizó el 22/10 a las 18:30» con la hora de Montevideo", () => {
    expect(textoDeSincronizacion("2026-10-22T21:30:00Z", AHORA)).toBe("Sincronizó el 22/10 a las 18:30");
  });

  it("un dato de otro año lleva el año en la fecha", () => {
    expect(textoDeSincronizacion("2025-12-31T21:30:00Z", AHORA)).toBe("Sincronizó el 31/12/2025 a las 18:30");
    expect(textoDeSincronizacion("2026-01-01T03:00:00Z", AHORA)).toBe("Sincronizó el 01/01 a las 00:00");
  });

  it("sin ningún dato dice que todavía no sincronizó, y una fecha que no es fecha también", () => {
    expect(textoDeSincronizacion(null)).toBe("Todavía no sincronizó");
    expect(textoDeSincronizacion("no es una fecha")).toBe("Todavía no sincronizó");
  });

  it("cada colportor de la fila abierta trae el suyo, también al juntar varias ciudades", () => {
    const d = datos({
      colportores: [
        { ...col("ana", "riv", ex("l1", 2)), ultimoDatoAt: "2026-10-22T21:30:00Z" },
        { ...col("cata", "art", ex("l1", 1)), ultimoDatoAt: null },
        { ...col("dora", null, ex("l1", 4)), ultimoDatoAt: "2026-10-19T12:00:00Z" },
      ],
    });
    const mundo = construirMundo(d, AHORA);
    const resuelto = resolverAmbito(mundo, AMBITO_TODAS);

    expect(construirTabla(mundo, resuelto)[0].filas[0].quien.map((q) => [q.nombre, q.sincronizo])).toEqual([
      ["cata · Artigas", "Todavía no sincronizó"],
      ["ana · Rivera", "Sincronizó el 22/10 a las 18:30"],
      ["dora · Sin ciudad", "Sincronizó el 19/10 a las 09:00"],
    ]);
  });
});
