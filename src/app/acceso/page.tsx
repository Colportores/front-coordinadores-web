import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { destinoSeguro, motivoDeAccesoValido } from "@/auth/guarda";
import { modoDeAcceso } from "@/auth/modo";
import { PantallaDeAcceso } from "@/features/acceso/PantallaDeAcceso";
import { ContenidoPestana } from "@/shell/ContenidoPestana";
import { RUTA_INICIAL } from "@/shell/pestanas";

export const metadata: Metadata = {
  title: "Acceso · Colportaje · Coordinador",
  robots: { index: false, follow: false },
};

/**
 * Vista 38: acceso al panel de coordinadores (issue #18). Sin marco del panel: el layout lo saca por la cabecera que pone
 * `src/proxy.ts` (la persona todavía no entró).
 *
 * - Con las variables públicas de Supabase (`modoDeAcceso`), la pantalla de acceso. Cada artboard del canvas es un estado de
 *   `PantallaDeAcceso`; el motivo (`?motivo=`) y el destino (`?siguiente=`) los pone la guarda de rutas.
 * - Sin ellas, el panel no tiene login: no hay nada que hacer acá y se vuelve al inicio.
 * - Sitio de prueba (export estático, sin servidor): no hay cuentas ni sesión. La condición es literal y los `import()` están en
 *   el `else` para que las server actions y las cookies no entren al build exportado. Ver README, «Sitio de prueba».
 */
export default async function AccesoPagina({ searchParams }: PageProps<"/acceso">) {
  if (process.env.NEXT_PUBLIC_DEPLOY_PAGES === "1") {
    return (
      <ContenidoPestana titulo="Acceso">
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
  } else {
    if (modoDeAcceso() === "apagado") redirect(RUTA_INICIAL);

    const consulta = await searchParams;
    const unico = (valor: string | string[] | undefined) => (Array.isArray(valor) ? valor[0] : valor);
    const motivo = motivoDeAccesoValido(unico(consulta.motivo));
    const siguiente = destinoSeguro(unico(consulta.siguiente));

    const { iniciarSesionAccion, cerrarSesionAccion } = await import("@/auth/acciones");
    // El artboard 04 nombra la cuenta; si llegó por la guarda, todavía tiene la sesión abierta y se le pregunta a la base.
    const correoSinAcceso = motivo === "sin-acceso" ? await (await import("@/auth/correo-de-sesion")).correoDeLaSesion() : null;

    return (
      <PantallaDeAcceso
        motivo={motivo}
        siguiente={siguiente}
        correoSinAcceso={correoSinAcceso}
        iniciar={iniciarSesionAccion}
        cerrar={cerrarSesionAccion}
      />
    );
  }
}
