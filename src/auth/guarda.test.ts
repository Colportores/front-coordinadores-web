import { describe, expect, it } from "vitest";

import { decidirGuarda, destinoSeguro, motivoDeAccesoValido, rutaDeAcceso } from "@/auth/guarda";

describe("destinoSeguro", () => {
  it("deja pasar una ruta del panel, con su consulta", () => {
    expect(destinoSeguro("/equipo")).toBe("/equipo");
    expect(destinoSeguro("/equipo/anadir?q=ana")).toBe("/equipo/anadir?q=ana");
    expect(destinoSeguro("/ciudades#mapa")).toBe("/ciudades");
  });

  it("todo lo que no es una ruta propia vuelve a la pantalla inicial", () => {
    for (const malo of [
      undefined,
      null,
      42,
      "",
      "equipo",
      "//sitio.malo",
      "///sitio.malo",
      "https://sitio.malo",
      "javascript:alert(1)",
      "/\\sitio.malo",
      "/equipo\n/otro",
      "/equipo\u0000",
      "/" + "a".repeat(600),
    ]) {
      expect(destinoSeguro(malo), String(malo)).toBe("/inicio");
    }
  });

  it("no vuelve a la pantalla de acceso: sería un círculo", () => {
    expect(destinoSeguro("/acceso")).toBe("/inicio");
    expect(destinoSeguro("/acceso?motivo=cerrada")).toBe("/inicio");
    expect(destinoSeguro("/acceso/otra")).toBe("/inicio");
    expect(destinoSeguro("/accesorios")).toBe("/accesorios");
  });
});

describe("rutaDeAcceso", () => {
  it("sin nada, la pantalla de siempre", () => {
    expect(rutaDeAcceso(null)).toBe("/acceso");
  });

  it("lleva el motivo y el destino, solo si el destino no es el inicial", () => {
    expect(rutaDeAcceso("vencida", "/equipo")).toBe("/acceso?motivo=vencida&siguiente=%2Fequipo");
    expect(rutaDeAcceso("cerrada", "/inicio")).toBe("/acceso?motivo=cerrada");
    expect(rutaDeAcceso(null, "/ciudades")).toBe("/acceso?siguiente=%2Fciudades");
  });

  it("un destino ajeno no sale en la URL", () => {
    expect(rutaDeAcceso("vencida", "//sitio.malo")).toBe("/acceso?motivo=vencida");
  });
});

describe("motivoDeAccesoValido", () => {
  it("solo conoce los cuatro motivos del canvas", () => {
    for (const m of ["vencida", "sin-acceso", "no-disponible", "cerrada"]) expect(motivoDeAccesoValido(m)).toBe(m);
    for (const m of ["otro", "", undefined, null, 3, ["cerrada"]]) expect(motivoDeAccesoValido(m)).toBeNull();
  });
});

describe("decidirGuarda", () => {
  it("cada resultado de la comprobación lleva a su pantalla", () => {
    expect(decidirGuarda({ tipo: "ok", usuarioId: "u" })).toEqual({ tipo: "pasar" });
    expect(decidirGuarda({ tipo: "sin-sesion" })).toEqual({ tipo: "a-acceso", motivo: null });
    expect(decidirGuarda({ tipo: "sesion-vencida" })).toEqual({ tipo: "a-acceso", motivo: "vencida" });
    expect(decidirGuarda({ tipo: "sin-acceso" })).toEqual({ tipo: "a-acceso", motivo: "sin-acceso" });
    expect(decidirGuarda({ tipo: "no-disponible" })).toEqual({ tipo: "a-acceso", motivo: "no-disponible" });
  });
});
