import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { pestanaVisible, type Pestana } from "@/config/flags";

/**
 * Segunda barrera de las pestañas con flag (Stock y Cuentas). La primera es
 * src/proxy.ts, que corta la petición antes de renderizar: un notFound() acá
 * solo no alcanza, porque layout y page se renderizan en paralelo.
 *
 * Con el flag apagado, `connection()` saca la ruta del prerender: el build no
 * deja HTML/RSC estático de una pestaña oculta. (Antes lo hacía
 * `export const dynamic = "force-dynamic"` en cada layout; el export estático
 * del sitio de prueba no admite esa opción, y acá solo se usa con el flag apagado.)
 */
export async function LayoutPestanaConFlag({ pestana, children }: { pestana: Pestana; children: ReactNode }) {
  if (!pestanaVisible(pestana)) {
    await connection();
    notFound();
  }
  return children;
}
