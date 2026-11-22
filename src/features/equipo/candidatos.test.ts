import { describe, expect, it } from "vitest";

import { CANDIDATOS_SIMULADOS } from "@/datos/equipo/simulado";
import {
  avisoRol,
  ayudaBloqueo,
  etiquetaRol,
  fechaCorta,
  iniciales,
  MAX_CARACTERES_TITULO,
  motivoBloqueo,
  recortarConPuntos,
} from "@/features/equipo/candidatos";

const porId = (id: string) => {
  const c = CANDIDATOS_SIMULADOS.find((x) => x.id === id);
  if (!c) throw new Error(`falta ${id}`);
  return c;
};

describe("candidatos", () => {
  describe("motivoBloqueo y ayudaBloqueo", () => {
    it("no bloquea a una pendiente ni a una activa sin campaña", () => {
      expect(motivoBloqueo(porId("usr-ana-martinez"))).toBeNull();
      expect(motivoBloqueo(porId("usr-anabel-pereira"))).toBeNull();
      expect(ayudaBloqueo(porId("usr-ana-martinez"))).toBeNull();
    });

    it("explica la suspensión", () => {
      expect(motivoBloqueo(porId("usr-mariana-olivera"))).toBe(
        "Cuenta suspendida. Pedí a un administrador que la reactive para añadirla.",
      );
      expect(ayudaBloqueo(porId("usr-mariana-olivera"))).toBe("Pedile a un administrador que la reactive.");
    });

    it("explica que está en otra campaña", () => {
      expect(motivoBloqueo(porId("usr-rodrigo-silva"))).toBe("Está en campaña Otoño Norte. Reasignar primero.");
      expect(ayudaBloqueo(porId("usr-rodrigo-silva"))).toBe("Pedile al coordinador de Otoño Norte que lo libere.");
    });

    it("una cuenta en una campaña en curso no se bloquea si la base la deja añadir a esta (destino por empezar, 0058)", () => {
      const repite = { ...porId("usr-rodrigo-silva"), enOtraCampania: false };
      expect(repite.campaniaActual).toBe("Otoño Norte");
      expect(motivoBloqueo(repite)).toBeNull();
      expect(ayudaBloqueo(repite)).toBeNull();
    });

    it("bloqueada por otra campaña del mismo momento que la base no nombra: no inventa un nombre", () => {
      const sinNombre = { ...porId("usr-rodrigo-silva"), campaniaActual: null, enOtraCampania: true };
      expect(motivoBloqueo(sinNombre)).toBe("Está en otra campaña. Reasignar primero.");
      expect(ayudaBloqueo(sinNombre)).toBe("Pedile al coordinador de la otra campaña que lo libere.");
    });

    it("la suspensión gana sobre la otra campaña, como en el servidor (`motivo_rechazo_inscripcion()`)", () => {
      const ambas = { ...porId("usr-mariana-olivera"), campaniaActual: "Otoño Norte", enOtraCampania: true };
      expect(motivoBloqueo(ambas)).toBe("Cuenta suspendida. Pedí a un administrador que la reactive para añadirla.");
    });
  });

  describe("etiquetaRol y avisoRol (cuenta de coordinación o de administración, decisión del 11/11)", () => {
    it("la cuenta de un colportor no lleva etiqueta ni aviso", () => {
      expect(etiquetaRol(porId("usr-ana-martinez"))).toBeNull();
      expect(avisoRol(porId("usr-ana-martinez"))).toBeNull();
    });

    it("la de coordinación dice «Coordinador» y avisa que no es de un colportor", () => {
      expect(etiquetaRol(porId("usr-tomas-ibarra"))).toBe("Coordinador");
      expect(avisoRol(porId("usr-tomas-ibarra"))).toBe("Esta cuenta es de coordinación, no de un colportor.");
    });

    it("la de administración dice «Administración»", () => {
      expect(etiquetaRol(porId("usr-marta-rivas"))).toBe("Administración");
      expect(avisoRol(porId("usr-marta-rivas"))).toBe("Esta cuenta es de administración, no de un colportor.");
    });

    it("el rol no bloquea: se puede añadir (HU-CAM-004, 02/10)", () => {
      expect(motivoBloqueo(porId("usr-tomas-ibarra"))).toBeNull();
      expect(motivoBloqueo(porId("usr-marta-rivas"))).toBeNull();
    });
  });

  it("iniciales y fechaCorta", () => {
    expect(iniciales("Ana Martínez")).toBe("AM");
    expect(iniciales("Cher")).toBe("C");
    expect(fechaCorta("2026-09-22")).toBe("22/09/2026");
  });

  it("iniciales toma caracteres enteros: un emoji no se parte (se vio como «A�»)", () => {
    expect(iniciales("Ana 🌳 Núñez")).toBe("A🌳");
    expect(iniciales("🌳 Ana")).toBe("🌳A");
    expect(iniciales("🌳🌳")).toBe("🌳");
    expect(iniciales("   ")).toBe("");
  });

  describe("recortarConPuntos", () => {
    it("deja igual lo que entra en el máximo, incluido el justo", () => {
      expect(recortarConPuntos("abc", 3)).toBe("abc");
      expect(recortarConPuntos("", 3)).toBe("");
    });

    it("corta en el máximo y marca con «…»", () => {
      expect(recortarConPuntos("abcd", 3)).toBe("abc…");
      expect(recortarConPuntos("x".repeat(5000), MAX_CARACTERES_TITULO)).toBe(`${"x".repeat(MAX_CARACTERES_TITULO)}…`);
    });

    it("cuenta caracteres, no unidades UTF-16: no parte un emoji ni deja de contarlo", () => {
      expect(recortarConPuntos("🌳🌳🌳", 3)).toBe("🌳🌳🌳");
      expect(recortarConPuntos("🌳🌳🌳🌳", 3)).toBe("🌳🌳🌳…");
    });

    it("no deja un espacio antes de los puntos", () => {
      expect(recortarConPuntos("ana  perez", 4)).toBe("ana…");
    });
  });
});
