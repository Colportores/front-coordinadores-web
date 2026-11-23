import { Suspense } from "react";

import { fuenteZonas } from "@/datos/equipo/zonas";
import { fuenteZonasSimulada } from "@/datos/equipo/zonas/simulado";
import { AvisoSinCampania } from "@/shell/AvisoSinCampania";
import { ZonasCampaniaDesdeUrl } from "@/features/equipo/zonas/ZonasCampaniaDesdeUrl";
import { ZonasCampaniaLocal } from "@/features/equipo/zonas/ZonasCampaniaLocal";
import { SeccionHu } from "@/dev/SeccionHu";
import { ContenidoPestana } from "@/shell/ContenidoPestana";

/** Vista 24 (HU-CAM-006): zonas de la campaña, con ciudades, zonas radiales o por esquinas y asignación. */
export default async function ZonasPagina() {
  // Sitio de prueba (export estático, sin servidor): no hay server actions, así que la vista le habla a la fuente
  // simulada desde el navegador. La condición es literal y el `import()` está en el `else` para que el módulo con
  // las server actions no entre al build exportado. Ver README, «Sitio de prueba».
  if (process.env.NEXT_PUBLIC_DEPLOY_PAGES === "1") {
    // Siempre la simulada, por construcción: el sitio de prueba nunca lee `fuenteZonas` (el selector).
    const datos = await fuenteZonasSimulada.obtenerZonas();

    return (
      <ContenidoPestana titulo="Ciudades">
        <SeccionHu hu="HU-CAM-006">
          <Suspense fallback={null}>
            <ZonasCampaniaLocal datos={datos} />
          </Suspense>
        </SeccionHu>
      </ContenidoPestana>
    );
  } else {
    const datos = await fuenteZonas.obtenerZonas();
    if (!datos) {
      return (
        <ContenidoPestana titulo="Ciudades">
          <SeccionHu hu="HU-CAM-006">
            <AvisoSinCampania />
          </SeccionHu>
        </ContenidoPestana>
      );
    }
    // Server actions: el navegador pide y el servidor le habla a la fuente (las RPC de Supabase bajo el puente de
    // desarrollo, la simulada en cualquier build de producción).
    const { crearAccionesServidor } = await import("./acciones-servidor");

    return (
      <ContenidoPestana titulo="Ciudades">
        <SeccionHu hu="HU-CAM-006">
          {/* `key`: al elegir otra campaña en el topbar la página se vuelve a pedir (`router.refresh()`), que conserva el estado de
              cliente; sin `key` la vista seguiría con las ciudades y zonas de la campaña anterior (#70). */}
          <Suspense fallback={null}>
            <ZonasCampaniaDesdeUrl key={datos.campaniaId} datos={datos} acciones={crearAccionesServidor(datos.campaniaId)} />
          </Suspense>
        </SeccionHu>
      </ContenidoPestana>
    );
  }
}
