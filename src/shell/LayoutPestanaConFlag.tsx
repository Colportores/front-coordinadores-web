import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { pestanaVisible, type Pestana } from "@/config/flags";

/**
 * Layout de las pestañas con flag (Stock y Cuentas): si el flag está apagado
 * (staging y producción), la ruta responde 404 aunque se escriba a mano.
 */
export function LayoutPestanaConFlag({ pestana, children }: { pestana: Pestana; children: ReactNode }) {
  if (!pestanaVisible(pestana)) notFound();
  return children;
}
