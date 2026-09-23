import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Contenedor raíz de cada pestaña: ocupa el área bajo el topbar, con scroll
 * propio, el padding del diseño (20px 22px) y 16px entre bloques.
 * Cada `page.tsx` de pestaña lo usa como elemento raíz.
 */
export function ContenidoPestana({
  titulo,
  className,
  children,
}: {
  /** Título accesible de la pestaña (h1 solo para lectores de pantalla). */
  titulo: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("absolute inset-0 flex flex-col gap-4 overflow-auto px-[22px] py-5", className)}>
      <h1 className="sr-only">{titulo}</h1>
      {children}
    </div>
  );
}
