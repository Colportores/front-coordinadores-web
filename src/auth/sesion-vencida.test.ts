import { afterEach, describe, expect, it } from "vitest";

import { marcaDeRechazo, mensajeDeRechazo, motivoDelRechazo, rutaParaVolverAEntrar } from "@/auth/sesion-vencida";

describe("el panel le cierra la puerta con la pantalla abierta (#41, P3)", () => {
  afterEach(() => window.history.pushState({}, "", "/"));

  it.each(["vencida", "sin-acceso", "suspendida"] as const)("reconoce el rechazo del proxy con el motivo «%s»", (motivo) => {
    expect(motivoDelRechazo(new Error(marcaDeRechazo(motivo)))).toBe(motivo);
  });

  it("no toma por rechazo una caída, un texto parecido ni algo que no es un error", () => {
    expect(motivoDelRechazo(new Error("An unexpected response was received from the server."))).toBeNull();
    expect(motivoDelRechazo(new Error(`${marcaDeRechazo("vencida")} y más`))).toBeNull();
    expect(motivoDelRechazo(new Error("panel-acceso:no-disponible"))).toBeNull();
    expect(motivoDelRechazo(new TypeError("Failed to fetch"))).toBeNull();
    expect(motivoDelRechazo(marcaDeRechazo("vencida"))).toBeNull();
    expect(motivoDelRechazo(null)).toBeNull();
  });

  it("«Tu sesión venció.» solo si venció; con «sin acceso» o «suspendida» no se dice lo que no pasó", () => {
    expect(mensajeDeRechazo("vencida")).toBe("Tu sesión venció. Volvé a entrar para seguir.");
    expect(mensajeDeRechazo("sin-acceso")).toBe("Volvé a entrar para seguir.");
    expect(mensajeDeRechazo("suspendida")).toBe("Volvé a entrar para seguir.");
  });

  describe("a dónde lleva «Entrar de nuevo»", () => {
    it("la sesión vencida vuelve a la pantalla de donde se vino", () => {
      window.history.pushState({}, "", "/equipo/anadir?x=1");

      expect(rutaParaVolverAEntrar("vencida")).toBe("/acceso?motivo=vencida&siguiente=%2Fequipo%2Fanadir%3Fx%3D1");
    });

    it("desde la pantalla inicial no repite el destino por defecto", () => {
      window.history.pushState({}, "", "/inicio");

      expect(rutaParaVolverAEntrar("vencida")).toBe("/acceso?motivo=vencida");
    });

    it("«sin acceso» y «suspendida» no vuelven a la pantalla de antes: la cuenta no sirve para el panel", () => {
      window.history.pushState({}, "", "/equipo/anadir");

      expect(rutaParaVolverAEntrar("sin-acceso")).toBe("/acceso?motivo=sin-acceso");
      expect(rutaParaVolverAEntrar("suspendida")).toBe("/acceso?motivo=suspendida");
    });
  });
});
