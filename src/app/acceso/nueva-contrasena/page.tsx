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
 * Vista 40B: «Nueva contraseña» del coordinador (issue #111, HU-AUTH-005), la pantalla a la que vuelve el enlace del correo. Sin
 * el marco del panel: el proxy lo saca de todo `/acceso/*`.
 *
 * - El enlace de la plantilla de correo nueva trae `?token_hash=…&type=recovery`, un código de un solo uso que abre en CUALQUIER
 *   navegador (#217, «Enlace otro n»); el `?code=` PKCE de los correos viejos sigue valiendo en el navegador que los pidió.
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
    // El código de un solo uso va con `type=recovery`; con otro `type` (o sin él) no es de esta pantalla. Si trae los dos, gana el de un solo uso.
    const codigoDeUnSoloUso = unico(consulta.token_hash);
    const tipoDelEnlace = unico(consulta.type);
    const hayError = unico(consulta.error) !== undefined;
    const esValido = (valor: unknown): valor is string => typeof valor === "string" && valor !== "" && valor.length <= LARGO_MAXIMO_DEL_CODIGO;

    const { abrirEnlaceAccion, guardarContrasenaAccion, cerrarOtrasSesionesAccion, salirDeLaRecuperacionAccion } = await import("@/auth/acciones-recuperacion");

    let inicial: EstadoInicialDeNuevaContrasena = { paso: "no-valido" };
    if (!hayError && codigoDeUnSoloUso !== undefined) {
      if (esValido(codigoDeUnSoloUso) && tipoDelEnlace === "recovery") inicial = { paso: "abrir", codigo: codigoDeUnSoloUso, tipo: "un-solo-uso" };
    } else if (!hayError && esValido(codigo)) {
      inicial = { paso: "abrir", codigo };
    } else if (!hayError) {
      const enCurso = await (await import("@/auth/recuperacion-servidor")).recuperacionEnCurso();
      if (enCurso) inicial = { paso: "nueva", correo: enCurso.correo };
    }

    return (
      <PantallaNuevaContrasena
        inicial={inicial}
        abrir={abrirEnlaceAccion}
        guardar={guardarContrasenaAccion}
        cerrarOtras={cerrarOtrasSesionesAccion}
        salirDeLaRecuperacion={salirDeLaRecuperacionAccion}
      />
    );
  }
}
