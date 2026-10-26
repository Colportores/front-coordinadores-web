import { describe, expect, it } from "vitest";

import { fechaCompleta, nombreDeArchivo } from "./contexto";

describe("nombreDeArchivo", () => {
  it("dice qué se mira, cómo se agrupó y el día", () => {
    expect(nombreDeArchivo("Rivera", "semana", "2026-10-21", "csv")).toBe("reportes-rivera-semanas-2026-10-21.csv");
    expect(nombreDeArchivo("Todas las ciudades", "dia", "2026-10-21", "pdf")).toBe("reportes-todas-las-ciudades-dias-2026-10-21.pdf");
    expect(nombreDeArchivo("Departamento Artigas", "mes", "2026-10-21", "csv")).toBe("reportes-departamento-artigas-meses-2026-10-21.csv");
  });

  it("sin tildes, sin espacios y sin caracteres que un sistema de archivos rechace", () => {
    expect(nombreDeArchivo("Bella Unión", "semana", "2026-10-21", "csv")).toBe("reportes-bella-union-semanas-2026-10-21.csv");
    expect(nombreDeArchivo('Ana/Beto: "el\\mejor" <colportor>?', "semana", "2026-10-21", "csv")).toBe(
      "reportes-ana-beto-el-mejor-colportor-semanas-2026-10-21.csv",
    );
  });

  it("un nombre larguísimo se acorta", () => {
    const nombre = nombreDeArchivo("María de los Ángeles ".repeat(20), "semana", "2026-10-21", "pdf");
    expect(nombre.length).toBeLessThan(90);
    expect(nombre).toMatch(/^reportes-maria-de-los-angeles-[a-z-]*semanas-2026-10-21\.pdf$/);
    expect(nombre).not.toMatch(/--/);
  });

  it("un título sin letras ni números cae en un nombre genérico", () => {
    expect(nombreDeArchivo("???", "semana", "2026-10-21", "csv")).toBe("reportes-semanas-2026-10-21.csv");
    expect(nombreDeArchivo("", "dia", "2026-10-21", "csv")).toBe("reportes-dias-2026-10-21.csv");
  });
});

describe("fechaCompleta", () => {
  it("día, mes y año", () => {
    expect(fechaCompleta("2026-10-21")).toBe("21/10/2026");
  });
});
