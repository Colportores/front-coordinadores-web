import { cn } from "@/lib/utils";

import type { Etiqueta, Tono } from "./modelo";

const TONOS: Record<Tono, string> = {
  alerta: "bg-alerta-fondo text-alerta",
  info: "bg-marca-clara text-marca-media",
  exito: "bg-exito-fondo text-exito",
  peligro: "bg-peligro-fondo text-peligro",
};

/** La pastilla con el estado de un pedido o de una transferencia. El texto dice todo: el color no lleva información sola. */
export function EtiquetaDeEstado({ etiqueta, className }: { etiqueta: Etiqueta; className?: string }) {
  return (
    <span className={cn("rounded-pastilla px-2 py-[3px] text-mini font-semibold whitespace-nowrap", TONOS[etiqueta.tono], className)}>
      {etiqueta.texto}
    </span>
  );
}
