"use client";

import { Button } from "@/components/ui/button";
import { ContenidoPestana } from "@/shell/ContenidoPestana";

/**
 * No se pudo traer el equipo de la campaña (sin conexión o servidor caído). Mismo patrón que las vistas 23 y 24.
 * «Reintentar» usa `retry`, que vuelve a pedir los datos y a renderizar la página; `reset` solo repintaría el error guardado.
 */
export default function ErrorEquipo({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <ContenidoPestana titulo="Equipo">
      <div role="alert" className="flex max-w-xl flex-col items-start gap-3 rounded-tarjeta border border-borde bg-superficie px-[18px] py-4">
        <p className="text-nav text-tinta">No se pudo cargar el equipo de la campaña. Revisá tu conexión y probá de nuevo.</p>
        <Button type="button" onClick={retry} className="text-nav font-semibold">
          Reintentar
        </Button>
      </div>
    </ContenidoPestana>
  );
}
