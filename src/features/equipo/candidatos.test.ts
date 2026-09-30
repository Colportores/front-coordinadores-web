import { describe, expect, it } from "vitest";

import { DATOS_ANADIR_COLPORTOR_SIMULADO } from "@/datos/equipo/simulado";
import {
  ayudaBloqueo,
  buscarCandidatos,
  fechaCorta,
  iniciales,
  MAX_SUGERIDOS,
  motivoBloqueo,
  sugeridos,
} from "@/features/equipo/candidatos";

const { candidatos } = DATOS_ANADIR_COLPORTOR_SIMULADO;
const porId = (id: string) => {
  const c = candidatos.find((x) => x.id === id);
  if (!c) throw new Error(`falta ${id}`);
  return c;
};

describe("candidatos", () => {
  describe("sugeridos", () => {
    it("trae solo pendientes sin campaña, de la cuenta más nueva a la más antigua", () => {
      expect(sugeridos(candidatos).map((c) => c.nombre)).toEqual([
        "Rodrigo Barrios",
        "Valentina Bentancor",
        "Gonzalo Sosa",
        "Ana Martínez",
      ]);
    });

    it("con la misma fecha de creación desempata por id, siempre igual", () => {
      const mismoDia = ["c", "a", "b"].map((id) => ({ ...porId("usr-ana-martinez"), id, cuentaCreada: "2026-09-10" }));
      expect(sugeridos(mismoDia).map((c) => c.id)).toEqual(["a", "b", "c"]);
      expect(sugeridos([...mismoDia].reverse()).map((c) => c.id)).toEqual(["a", "b", "c"]);
    });

    it(`se limita a ${MAX_SUGERIDOS}`, () => {
      const muchos = Array.from({ length: 8 }, (_, i) => ({
        ...porId("usr-ana-martinez"),
        id: `x${i}`,
        cuentaCreada: `2026-09-0${i + 1}`,
      }));
      expect(sugeridos(muchos)).toHaveLength(MAX_SUGERIDOS);
      // Quedan fuera las tres más antiguas: entran las 5 más nuevas.
      expect(sugeridos(muchos).map((c) => c.id)).toEqual(["x7", "x6", "x5", "x4", "x3"]);
    });
  });

  describe("buscarCandidatos", () => {
    it("busca por nombre o por email, sin distinguir mayúsculas ni tildes", () => {
      expect(buscarCandidatos(candidatos, "ANA").map((c) => c.nombre)).toEqual([
        "Ana Martínez",
        "Anabel Pereira",
        "Mariana Olivera",
      ]);
      expect(buscarCandidatos(candidatos, "vbentancor@").map((c) => c.nombre)).toEqual(["Valentina Bentancor"]);
      expect(buscarCandidatos(candidatos, "martinez").map((c) => c.nombre)).toEqual(["Ana Martínez"]);
    });

    it("incluye las suspendidas y las de otra campaña, en el orden del artboard B · 03 (Silva, bloqueado, antes que Barrios)", () => {
      expect(buscarCandidatos(candidatos, "rodrigo").map((c) => c.nombre)).toEqual(["Rodrigo Silva", "Rodrigo Barrios"]);
    });

    it("sin texto no devuelve nada", () => {
      expect(buscarCandidatos(candidatos, "  ")).toEqual([]);
    });
  });

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
  });

  it("iniciales y fechaCorta", () => {
    expect(iniciales("Ana Martínez")).toBe("AM");
    expect(iniciales("Cher")).toBe("C");
    expect(fechaCorta("2026-09-22")).toBe("22/09/2026");
  });
});
