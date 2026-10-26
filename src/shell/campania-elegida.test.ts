import { afterEach, describe, expect, it } from "vitest";

import { COOKIE_CAMPANIA_ELEGIDA, guardarCampaniaElegida } from "@/shell/campania-elegida";

const ID = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  document.cookie = `${COOKIE_CAMPANIA_ELEGIDA}=; Max-Age=0; Path=/`;
});

describe("guardarCampaniaElegida", () => {
  it("deja el id en una cookie de sesión de todo el sitio, que el servidor lee en cada pedido", () => {
    guardarCampaniaElegida(ID);

    expect(document.cookie).toContain(`${COOKIE_CAMPANIA_ELEGIDA}=${ID}`);
  });

  it("elegir otra reemplaza a la anterior", () => {
    guardarCampaniaElegida(ID);
    guardarCampaniaElegida("22222222-2222-4222-8222-222222222222");

    expect(document.cookie).toContain("22222222-2222-4222-8222-222222222222");
    expect(document.cookie).not.toContain(ID);
  });

  it("codifica el valor: un id raro no rompe la cookie", () => {
    guardarCampaniaElegida("a;b c");

    expect(document.cookie).toContain(`${COOKIE_CAMPANIA_ELEGIDA}=a%3Bb%20c`);
  });
});
