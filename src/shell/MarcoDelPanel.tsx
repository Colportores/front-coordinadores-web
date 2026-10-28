import type { ReactNode } from "react";

import type { ResultadoCierre } from "@/auth/acceso";
import { hayAvisoDeVersionDePrueba } from "@/config/datos-simulados";
import type { ResultadoCampanias, ResumenCoordinador } from "@/datos/shell/contrato";
import { cn } from "@/lib/utils";
import { AvisoVersionDePrueba } from "@/shell/AvisoVersionDePrueba";
import type { DefinicionPestana } from "@/shell/pestanas";
import { Topbar } from "@/shell/Topbar";

/**
 * El marco de toda pantalla: topbar arriba y la pestaña debajo, con su propio scroll.
 * Solo escritorio: el diseño fija un ancho mínimo de 1280px. Con datos
 * simulados (sitio de prueba, panel sin conexión o pestañas sin conectar) hay una fila más arriba de todo, la del aviso;
 * `--alto-aviso` la descuenta de las alturas que dependen de la ventana.
 */
export function MarcoDelPanel({
  resumen,
  pestanas,
  pedirCampanias,
  cerrarSesion,
  children,
}: {
  resumen: ResumenCoordinador;
  pestanas: DefinicionPestana[];
  /** Ver `Topbar`. Sin ella, el selector de campaña usa las simuladas. */
  pedirCampanias?: () => Promise<ResultadoCampanias>;
  /** Ver `Topbar`. Sin ella (sitio de prueba, panel sin login) el avatar no abre ningún menú. */
  cerrarSesion?: () => Promise<ResultadoCierre>;
  children: ReactNode;
}) {
  const avisoDePrueba = hayAvisoDeVersionDePrueba();

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
      <Topbar resumen={resumen} pestanas={pestanas} pedirCampanias={pedirCampanias} cerrarSesion={cerrarSesion} />
      <main className="relative overflow-hidden">{children}</main>
    </div>
  );
}
