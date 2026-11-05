import Link from "next/link";

import { ContenidoPestana } from "@/shell/ContenidoPestana";
import { RUTA_INICIAL } from "@/shell/pestanas";

export default function NoEncontrada() {
  return (
    <ContenidoPestana titulo="Página no encontrada">
      <div className="flex flex-col gap-2 rounded-tarjeta border border-borde bg-superficie px-5 py-6">
        <p className="font-serif text-titulo font-semibold text-marca">Esta sección no existe o no está disponible.</p>
        <p className="text-cuerpo text-tinta-suave">
          Volvé al inicio para seguir con el tablero de tu región.{" "}
          <Link href={RUTA_INICIAL} className="font-semibold text-marca underline underline-offset-2">
            Ir a Inicio
          </Link>
        </p>
      </div>
    </ContenidoPestana>
  );
}
