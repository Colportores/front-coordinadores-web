import { describe, expect, it } from "vitest";

import type { Esquina, FormaZona, Punto } from "@/datos/equipo/zonas/contrato";
import { distanciaM, vertices } from "@/datos/equipo/zonas/geometria";
import { DATOS_ZONAS_SIMULADO, fuenteZonasSimulada } from "@/datos/equipo/zonas/simulado";

const MONTEVIDEO = DATOS_ZONAS_SIMULADO.ciudades[0];
const ORIGEN = (MONTEVIDEO.zonas[0].esquinas as Esquina[])[0];
const nodo = (v: number, h: number): Punto => ({ lon: ORIGEN.lon + v * 0.0045, lat: ORIGEN.lat - h * 0.004 });

/** Muy al este de la grilla: se engancha al cruce del borde. */
const PUNTO_LEJANO: Punto = { lon: nodo(0, 0).lon + 0.2, lat: nodo(0, 0).lat - 0.001 };

async function esquinasEn(...cruces: [number, number][]): Promise<Esquina[]> {
  return Promise.all(cruces.map(([v, h]) => fuenteZonasSimulada.esquinaMasCercana(MONTEVIDEO.id, nodo(v, h))));
}

async function formaPorEsquinas(...cruces: [number, number][]): Promise<FormaZona> {
  return { tipoForma: "ESQUINAS", esquinas: await esquinasEn(...cruces), cerrada: true };
}

