import { NextResponse, type NextRequest } from "next/server";

import { pestanaVisible, type Pestana } from "@/config/flags";

/** Ruta que no existe: reescribir hacia ella devuelve la página 404 del panel. */
export const RUTA_NO_DISPONIBLE = "/_pestana-no-disponible";

const PESTANAS_CON_FLAG: readonly Pestana[] = ["stock", "cuentas"];

function pestanaDeRuta(ruta: string): Pestana | undefined {
  return PESTANAS_CON_FLAG.find((p) => ruta === `/${p}` || ruta.startsWith(`/${p}/`) || ruta.startsWith(`/${p}.`));
}

/**
 * Pestañas con flag apagado (Stock y Cuentas en staging y producción): la
 * petición se corta ANTES de renderizar. Un `notFound()` en el layout no
 * alcanza, porque en el App Router layout y page se renderizan en paralelo y
 * el payload RSC igual llevaría el árbol de la página.
 */
export function proxy(request: NextRequest) {
  const pestana = pestanaDeRuta(request.nextUrl.pathname);
  if (pestana && !pestanaVisible(pestana)) {
    return NextResponse.rewrite(new URL(RUTA_NO_DISPONIBLE, request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Incluye /stock, /stock/…, y variantes como /stock.rsc; pestanaDeRuta filtra el resto.
  matcher: ["/(stock|cuentas)(.*)"],
};
