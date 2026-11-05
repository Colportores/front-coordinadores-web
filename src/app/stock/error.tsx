"use client";

import { Button } from "@/components/ui/button";
import { ContenidoPestana } from "@/shell/ContenidoPestana";

/**
 * No se pudo traer el stock (sin conexión o servidor caído). «Reintentar» usa `retry`, que vuelve a pedir los datos y a
 * renderizar la página; `reset` solo repintaría el error guardado.
 */
export default function ErrorStock({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <ContenidoPestana titulo="Stock">
      <div role="alert" className="flex max-w-xl flex-col items-start gap-3 rounded-tarjeta border border-borde bg-superficie px-[18px] py-4">
        <p className="text-nav text-tinta">No se pudo cargar el stock de la campaña. Revisá tu conexión y probá de nuevo.</p>
        <Button type="button" onClick={retry} className="text-nav font-semibold">
          Reintentar
        </Button>
      </div>
    </ContenidoPestana>
  );
}
