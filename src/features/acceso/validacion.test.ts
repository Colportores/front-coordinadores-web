import { describe, expect, it } from "vitest";

import { reglasDeContrasena } from "@/features/acceso/validacion";

describe("reglasDeContrasena (HU-AUTH-005, la regla del registro)", () => {
  it("cumple con 8 caracteres, una mayúscula y un número", () => {
    expect(reglasDeContrasena("Nueva-clave-1")).toEqual({ faltan: 0, largo: true, mayuscula: true, numero: true, demasiadoLarga: false, cumple: true });
    expect(reglasDeContrasena("Abcdefg1").cumple).toBe(true);
  });

  it("dice cuántos caracteres faltan y qué regla falla", () => {
    expect(reglasDeContrasena("abc12")).toEqual({ faltan: 3, largo: false, mayuscula: false, numero: true, demasiadoLarga: false, cumple: false });
    expect(reglasDeContrasena("")).toMatchObject({ faltan: 8, cumple: false });
    expect(reglasDeContrasena("sin-numero-A")).toMatchObject({ numero: false, mayuscula: true, cumple: false });
    expect(reglasDeContrasena("sin-mayuscula-1")).toMatchObject({ mayuscula: false, numero: true, cumple: false });
  });

  it("cualquier letra mayúscula cuenta, también con tilde y Ñ (decisión del 02/10)", () => {
    expect(reglasDeContrasena("Ñandú2026").cumple).toBe(true);
    expect(reglasDeContrasena("élan2026É").mayuscula).toBe(true);
  });

  it("el largo se cuenta por caracteres visibles: un emoji vale 1", () => {
    expect(reglasDeContrasena("Ab1😀😀😀😀😀").largo).toBe(true);
    expect(reglasDeContrasena("Ab1😀😀😀")).toMatchObject({ largo: false, faltan: 2 });
  });

  it("el tope es de 72 bytes en UTF-8 (no caracteres): 72 pasa, 74 no cumple aunque tenga mayúscula y número", () => {
    expect(reglasDeContrasena(`A1${"x".repeat(70)}`)).toMatchObject({ demasiadoLarga: false, cumple: true });
    expect(reglasDeContrasena(`Ñ1${"ñ".repeat(36)}`)).toMatchObject({ largo: true, mayuscula: true, numero: true, demasiadoLarga: true, cumple: false });
  });
});
