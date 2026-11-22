import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { modoDeAcceso } from "@/auth/modo";
import { PantallaNuevaContrasena, type EstadoInicialDeNuevaContrasena } from "@/features/acceso/PantallaNuevaContrasena";
import { SitioDePruebaSinAcceso } from "@/features/acceso/SitioDePruebaSinAcceso";
import { RUTA_INICIAL } from "@/shell/pestanas";

export const metadata: Metadata = {
  title: "Nueva contraseña · Colportaje · Coordinador",
  robots: { index: false, follow: false },
  // El enlace del correo trae un código en la URL: que no salga en el encabezado `Referer` hacia otro sitio.
  referrer: "no-referrer",
};

/** Lo máximo que se acepta de un código del enlace: el mismo tope que la acción que lo canjea. */
const LARGO_MAXIMO_DEL_CODIGO = 1024;

/**
 * Vista 40B: «Nueva contraseña» del coordinador (issue #111, HU-AUTH-005), la pantalla a la que vuelve el enlace del correo con
 * un `?code=` (flujo PKCE de Supabase). Sin el marco del panel: el proxy lo saca de todo `/acceso/*`.
 *
 * - Con código, la pantalla lo canjea (una server action: la sesión de recuperación va a una cookie `httpOnly`).
 * - Sin código pero con una recuperación en curso en este navegador (se recargó la página, ya sin el código en la URL), sigue en
 *   «Nueva contraseña».
 * - Sin ninguno de los dos, o con un `?error=` de Supabase, «Enlace no válido»: no se distingue vencido de ya usado.
 * - Sin variables de Supabase se vuelve al inicio; en el sitio de prueba (export estático) no hay cuentas. La condición es
 *   literal y los `import()` están en el `else`: ver README, «Sitio de prueba».
 */
export default async function NuevaContrasenaPagina({ searchParams }: PageProps<"/acceso/nueva-contrasena">) {
  if (process.env.NEXT_PUBLIC_DEPLOY_PAGES === "1") {
    return <SitioDePruebaSinAcceso titulo="Nueva contraseña" />;
  } else {
    if (modoDeAcceso() === "apagado") redirect(RUTA_INICIAL);

    const consulta = await searchParams;
    const unico = (valor: string | string[] | undefined) => (Array.isArray(valor) ? valor[0] : valor);
    const codigo = unico(consulta.code);
    const hayError = unico(consulta.error) !== undefined;

    const { abrirEnlaceAccion, guardarContrasenaAccion } = await import("@/auth/acciones-recuperacion");

    let inicial: EstadoInicialDeNuevaContrasena = { paso: "no-valido" };
    if (!hayError && typeof codigo === "string" && codigo !== "" && codigo.length <= LARGO_MAXIMO_DEL_CODIGO) {
      inicial = { paso: "abrir", codigo };
    } else if (!hayError) {
      const enCurso = await (await import("@/auth/recuperacion-servidor")).recuperacionEnCurso();
      if (enCurso) inicial = { paso: "nueva", correo: enCurso.correo };
    }

    return <PantallaNuevaContrasena inicial={inicial} abrir={abrirEnlaceAccion} guardar={guardarContrasenaAccion} />;
  }
}
