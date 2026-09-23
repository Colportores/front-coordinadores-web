"use client";

import type { ReactNode } from "react";

import { ChipHu } from "@/dev/ChipHu";
import { buscarHu } from "@/dev/estado-hu";
import { CLASES_ESTADO } from "@/dev/estilos";
import { useModoDev } from "@/dev/ProveedorModoDev";
import { cn } from "@/lib/utils";

/**
 * Marca una sección de una pestaña con la HU que implementa.
 * Siempre renderiza un <div> (con `className`) para que el layout sea el mismo
 * con y sin modo dev; en modo dev le suma un contorno punteado y el chip.
 *
 *   <SeccionHu hu="HU-CAM-008" className="col-span-2">…</SeccionHu>
 */
export function SeccionHu({
  hu,
  className,
  children,
}: {
  hu: string;
  className?: string;
  children: ReactNode;
}) {
  const { chipsVisibles } = useModoDev();
  const registro = buscarHu(hu);
  const contorno = registro ? CLASES_ESTADO[registro.estado].contorno : "outline-peligro";

  return (
    <div
      data-hu={hu}
      className={cn(
        "relative",
        chipsVisibles && ["rounded-tarjeta outline-1 outline-offset-2 outline-dashed", contorno],
        className,
      )}
    >
      {children}
      {chipsVisibles && <ChipHu hu={hu} className="absolute -top-2.5 right-2 z-20" />}
    </div>
  );
}
