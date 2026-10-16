import { describe, expect, it } from "vitest";

import { CANDIDATOS_SIMULADOS } from "@/datos/equipo/simulado";
import {
  ayudaBloqueo,
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

    it("la suspensión gana sobre la otra campaña, como en el servidor (`motivo_rechazo_inscripcion()`)", () => {
      const ambas = { ...porId("usr-mariana-olivera"), campaniaActual: "Otoño Norte" };
      expect(motivoBloqueo(ambas)).toBe("Cuenta suspendida. Pedí a un administrador que la reactive para añadirla.");
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
