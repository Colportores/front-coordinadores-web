import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { pestanaVisible, type Pestana } from "@/config/flags";

/**
 * Segunda barrera de las pestañas con flag (Stock y Cuentas). La primera es
 * src/proxy.ts, que corta la petición antes de renderizar: un notFound() acá
 * solo no alcanza, porque layout y page se renderizan en paralelo.
 */
export function LayoutPestanaConFlag({ pestana, children }: { pestana: Pestana; children: ReactNode }) {
  if (!pestanaVisible(pestana)) notFound();
  return children;
}
