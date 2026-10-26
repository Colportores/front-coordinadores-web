import { beforeEach, describe, expect, it, vi } from "vitest";

import { leerCampaniaElegida } from "@/datos/shell/campania-elegida-servidor";
import { COOKIE_CAMPANIA_ELEGIDA } from "@/shell/campania-elegida";

const cookies = vi.hoisted(() => ({ valores: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nombre: string) => (cookies.valores.has(nombre) ? { name: nombre, value: cookies.valores.get(nombre) } : undefined),
  }),
}));

const ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  cookies.valores.clear();
});

describe("leerCampaniaElegida", () => {
  it("es el id de la cookie del pedido", async () => {
    cookies.valores.set(COOKIE_CAMPANIA_ELEGIDA, ID);

    expect(await leerCampaniaElegida()).toBe(ID);
  });

  it("sin cookie, no hay elegida", async () => {
    expect(await leerCampaniaElegida()).toBeNull();
  });

  it("una cookie que no tiene la forma de un id (vieja, manoseada) se ignora", async () => {
    for (const valor of ["", "cualquier cosa", `${ID}; drop table`, "../../etc/passwd", "1 or 1=1"]) {
      cookies.valores.set(COOKIE_CAMPANIA_ELEGIDA, valor);
      expect(await leerCampaniaElegida()).toBeNull();
    }
  });
});
