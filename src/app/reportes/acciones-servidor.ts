import { modoDeAcceso } from "@/auth/modo";
import { informeNoDisponible, type DescargarInforme, type PedidoDeInforme } from "@/datos/reportes/informe";

/** Lo que la vista 32 le pide al servidor además de los datos con que carga: bajar el «Informe PDF». */
export interface AccionesReportes {
  descargarInforme: DescargarInforme;
}

/**
 * Server actions de la vista 32 (issue #84): el navegador pide el informe y el servidor se lo pide a la Edge Function
 * `informe-reportes` con la sesión de la coordinadora (las cookies del pedido). La campaña sale de la cookie que eligió en
 * el topbar y la función la comprueba contra las suyas. Sin Supabase detrás (desarrollo sin variables, puente de la demo)
 * no hay función: queda el aviso de `informeNoDisponible`.
 *
 * Este módulo no entra al build exportado del sitio de prueba (no hay servidor ahí): la página lo importa solo cuando no
 * es ese build. Ver README, «Sitio de prueba».
 */
export function crearAccionesReportes(): AccionesReportes {
  return {
    async descargarInforme(pedido: PedidoDeInforme) {
      "use server";
      if (modoDeAcceso() !== "activo") return informeNoDisponible(pedido);
      // Imports dinámicos: este módulo cuelga de la página y no debe arrastrar `next/headers` a ningún bundle del navegador.
      const [{ crearSupabaseDeServidor }, { leerCampaniaElegida }, { pedirInformePdf }] = await Promise.all([
        import("@/auth/supabase-servidor"),
        import("@/datos/shell/campania-elegida-servidor"),
        import("@/datos/reportes/informe-edge"),
      ]);
      return pedirInformePdf(await crearSupabaseDeServidor(), pedido, await leerCampaniaElegida());
    },
  };
}
