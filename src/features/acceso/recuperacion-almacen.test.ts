import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ESPERA_ENTRE_PEDIDOS_MS,
  esperaRestanteMs,
  guardarCorreoAPedir,
  guardarUltimoEnvio,
  leerCorreoAPedir,
  leerUltimoEnvio,
} from "@/features/acceso/recuperacion-almacen";

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("el correo que pasa del login a «Olvidé mi contraseña»", () => {
  it("se guarda en la pestaña y se puede vaciar", () => {
    guardarCorreoAPedir("marta@correo.com");
    expect(leerCorreoAPedir()).toBe("marta@correo.com");
    guardarCorreoAPedir("");
    expect(leerCorreoAPedir()).toBe("");
  });

  it("sin almacenamiento (modo privado) no rompe y sale vacío", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    expect(() => guardarCorreoAPedir("a@b.co")).not.toThrow();
    expect(() => guardarUltimoEnvio(1)).not.toThrow();
    expect(leerCorreoAPedir()).toBe("");
    expect(leerUltimoEnvio()).toBe(0);
  });
});

describe("la espera entre pedidos", () => {
  it("la hora guardada sobrevive: se lee igual", () => {
    expect(leerUltimoEnvio()).toBe(0);
    guardarUltimoEnvio(1_000_000);
    expect(leerUltimoEnvio()).toBe(1_000_000);
  });

  it("una hora guardada que no es un número no cuenta", () => {
    window.localStorage.setItem("panel-recuperacion-ultimo-envio", "basura");
    expect(leerUltimoEnvio()).toBe(0);
  });

  it("falta lo que resta de los 60 s, y nada si ya pasaron o nunca se pidió", () => {
    expect(esperaRestanteMs(0, 5_000)).toBe(0);
    expect(esperaRestanteMs(1_000, 21_000)).toBe(40_000);
    expect(esperaRestanteMs(1_000, 1_000 + ESPERA_ENTRE_PEDIDOS_MS)).toBe(0);
    expect(esperaRestanteMs(1_000, 100_000)).toBe(0);
  });

  it("una hora guardada en el futuro (el reloj se atrasó) espera 60 s como máximo", () => {
    expect(esperaRestanteMs(10_000_000, 1_000)).toBe(ESPERA_ENTRE_PEDIDOS_MS);
  });
});
