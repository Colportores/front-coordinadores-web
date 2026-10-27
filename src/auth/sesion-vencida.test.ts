import { afterEach, describe, expect, it } from "vitest";

import { esSesionVencida, MARCA_SESION_VENCIDA, rutaParaVolverAEntrar } from "@/auth/sesion-vencida";

describe("sesión vencida con la pantalla abierta (#41, P3)", () => {
  afterEach(() => window.history.pushState({}, "", "/"));

  it("reconoce el rechazo del proxy y nada más: ni una caída ni un texto parecido", () => {
    expect(esSesionVencida(new Error(MARCA_SESION_VENCIDA))).toBe(true);
    expect(esSesionVencida(new Error("An unexpected response was received from the server."))).toBe(false);
    expect(esSesionVencida(new Error(`${MARCA_SESION_VENCIDA} y más`))).toBe(false);
    expect(esSesionVencida(new TypeError("Failed to fetch"))).toBe(false);
    expect(esSesionVencida(MARCA_SESION_VENCIDA)).toBe(false);
    expect(esSesionVencida(null)).toBe(false);
  });

  it("lleva a la pantalla de acceso con el motivo y vuelve a la pantalla de donde se vino", () => {
    window.history.pushState({}, "", "/equipo/anadir?x=1");

    expect(rutaParaVolverAEntrar()).toBe("/acceso?motivo=vencida&siguiente=%2Fequipo%2Fanadir%3Fx%3D1");
  });

  it("desde la pantalla inicial no repite el destino por defecto", () => {
    window.history.pushState({}, "", "/inicio");

    expect(rutaParaVolverAEntrar()).toBe("/acceso?motivo=vencida");
  });
});
