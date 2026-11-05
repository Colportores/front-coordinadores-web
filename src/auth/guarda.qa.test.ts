import { describe, expect, it } from "vitest";

import { destinoSeguro, rutaDeAcceso } from "@/auth/guarda";
import { RUTA_INICIAL } from "@/shell/pestanas";

/**
 * QA del PR #103 (issue #18, vista 38): el destino de `?siguiente=` solo puede ser una ruta del panel. El navegador lo usa en
 * `window.location.assign(destino)` y el proxy en `NextResponse.redirect(new URL(destino, origen))`: un destino que empieza con
 * `//` sale del panel.
 */
describe("QA #18 · destinoSeguro", () => {
  it("un destino con segmentos de punto que se colapsan a `//sitio.malo` no sale del panel", () => {
    // Comprobado con Chromium real contra `next dev`: con una sesión abierta, `/acceso?siguiente=/.//sitio.malo` redirige a
    // http://sitio.malo/ (el proxy hace `new URL("//sitio.malo", origen)`).
    for (const malo of ["/.//sitio.malo", "/x/..//sitio.malo", "/%2e//sitio.malo", "/a/%2e%2e//sitio.malo", "/.///sitio.malo"]) {
      const destino = destinoSeguro(malo);
      expect(destino.startsWith("//"), `${malo} -> ${destino}`).toBe(false);
      expect(new URL(destino, "http://panel.local").origin, `${malo} -> ${destino}`).toBe("http://panel.local");
    }
  });

  it("rutaDeAcceso tampoco arrastra ese destino a la URL de la pantalla de acceso", () => {
    expect(decodeURIComponent(rutaDeAcceso("vencida", "/.//sitio.malo"))).not.toContain("sitio.malo");
  });

  it("los segmentos de punto comunes se normalizan dentro del panel", () => {
    expect(destinoSeguro("/ok/../equipo")).toBe("/equipo");
    expect(destinoSeguro("/./equipo?x=1")).toBe("/equipo?x=1");
    expect(destinoSeguro("/%2e/equipo")).toBe("/equipo");
  });

  it("una ruta con `//` en el medio sigue siendo del panel", () => {
    expect(destinoSeguro("/equipo//anadir")).toBe("/equipo//anadir");
    expect(RUTA_INICIAL.startsWith("/")).toBe(true);
  });

  it("la pantalla de acceso y sus subrutas nunca son destino, aunque lleguen con segmentos de punto", () => {
    for (const valor of ["/acceso", "/acceso/", "/./acceso", "/equipo/../acceso", "/%61cceso", "/acceso?x=1"]) {
      expect(destinoSeguro(valor).startsWith("/acceso"), valor).toBe(false);
    }
  });
});
