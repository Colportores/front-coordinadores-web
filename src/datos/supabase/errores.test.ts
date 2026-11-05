import { describe, expect, it } from "vitest";

import { causaDe, ErrorSupabase } from "@/datos/supabase/cliente";
import { causaDeFalla } from "@/datos/supabase/errores";

describe("causaDeFalla", () => {
  it.each([
    [401, "PGRST301", "JWT vencido o inválido"],
    [401, "PGRST302", "sin credenciales"],
    [401, "PGRST303", "claims inválidos"],
    [401, "42501", "pedido sin autenticar"],
  ])("un %i con %s (%s) es una sesión vencida", (estado, codigo) => {
    expect(causaDeFalla({ estado, codigo })).toBe("sesion-vencida");
  });

  it.each([
    [0, "", "sin red o cancelada"],
    [408, "", "tiempo agotado"],
    [429, "", "límite de tráfico"],
    [500, "", "falla del servicio"],
    [502, "", "gateway"],
    [503, "", "servicio caído"],
    [504, "", "tiempo del gateway"],
    [401, "", "401 del gateway, como una clave anónima mal cargada"],
    [401, "invalid_api_key", "401 que no habla del token"],
  ])("un %i con «%s» (%s) no es una sesión vencida: es que no está disponible", (estado, codigo) => {
    expect(causaDeFalla({ estado, codigo })).toBe("no-disponible");
  });

  it.each([
    [400, "CI004"],
    [403, "42501"],
    [404, "PGRST202"],
    [409, "CZ003"],
    [422, ""],
  ])("un %i con «%s» es un rechazo de la base", (estado, codigo) => {
    expect(causaDeFalla({ estado, codigo })).toBe("rechazo");
  });
});

describe("causaDe", () => {
  it("lee el estado y el código de un ErrorSupabase", () => {
    expect(causaDe(new ErrorSupabase("vencido", 401, "PGRST301"))).toBe("sesion-vencida");
    expect(causaDe(new ErrorSupabase("caído", 503))).toBe("no-disponible");
    expect(causaDe(new ErrorSupabase("la regla dijo que no", 400, "CI004"))).toBe("rechazo");
  });

  it("toma como falta de conexión lo que no es un ErrorSupabase (un fetch que se cae, un timeout)", () => {
    expect(causaDe(new TypeError("fetch failed"))).toBe("no-disponible");
    expect(causaDe("algo")).toBe("no-disponible");
    expect(causaDe(undefined)).toBe("no-disponible");
  });
});
