import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { modoDeAcceso } from "@/auth/modo";
import { PantallaOlvide } from "@/features/acceso/PantallaOlvide";
import { SitioDePruebaSinAcceso } from "@/features/acceso/SitioDePruebaSinAcceso";
import { RUTA_INICIAL } from "@/shell/pestanas";

export const metadata: Metadata = {
  title: "Recuperar la contraseña · Colportaje · Coordinador",
  robots: { index: false, follow: false },
};

/**
 * Vista 40A: «Olvidé mi contraseña» del coordinador (issue #111, HU-AUTH-004), a la que lleva «¿Olvidaste tu contraseña?» del
 * acceso (vista 38). Sin el marco del panel: el proxy lo saca de todo `/acceso/*`.
 *
 * - Con las variables públicas de Supabase, la pantalla para pedir el enlace.
 * - Sin ellas, el panel no tiene login ni cuentas que recuperar: se vuelve al inicio.
 * - Sitio de prueba (export estático, sin servidor): no hay cuentas ni correos. La condición es literal y el `import()` está en el
 *   `else` para que las server actions y las cookies no entren al build exportado. Ver README, «Sitio de prueba».
 */
export default async function OlvidePagina() {
  if (process.env.NEXT_PUBLIC_DEPLOY_PAGES === "1") {
    return <SitioDePruebaSinAcceso titulo="Recuperar la contraseña" />;
  } else {
    if (modoDeAcceso() === "apagado") redirect(RUTA_INICIAL);

    const { pedirEnlaceAccion } = await import("@/auth/acciones-recuperacion");
    return <PantallaOlvide pedir={pedirEnlaceAccion} />;
  }
}
