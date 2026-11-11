import { describe, expect, it } from "vitest";

import { contrasenaCorta, largoVisible, normalizarCorreo, problemaDeCorreo } from "@/features/acceso/validacion";

/**
 * QA del PR #178 (issue #177): la regla pura del login contra la de HU-AUTH-001 «Formato del correo» y el Supuesto S1.
 */

describe("QA #177 · normalizarCorreo", () => {
  it.each([
    ["  Marta.Perez@Correo.COM  ", "marta.perez@correo.com"],
    ["​marta@correo.com​", "marta@correo.com"],
    ["mar﻿ta@correo.com", "marta@correo.com"],
    ["‎marta@correo.com‏", "marta@correo.com"],
    ["ma­rta@correo.com", "marta@correo.com"],
    ["\tmarta@correo.com\n", "marta@correo.com"],
    ["   ", ""],
    ["​​", ""],
    ["", ""],
  ])("%j → %j", (entrada, esperado) => {
    expect(normalizarCorreo(entrada)).toBe(esperado);
  });
});

describe("QA #177 · problemaDeCorreo: lo que pasa (HU-AUTH-001)", () => {
  it.each([
    "marta@correo.com",
    "marta.perez+campania@sub.correo.com.uy",
    "a@b.co",
    "o'brien@correo.com",
    "a_b-c@correo.com",
    "{x}~y@correo.com",
    // «Los puntos al borde o dobles antes de la @ pasan, porque el servidor los acepta» (decisión del 16/10).
    "lucia.@correo.com",
    ".lucia@correo.com",
    "lu..cia@correo.com",
    "1234567@correo.com",
    `${"a".repeat(63)}@${"b".repeat(63)}.com`,
  ])("%s", (correo) => {
    expect(problemaDeCorreo(correo)).toBeNull();
  });
});

describe("QA #177 · problemaDeCorreo: un carácter que no va (tilde, ñ, espacio, coma, comillas, emoji)", () => {
  it.each([
    "lucía@correo.com",
    "muñoz@correo.com",
    "lucia@corréo.com",
    "lu cia@correo.com",
    "lucia,perez@correo.com",
    'lu"cia"@correo.com',
    "lucia(1)@correo.com",
    "lucia<a>@correo.com",
    "lucia;x@correo.com",
    "lucia\\x@correo.com",
    "lucia😀@correo.com",
    "lucia@correo.com x",
    "lucia@correo.com, otro@correo.com",
    // Cirílica «а» (U+0430), que se ve igual que la «a».
    "mаrta@correo.com",
    // Arroba de ancho completo.
    "marta＠correo.com",
  ])("%s", (correo) => {
    expect(problemaDeCorreo(correo)).toBe("caracter-no-permitido");
  });
});

describe("QA #177 · problemaDeCorreo: incompleto o mal armado", () => {
  it.each([
    ["sin arroba", "martacorreo.com"],
    ["dos arrobas", "marta@@correo.com"],
    ["dos arrobas separadas", "marta@x@correo.com"],
    ["sin nombre", "@correo.com"],
    ["sin dominio", "marta@"],
    ["sin punto en el dominio", "marta@correo"],
    ["terminación de un carácter", "marta@correo.c"],
    ["doble punto en el dominio", "marta@correo..com"],
    ["punto al final", "marta@correo.com."],
    ["punto al principio del dominio", "marta@.correo.com"],
    ["etiqueta que empieza con guion", "marta@-correo.com"],
    ["etiqueta que termina con guion", "marta@correo-.com"],
    ["etiqueta de 64 caracteres", `marta@${"b".repeat(64)}.com`],
    ["más de 254 caracteres", `${"a".repeat(250)}@correo.com`],
    ["una cédula", "12345678"],
    ["solo la arroba", "@"],
  ])("%s: %s", (_caso, correo) => {
    expect(problemaDeCorreo(correo)).toBe("incompleto");
  });
});

describe("QA #177 · contraseña: el mínimo se cuenta por caracteres visibles (S1, decisión del 02/10)", () => {
  it.each([
    ["vacía", "", true],
    ["7 letras", "abcdefg", true],
    ["8 letras", "abcdefgh", false],
    ["8 espacios (el login solo mira el largo)", "        ", false],
    ["7 espacios", "       ", true],
    ["8 con ñ y tilde", "ñandú123", false],
    ["4 con ñ (8 bytes, 4 visibles)", "ññññ", true],
    ["8 emoji: cada uno vale 1", "😀😀😀😀😀😀😀😀", false],
    ["7 emoji (14 unidades, 7 visibles)", "😀😀😀😀😀😀😀", true],
    ["7 caracteres + 1 emoji", "abcdefg😀", false],
    ["8 familias con ZWJ (cada una es 1 visible)", "👨‍👩‍👧‍👦".repeat(8), false],
    ["7 familias con ZWJ (más de 8 unidades, 7 visibles)", "👨‍👩‍👧‍👦".repeat(7), true],
    ["8 letras con tilde combinada (e + U+0301)", "é".repeat(8), false],
    ["7 letras con tilde combinada (14 unidades)", "é".repeat(7), true],
    ["8 banderas (2 unidades regionales cada una)", "🇺🇾".repeat(8), false],
    ["7 banderas", "🇺🇾".repeat(7), true],
  ])("%s", (_caso, contrasena, corta) => {
    expect(contrasenaCorta(contrasena)).toBe(corta);
  });

  it("una contraseña pegada de 100 mil caracteres no se traba y no es corta", () => {
    const inicio = Date.now();
    expect(contrasenaCorta("x".repeat(100_000))).toBe(false);
    expect(Date.now() - inicio).toBeLessThan(1500);
  });

  it("largoVisible cuenta lo que ve la persona", () => {
    expect(largoVisible("")).toBe(0);
    expect(largoVisible("a😀b")).toBe(3);
  });
});

describe("QA #177 · privacidad del módulo", () => {
  it("los tipos de problema son etiquetas fijas: no devuelven lo que se escribió", () => {
    for (const correo of ["lucía@correo.com", "marta@", "x@y"]) {
      const problema = problemaDeCorreo(correo);
      expect(problema).not.toBeNull();
      expect(String(problema)).not.toContain("@");
      expect(String(problema)).not.toContain("lucía");
    }
  });
});
