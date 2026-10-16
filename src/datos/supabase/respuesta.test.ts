import { describe, expect, it } from "vitest";

import {
  booleano,
  cadena,
  cadenaONula,
  filas,
  lista,
  listaDeObjetos,
  nombreVisible,
  numero,
  objeto,
  RespuestaInesperada,
  UUID,
} from "@/datos/supabase/respuesta";

describe("lectura de la respuesta de una RPC", () => {
  it("UUID acepta un uuid con mayúsculas o minúsculas y nada más", () => {
    expect(UUID.test("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(UUID.test("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA")).toBe(true);
    expect(UUID.test("montevideo")).toBe(false);
    expect(UUID.test("")).toBe(false);
    expect(UUID.test("11111111-1111-4111-8111-111111111111 ")).toBe(false);
  });

  it("filas deja pasar una lista de objetos, vacía incluida, y rechaza cualquier otra cosa", () => {
    expect(filas("rpc", [])).toEqual([]);
    expect(filas("rpc", [{ a: 1 }])).toEqual([{ a: 1 }]);
    for (const mala of [null, undefined, {}, "x", [1], [[]], [null]]) {
      expect(() => filas("rpc", mala)).toThrow(RespuestaInesperada);
    }
  });

  it("objeto deja pasar un objeto y rechaza listas, null y primitivos", () => {
    expect(objeto("rpc", { a: 1 })).toEqual({ a: 1 });
    for (const malo of [null, undefined, [], "x", 3]) {
      expect(() => objeto("rpc", malo)).toThrow(RespuestaInesperada);
    }
  });

  it("el error nombra la RPC y el campo, para encontrar el cambio de contrato", () => {
    expect(() => cadena("zonas_de_ciudad", { nombre: 3 }, "nombre")).toThrow(/zonas_de_ciudad.*`nombre`/);
  });

  it("cadena exige un texto; cadenaONula acepta además null y la ausencia del campo", () => {
    expect(cadena("rpc", { c: "" }, "c")).toBe("");
    expect(() => cadena("rpc", { c: null }, "c")).toThrow(RespuestaInesperada);
    expect(() => cadena("rpc", {}, "c")).toThrow(RespuestaInesperada);
    expect(cadenaONula("rpc", { c: "x" }, "c")).toBe("x");
    expect(cadenaONula("rpc", { c: null }, "c")).toBeNull();
    expect(cadenaONula("rpc", {}, "c")).toBeNull();
    expect(() => cadenaONula("rpc", { c: 1 }, "c")).toThrow(RespuestaInesperada);
  });

  it("numero exige un número finito: ni texto, ni NaN, ni infinito, ni null", () => {
    expect(numero("rpc", { n: 0 }, "n")).toBe(0);
    expect(numero("rpc", { n: -34.87 }, "n")).toBe(-34.87);
    for (const malo of ["1", NaN, Infinity, null, undefined]) {
      expect(() => numero("rpc", { n: malo }, "n")).toThrow(RespuestaInesperada);
    }
  });

  it("booleano exige verdadero o falso", () => {
    expect(booleano("rpc", { b: false }, "b")).toBe(false);
    for (const malo of ["true", 1, null, undefined]) {
      expect(() => booleano("rpc", { b: malo }, "b")).toThrow(RespuestaInesperada);
    }
  });

  it("lista y listaDeObjetos exigen una lista, y la segunda que cada elemento sea un objeto", () => {
    expect(lista("rpc", { l: [1, "a"] }, "l")).toEqual([1, "a"]);
    expect(() => lista("rpc", { l: null }, "l")).toThrow(RespuestaInesperada);
    expect(listaDeObjetos("rpc", { l: [{ a: 1 }] }, "l")).toEqual([{ a: 1 }]);
    expect(listaDeObjetos("rpc", { l: [] }, "l")).toEqual([]);
    expect(() => listaDeObjetos("rpc", { l: [{ a: 1 }, 2] }, "l")).toThrow(RespuestaInesperada);
    expect(() => listaDeObjetos("rpc", { l: "x" }, "l")).toThrow(RespuestaInesperada);
  });

  it("nombreVisible junta nombre y apellido, recorta y usa la alternativa si no queda nada", () => {
    expect(nombreVisible("Ana", "Martínez", "ana@example.com")).toBe("Ana Martínez");
    expect(nombreVisible("Ana", "", "ana@example.com")).toBe("Ana");
    expect(nombreVisible("", "Martínez", "ana@example.com")).toBe("Martínez");
    expect(nombreVisible(" ", "  ", "ana@example.com")).toBe("ana@example.com");
    expect(nombreVisible("", "", "Cuenta sin nombre")).toBe("Cuenta sin nombre");
  });
});
