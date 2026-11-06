import { describe, expect, it } from "vitest";

import { conPuntosDeMiles, sinBarrasFinales } from "@/lib/texto";

describe("sinBarrasFinales", () => {
  it("saca las barras del final y nada más", () => {
    expect(sinBarrasFinales("https://abc.supabase.co")).toBe("https://abc.supabase.co");
    expect(sinBarrasFinales("https://abc.supabase.co/")).toBe("https://abc.supabase.co");
    expect(sinBarrasFinales("https://abc.supabase.co///")).toBe("https://abc.supabase.co");
    expect(sinBarrasFinales("https://abc.supabase.co/rest/")).toBe("https://abc.supabase.co/rest");
    expect(sinBarrasFinales("/a/b")).toBe("/a/b");
    expect(sinBarrasFinales("")).toBe("");
    expect(sinBarrasFinales("///")).toBe("");
  });

  it("no se cuelga con una cadena larga de barras ni con barras repartidas (entrada hostil)", () => {
    const inicio = Date.now();
    expect(sinBarrasFinales("/".repeat(200_000))).toBe("");
    expect(sinBarrasFinales("/".repeat(200_000) + "x")).toBe("/".repeat(200_000) + "x");
    expect(sinBarrasFinales("a/".repeat(100_000))).toBe("a/".repeat(100_000 - 1) + "a");
    expect(Date.now() - inicio).toBeLessThan(1500);
  });
});

describe("conPuntosDeMiles", () => {
  it("pone un punto cada tres cifras", () => {
    expect(conPuntosDeMiles("0")).toBe("0");
    expect(conPuntosDeMiles("12")).toBe("12");
    expect(conPuntosDeMiles("123")).toBe("123");
    expect(conPuntosDeMiles("1234")).toBe("1.234");
    expect(conPuntosDeMiles("1450")).toBe("1.450");
    expect(conPuntosDeMiles("214300")).toBe("214.300");
    expect(conPuntosDeMiles("1234567")).toBe("1.234.567");
    expect(conPuntosDeMiles("1000000000")).toBe("1.000.000.000");
  });

  it("respeta el signo menos", () => {
    expect(conPuntosDeMiles("-5")).toBe("-5");
    expect(conPuntosDeMiles("-999")).toBe("-999");
    expect(conPuntosDeMiles("-1000")).toBe("-1.000");
    expect(conPuntosDeMiles("-1234567")).toBe("-1.234.567");
  });

  it("lo que no es un entero vuelve como llegó", () => {
    for (const texto of ["", "-", "NaN", "Infinity", "1e+21", "12,5", "1.5", "abc", " 1234"]) {
      expect(conPuntosDeMiles(texto)).toBe(texto);
    }
  });

  it("un número de miles de cifras se formatea sin colgarse", () => {
    const inicio = Date.now();
    const texto = "7".repeat(30_000);
    const formateado = conPuntosDeMiles(texto);
    expect(formateado.replaceAll(".", "")).toBe(texto);
    expect(formateado.split(".").every((grupo) => grupo.length <= 3)).toBe(true);
    expect(Date.now() - inicio).toBeLessThan(1500);
  });
});
