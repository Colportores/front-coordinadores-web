import { Suspense } from "react";

import { accionesPedidos, fuentePedidos } from "@/datos/stock/pedidos";
import { SeccionHu } from "@/dev/SeccionHu";
import { PedidosDesdeUrl } from "@/features/stock/vista-35/PedidosDesdeUrl";
import { PedidosLocal } from "@/features/stock/vista-35/PedidosLocal";
import { AvisoSinCampania } from "@/shell/AvisoSinCampania";
import { ContenidoPestana } from "@/shell/ContenidoPestana";

// La vista llena el área bajo el topbar: la lista de ciudades va de borde a borde, sin el padding de las demás pestañas.
const SIN_PADDING = "gap-0 overflow-hidden p-0";
const LLENA = "flex min-h-0 flex-1 flex-col";

/**
 * Vista 35 (HU-STK-001 · HU-STK-003 · HU-STK-005): los pedidos y las transferencias que el coordinador autoriza o rechaza.
 * Es V2, conectada después del 20/11 (#215, backend-supabase#104): lee y decide con las RPC de la bandeja cuando el panel tiene
 * Supabase (`src/datos/stock/pedidos/index.ts`); si no, con la simulada. El shell oculta la pestaña Stock (y con ella esta
 * ruta) fuera del modo dev (`src/app/stock/layout.tsx`).
 */
export default async function PedidosYTransferencias() {
  // Sitio de prueba (export estático): los datos se arman en el navegador con la fuente simulada. La condición es literal
  // para que el build exportado no arrastre la rama del servidor. Ver docs/PESTANAS.md §2.
  if (process.env.NEXT_PUBLIC_DEPLOY_PAGES === "1") {
    return (
      <ContenidoPestana titulo="Pedidos y transferencias" className={SIN_PADDING}>
        <SeccionHu hu="HU-STK-003" className={LLENA}>
          <Suspense fallback={null}>
            <PedidosLocal />
          </Suspense>
        </SeccionHu>
      </ContenidoPestana>
    );
  } else {
    const datos = await fuentePedidos.obtenerPedidos();
    // Con Supabase, server actions (el navegador pide y el servidor decide con la sesión); sin él, las simuladas del navegador.
    const acciones = datos && accionesPedidos ? (await import("./acciones-servidor")).crearAccionesPedidos() : undefined;
    return (
      <ContenidoPestana titulo="Pedidos y transferencias" className={SIN_PADDING}>
        <SeccionHu hu="HU-STK-003" className={LLENA}>
          {/* `key`: al elegir otra campaña en el topbar la página se vuelve a pedir y el estado de la vista se reinicia. */}
          {datos ? (
            <Suspense fallback={null}>
              <PedidosDesdeUrl key={datos.campaniaId} datos={datos} acciones={acciones} />
            </Suspense>
          ) : (
            <AvisoSinCampania className="m-[22px]" />
          )}
        </SeccionHu>
      </ContenidoPestana>
    );
  }
}
