"use client";

import { Button } from "@/components/ui/button";
import { ContenidoPestana } from "@/shell/ContenidoPestana";

/** No se pudieron traer las zonas de la campaña (BFF caído o sin conexión). */
export default function ErrorZonas({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ContenidoPestana titulo="Ciudades">
      <div role="alert" className="flex max-w-xl flex-col items-start gap-3 rounded-tarjeta border border-borde bg-superficie px-[18px] py-4">
        <p className="text-nav text-tinta">No se pudieron cargar las zonas de la campaña. Revisá tu conexión y probá de nuevo.</p>
        <Button type="button" onClick={reset} className="text-nav font-semibold">
          Reintentar
        </Button>
      </div>
    </ContenidoPestana>
  );
}
