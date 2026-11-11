import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type TonoDeAviso = "info" | "alerta" | "peligro" | "sin-conexion";

const CLASES: Record<TonoDeAviso, { caja: string; icono: string; signo: string }> = {
  info: { caja: "border-solid border-tinta-2 bg-superficie", icono: "bg-tinta-2", signo: "i" },
  alerta: { caja: "border-solid border-alerta-punto bg-superficie-calida", icono: "bg-alerta", signo: "!" },
  peligro: { caja: "border-solid border-peligro bg-superficie", icono: "bg-peligro", signo: "!" },
  "sin-conexion": { caja: "border-dashed border-tinta-suave bg-superficie", icono: "bg-tinta-suave", signo: "✕" },
};

/**
 * La franja de aviso de la vista 27 (27G·01, 05, 08 y 09): un ícono, el texto y, si hace falta, una acción. `alert` para lo que
 * hay que atender (fallas, alertas), `status` para lo que solo informa.
 */
export function AvisoDePrecios({
  tono,
  rol,
  children,
  accion,
}: {
  tono: TonoDeAviso;
  rol: "status" | "alert";
  children: ReactNode;
  accion?: ReactNode;
}) {
  const clases = CLASES[tono];
  return (
    <div role={rol} className={cn("flex items-center gap-3 rounded-tarjeta border-[1.5px] px-3.5 py-2.5", clases.caja)}>
      <span
        aria-hidden
        className={cn("grid size-5 flex-none place-items-center rounded-pastilla text-mini font-bold text-superficie", clases.icono)}
      >
        {clases.signo}
      </span>
      <p className="min-w-0 flex-1 text-nav leading-[1.45] text-pretty wrap-anywhere text-tinta">{children}</p>
      {accion}
    </div>
  );
}
