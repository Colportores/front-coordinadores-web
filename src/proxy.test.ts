import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy, RUTA_NO_DISPONIBLE } from "@/proxy";
import { fijarFlags } from "@/test/flags";

function reescrituraDe(ruta: string): string | null {
  const respuesta = proxy(new NextRequest(new URL(ruta, "http://localhost:3000")));
  const destino = respuesta.headers.get("x-middleware-rewrite");
  return destino ? new URL(destino).pathname : null;
}

describe("proxy de pestañas con flag", () => {
  describe("fuera del modo dev (staging y producción)", () => {
    it("corta Stock y Cuentas antes de renderizar, incluidas subrutas y payload RSC", () => {
      fijarFlags({ modoDev: false });
      for (const ruta of ["/stock", "/stock/pedidos", "/stock.rsc", "/cuentas", "/cuentas/123"]) {
        expect(reescrituraDe(ruta), ruta).toBe(RUTA_NO_DISPONIBLE);
      }
    });

    it("no toca las pestañas sin flag ni rutas que solo empiezan parecido", () => {
      fijarFlags({ modoDev: false });
      expect(reescrituraDe("/inicio")).toBeNull();
      expect(reescrituraDe("/stockeo")).toBeNull();
    });

    it("respeta el flag propio de la pestaña", () => {
      fijarFlags({ modoDev: false, stock: true });
      expect(reescrituraDe("/stock")).toBeNull();
      expect(reescrituraDe("/cuentas")).toBe(RUTA_NO_DISPONIBLE);
    });
  });

  describe("en modo dev", () => {
    it("deja pasar Stock y Cuentas", () => {
      fijarFlags({ modoDev: true });
      expect(reescrituraDe("/stock")).toBeNull();
      expect(reescrituraDe("/cuentas")).toBeNull();
    });
  });
});
