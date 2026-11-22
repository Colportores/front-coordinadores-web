import Link from "next/link";

import { ContenidoPestana } from "@/shell/ContenidoPestana";
import { RUTA_INICIAL } from "@/shell/pestanas";

/** Lo que muestran las pantallas de acceso (38 y 40) en el sitio de prueba: no hay cuentas ni sesión ni correos. */
export function SitioDePruebaSinAcceso({ titulo = "Acceso" }: { titulo?: string }) {
  return (
    <ContenidoPestana titulo={titulo}>
      <div className="flex flex-col gap-2 rounded-tarjeta border border-borde bg-superficie px-5 py-6">
        <p className="font-serif text-titulo font-semibold text-marca">El sitio de prueba no tiene inicio de sesión.</p>
        <p className="text-cuerpo text-tinta-suave">
          Trabaja con datos de ejemplo y no guarda nada, así que no hace falta una cuenta.{" "}
          <Link href={RUTA_INICIAL} className="font-semibold text-marca underline underline-offset-2">
            Ir a Inicio
          </Link>
        </p>
      </div>
    </ContenidoPestana>
  );
}
