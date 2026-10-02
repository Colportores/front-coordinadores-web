import type { ReactNode } from "react";

import { sitioDePruebaActivo } from "@/config/flags";
import type { ResumenCoordinador } from "@/datos/shell/contrato";
import { cn } from "@/lib/utils";
import { AvisoVersionDePrueba } from "@/shell/AvisoVersionDePrueba";
import type { DefinicionPestana } from "@/shell/pestanas";
import { Topbar } from "@/shell/Topbar";

/**
 * El marco de toda pantalla: topbar arriba y la pestaña debajo, con su propio scroll.
 * Solo escritorio: el diseño fija un ancho mínimo de 1280px. En el sitio de
 * prueba hay una fila más arriba de todo, la del aviso de versión de prueba;
 * `--alto-aviso` la descuenta de las alturas que dependen de la ventana.
 */
export function MarcoDelPanel({
  resumen,
  pestanas,
  children,
}: {
  resumen: ResumenCoordinador;
  pestanas: DefinicionPestana[];
  children: ReactNode;
}) {
  const avisoDePrueba = sitioDePruebaActivo();

  return (
    <div
      className={cn(
        "grid h-screen min-w-[1280px] overflow-hidden",
        avisoDePrueba
          ? "grid-rows-[auto_var(--spacing-topbar)_1fr] [--alto-aviso:var(--spacing-aviso)]"
          : "grid-rows-[var(--spacing-topbar)_1fr]",
      )}
    >
      <AvisoVersionDePrueba />
      <Topbar resumen={resumen} pestanas={pestanas} />
      <main className="relative overflow-hidden">{children}</main>
    </div>
  );
}