describe("fuenteZonasSimulada", () => {
  describe("datos", () => {
    it("trae la campaña con tres ciudades: Montevideo con 4 zonas, Las Piedras con 2 y Canelones sin zonas", async () => {
      const datos = await fuenteZonasSimulada.obtenerZonas();

      expect(datos.campania).toBe("Verano 2026");
      expect(datos.ciudades.map((c) => [c.nombre, c.zonas.length])).toEqual([
        ["Montevideo", 4],
        ["Las Piedras", 2],
        ["Canelones", 0],
      ]);
    });

    it("cada zona trae un polígono cerrado y sus colportores figuran con esa zona", () => {
      for (const zona of MONTEVIDEO.zonas) {
        const anillo = zona.poligonoGeojson.coordinates[0];
        expect(anillo.at(0)).toEqual(anillo.at(-1));
        for (const c of zona.colportores) {
          expect(MONTEVIDEO.colportores.find((p) => p.id === c.id)?.zonaId).toBe(zona.id);
        }
      }
    });

    it("una zona radial trae centro y radio; una por esquinas, sus esquinas con las dos calles", () => {
      const radial = MONTEVIDEO.zonas.find((z) => z.tipoForma === "RADIAL");
      expect(radial?.radioM).toBe(600);
      expect(radial?.centro).toBeDefined();
      const belvedere = MONTEVIDEO.zonas.find((z) => z.nombre === "Belvedere");
      expect(belvedere?.esquinas).toHaveLength(4);
      expect(belvedere?.esquinas?.every((e) => e.calleA && e.calleB)).toBe(true);
    });

    it("Pablo Ferreira es el único colportor sin zona", () => {
      expect(MONTEVIDEO.colportores.filter((c) => c.zonaId === null).map((c) => c.nombre)).toEqual(["Pablo Ferreira"]);
    });
  });

  describe("esquinaMasCercana", () => {
    it("engancha un punto cercano al cruce de calles y devuelve las dos calles", async () => {
      const cerca = { lon: nodo(3, 3).lon + 0.0004, lat: nodo(3, 3).lat - 0.0003 };
      const esquina = await fuenteZonasSimulada.esquinaMasCercana(MONTEVIDEO.id, cerca);

      expect(esquina).toMatchObject({ calleA: "Pororó", calleB: "Egipto", lon: nodo(3, 3).lon, lat: nodo(3, 3).lat });
    });

    it("un punto fuera de la grilla se engancha al cruce más cercano del borde", async () => {
      const esquina = await fuenteZonasSimulada.esquinaMasCercana(MONTEVIDEO.id, PUNTO_LEJANO);
      expect(esquina.calleB).toBe("Viacaba");
    });

    it("una ciudad inexistente falla", async () => {
      await expect(fuenteZonasSimulada.esquinaMasCercana("no-existe", ORIGEN)).rejects.toThrow("Ciudad simulada inexistente");
    });
  });

  describe("tramoPorCalles", () => {
    it("va por la calle horizontal de una esquina y después por la vertical de la otra, pasando por cada cruce", async () => {
      const tramo = await fuenteZonasSimulada.tramoPorCalles(MONTEVIDEO.id, nodo(3, 3), nodo(5, 4));

      expect(tramo.map((p) => [Math.round((p.lon - ORIGEN.lon) / 0.0045), Math.round((ORIGEN.lat - p.lat) / 0.004)])).toEqual([
        [3, 3],
        [4, 3],
        [5, 3],
        [5, 4],
      ]);
    });

    it("entre una esquina y sí misma es solo esa esquina", async () => {
      const tramo = await fuenteZonasSimulada.tramoPorCalles(MONTEVIDEO.id, nodo(2, 2), nodo(2, 2));
      expect(tramo).toHaveLength(1);
    });
  });

  describe("vistaPreviaZona", () => {
    it("un círculo de 400 m incluye unas 28 ubicaciones y no toca a nadie", async () => {
      const vista = await fuenteZonasSimulada.vistaPreviaZona({
        ciudadId: MONTEVIDEO.id,
        forma: { tipoForma: "RADIAL", centro: nodo(3, 3.4), radioM: 400 },
      });

      expect(vista.ubicacionesIncluidas).toBeGreaterThan(20);
      expect(vista.ubicacionesIncluidas).toBeLessThan(40);
      expect(vista.superposicion).toBeNull();
      expect(vista.comparteCalle).toBeNull();
      expect(vista.ubicacionesQueCambian).toBe(0);
      expect(vertices(vista.poligonoGeojson).every((v) => Math.abs(distanciaM(nodo(3, 3.4), v) - 400) < 1)).toBe(true);
    });

    it("un círculo sobre una zona existente se superpone y devuelve el tramo en conflicto", async () => {
      const vista = await fuenteZonasSimulada.vistaPreviaZona({
        ciudadId: MONTEVIDEO.id,
        forma: { tipoForma: "RADIAL", centro: nodo(1, 3.5), radioM: 300 },
      });

      expect(vista.superposicion?.zonaNombre).toBe("Belvedere");
      expect(vista.superposicion?.tramo.length).toBeGreaterThan(1);
    });

    it("una zona por esquinas que solo comparte una calle no se superpone y avisa qué calle comparte", async () => {
      const vista = await fuenteZonasSimulada.vistaPreviaZona({
        ciudadId: MONTEVIDEO.id,
        forma: await formaPorEsquinas([2, 3], [3, 3], [3, 4], [2, 4]),
      });

      expect(vista.superposicion).toBeNull();
      expect(vista.comparteCalle).toMatchObject({ calle: "Heredia", zonaNombre: "Belvedere" });
    });

    it("una zona por esquinas que entra en otra se superpone", async () => {
      const vista = await fuenteZonasSimulada.vistaPreviaZona({
        ciudadId: MONTEVIDEO.id,
        forma: await formaPorEsquinas([1, 3], [3, 3], [3, 4], [1, 4]),
      });

      expect(vista.superposicion?.zonaNombre).toBe("Belvedere");
      expect(vista.comparteCalle).toBeNull();
    });

    it("al editar, la zona no se superpone consigo misma y cuenta cuántas ubicaciones cambian", async () => {
      const arena = MONTEVIDEO.zonas.find((z) => z.nombre === "Paso de la Arena");
      if (!arena?.centro) throw new Error("falta la zona radial");

      const igual = await fuenteZonasSimulada.vistaPreviaZona({
        ciudadId: MONTEVIDEO.id,
        zonaId: arena.id,
        forma: { tipoForma: "RADIAL", centro: arena.centro, radioM: 600 },
      });
      const achicada = await fuenteZonasSimulada.vistaPreviaZona({
        ciudadId: MONTEVIDEO.id,
        zonaId: arena.id,
        forma: { tipoForma: "RADIAL", centro: arena.centro, radioM: 300 },
      });

      expect(igual.superposicion).toBeNull();
      expect(igual.ubicacionesQueCambian).toBe(0);
      expect(achicada.superposicion).toBeNull();
      expect(achicada.ubicacionesQueCambian).toBeGreaterThan(30);
    });

    it("una forma incompleta no se puede calcular", async () => {
      await expect(
        fuenteZonasSimulada.vistaPreviaZona({ ciudadId: MONTEVIDEO.id, forma: { tipoForma: "ESQUINAS", esquinas: [], cerrada: false } }),
      ).rejects.toThrow("La forma todavía no está completa.");
    });
  });

  describe("guardarZona", () => {
    const radial: FormaZona = { tipoForma: "RADIAL", centro: nodo(3, 3.4), radioM: 400 };

    it("devuelve la zona con su polígono, su color y sin colportores", async () => {
      const resultado = await fuenteZonasSimulada.guardarZona({ ciudadId: MONTEVIDEO.id, nombre: "  Casabó ", forma: radial });

      expect(resultado.ok).toBe(true);
      if (resultado.ok) {
        expect(resultado.zona).toMatchObject({ nombre: "Casabó", tipoForma: "RADIAL", radioM: 400, colportores: [] });
        expect(resultado.zona.color).toMatch(/^#[0-9A-F]{6}$/);
      }
    });

    it("rechaza un nombre vacío o repetido en la ciudad, sin importar mayúsculas", async () => {
      const vacio = await fuenteZonasSimulada.guardarZona({ ciudadId: MONTEVIDEO.id, nombre: "  ", forma: radial });
      const repetido = await fuenteZonasSimulada.guardarZona({ ciudadId: MONTEVIDEO.id, nombre: "BELVEDERE", forma: radial });

      expect(vacio).toEqual({ ok: false, mensaje: "Poné un nombre para la zona." });
      expect(repetido).toEqual({ ok: false, mensaje: "Ya hay una zona llamada «BELVEDERE» en Montevideo." });
    });

    it("rechaza una superposición diciendo con quién", async () => {
      const resultado = await fuenteZonasSimulada.guardarZona({
        ciudadId: MONTEVIDEO.id,
        nombre: "Nueva",
        forma: await formaPorEsquinas([1, 3], [3, 3], [3, 4], [1, 4]),
      });

      expect(resultado).toEqual({
        ok: false,
        mensaje: "Esta zona se superpone con «Belvedere». Ajustá el borde para que solo compartan la calle.",
      });
    });

    it("al editar conserva el id, el color y los colportores, y permite el mismo nombre", async () => {
      const cerro = MONTEVIDEO.zonas[0];
      const resultado = await fuenteZonasSimulada.guardarZona({
        ciudadId: MONTEVIDEO.id,
        zonaId: cerro.id,
        nombre: cerro.nombre,
        forma: { tipoForma: "ESQUINAS", esquinas: cerro.esquinas, cerrada: true },
      });

      expect(resultado.ok).toBe(true);
      if (resultado.ok) expect(resultado.zona).toMatchObject({ id: cerro.id, color: cerro.color, colportores: cerro.colportores });
    });
  });

  it("asignarZona responde que está bien (simulado, no persiste)", async () => {
    expect(await fuenteZonasSimulada.asignarZona("campania-verano-2026", "col-5", "zona-belvedere")).toEqual({ ok: true });
  });
});
