import { accionesValidarTickets, fuenteValidarTickets } from "@/datos/cuentas/validar";
import { SeccionHu } from "@/dev/SeccionHu";
import { ValidarTicketsConAccionesSimuladas } from "@/features/cuentas/vista-29/ValidarTicketsConAccionesSimuladas";
import { ValidarTicketsLocal } from "@/features/cuentas/vista-29/ValidarTicketsLocal";
import { ValidarTicketsVista } from "@/features/cuentas/vista-29/ValidarTicketsVista";
import { ContenidoPestana } from "@/shell/ContenidoPestana";

// La vista llena el área bajo el topbar, como Cuentas.
const SIN_PADDING = "gap-0 overflow-hidden p-0";
const LLENA = "flex min-h-0 flex-1 flex-col";

/**
 * Vista 29 (HU-COB-008): «Validar tickets», solo depósitos y retiros por el coordinador (decisión de Cristian del 10/11,
 * «Ticket dep.» y «Retiro rech.»). Es la primera de Cuentas conectada a Supabase («Conectar 29», #170): lee y decide con
 * las RPC de la base cuando el panel tiene Supabase (`src/datos/cuentas/validar/index.ts`); si no, con la simulada. El shell
 * oculta la pestaña (y con ella esta ruta) mientras su flag está apagado (`src/app/cuentas/layout.tsx`).
 */
export default async function ValidarTickets() {
  // Sitio de prueba (export estático): los datos se arman en el navegador con la fuente simulada. Ver docs/PESTANAS.md §2.
  if (process.env.NEXT_PUBLIC_DEPLOY_PAGES === "1") {
    return (
      <ContenidoPestana titulo="Validar tickets" className={SIN_PADDING}>
        <SeccionHu hu="HU-COB-008" className={LLENA}>
          <ValidarTicketsLocal />
        </SeccionHu>
      </ContenidoPestana>
    );
  } else {
    const datos = await fuenteValidarTickets.obtenerPorValidar();
    // Con Supabase, server actions (el navegador pide y el servidor decide con la sesión); sin él, las simuladas del navegador.
    const acciones = accionesValidarTickets ? (await import("./acciones-servidor")).crearAccionesValidarTickets() : null;
    return (
      <ContenidoPestana titulo="Validar tickets" className={SIN_PADDING}>
        <SeccionHu hu="HU-COB-008" className={LLENA}>
          {/* `key`: al elegir otra campaña en el topbar la página se vuelve a pedir y el estado de la vista se reinicia. */}
          {acciones ? (
            <ValidarTicketsVista key={datos.campaniaId} datos={datos} acciones={acciones} />
          ) : (
            <ValidarTicketsConAccionesSimuladas key={datos.campaniaId} datos={datos} />
          )}
        </SeccionHu>
      </ContenidoPestana>
    );
  }
}
