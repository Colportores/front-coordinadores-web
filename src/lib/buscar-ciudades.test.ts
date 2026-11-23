import { describe, expect, it } from "vitest";

import {
  buscarEnColumna,
  CIUDADES_PARA_BUSCAR,
  coincidenciasPorNombre,
  hayBuscadorDeCiudades,
  ordenarPorNombre,
  textoRecuentoDeCiudades,
  textoSinCoincidencias,
} from "./buscar-ciudades";

const nodo = (clave: string, nombre: string) => ({ clave, nombre });
const ciudades = [nodo("c1", "Salto"), nodo("c2", "Paysandú"), nodo("c3", "Villa Paysandú"), nodo("c4", "Álvarez"), nodo("c5", "Artigas")];

describe("búsqueda de ciudades compartida (#195)", () => {
  it("el campo aparece con más de 8 ciudades", () => {
    expect(hayBuscadorDeCiudades(CIUDADES_PARA_BUSCAR)).toBe(false);
    expect(hayBuscadorDeCiudades(CIUDADES_PARA_BUSCAR + 1)).toBe(true);
  });

  it("ordena de la A a la Z sin mirar tildes, y por id si el nombre se repite", () => {
    const repetidas = [nodo("b", "Colonia"), nodo("a", "Colonia"), nodo("z", "Álamo")];
    expect(ordenarPorNombre(repetidas, (n) => n.clave).map((n) => n.clave)).toEqual(["z", "a", "b"]);
  });

  it("sin texto conserva el orden de la fuente; con texto, primero las que empiezan y después las que contienen", () => {
    expect(coincidenciasPorNombre(ciudades, "  ", (n) => n.clave)).toEqual(ciudades);
    expect(coincidenciasPorNombre(ciudades, "PAYSANDU", (n) => n.clave).map((n) => n.nombre)).toEqual(["Paysandú", "Villa Paysandú"]);
    expect(coincidenciasPorNombre(ciudades, "a", (n) => n.clave).map((n) => n.nombre)).toEqual(["Álvarez", "Artigas", "Paysandú", "Salto", "Villa Paysandú"]);
  });

  it("los textos son los de Ciudades", () => {
    expect(textoSinCoincidencias(" zzz ")).toBe("Ninguna ciudad de la campaña coincide con «zzz». Revisá lo escrito o borralo para ver todas.");
    expect(textoRecuentoDeCiudades(3, 150, false)).toBe("150 ciudades");
    expect(textoRecuentoDeCiudades(3, 150, true)).toBe("3 de 150 ciudades");
  });

  describe("buscarEnColumna", () => {
    const todas = nodo("todas", "Todas las ciudades");
    const depto = nodo("departamento:Salto", "Todo el departamento");
    const nodos = [todas, depto, ...ciudades];
    const esCiudad = (n: { clave: string }) => n.clave.startsWith("c");

    it("«Todas» y el ámbito elegido siempre se ven; los ámbitos que no son ciudad no se buscan por nombre", () => {
      const vista = buscarEnColumna(nodos, esCiudad, "todo", "todas");
      expect(vista.total).toBe(5);
      expect(vista.coinciden).toEqual([]);
      expect(vista.visibles).toEqual([todas]);
      expect(buscarEnColumna(nodos, esCiudad, "todo", "departamento:Salto").visibles).toEqual([todas, depto]);
    });

    it("la elegida va primero entre los resultados, sin repetirse si también coincide", () => {
      expect(buscarEnColumna(nodos, esCiudad, "paysandu", "c1").visibles.map((n) => n.clave)).toEqual(["todas", "c1", "c2", "c3"]);
      expect(buscarEnColumna(nodos, esCiudad, "paysandu", "c3").visibles.map((n) => n.clave)).toEqual(["todas", "c3", "c2"]);
    });

    it("una elegida que ya no existe no rompe", () => {
      expect(buscarEnColumna(nodos, esCiudad, "salto", "c99").visibles.map((n) => n.clave)).toEqual(["todas", "c1"]);
    });
  });
});
