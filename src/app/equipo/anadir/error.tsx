"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ContenidoPestana } from "@/shell/ContenidoPestana";

/**
 * No se pudieron traer la campaña, el equipo o los sugeridos (sin conexión o servidor caído). Mismo patrón que la vista 24.
 * «Reintentar» usa `retry`, que vuelve a pedir los datos y a renderizar la página; `reset` solo repintaría el error guardado.
 */
export default function ErrorAnadirColportor({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <ContenidoPestana titulo="Añadir colportor">
      <div role="alert" className="flex max-w-xl flex-col items-start gap-3 rounded-tarjeta border border-borde bg-superficie px-[18px] py-4">
        <p className="text-nav text-tinta">
          No se pudieron cargar las cuentas para añadir a la campaña. Revisá tu conexión y probá de nuevo.
        </p>
        <div className="flex items-center gap-4">
          <Button type="button" onClick={retry} className="text-nav font-semibold">
            Reintentar
          </Button>
          <Link href="/equipo" className="inline-flex min-h-6 items-center text-nav font-semibold text-marca-media hover:text-marca">
            ‹ Equipo
          </Link>
        </div>
      </div>
    </ContenidoPestana>
  );
}
