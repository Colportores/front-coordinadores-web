import { fuenteZonas } from "@/datos/equipo/zonas";
import { fuenteZonasSimulada } from "@/datos/equipo/zonas/simulado";
import { ZonasCampania } from "@/features/equipo/zonas/ZonasCampania";
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
          <ZonasCampaniaLocal datos={datos} />
        </SeccionHu>
      </ContenidoPestana>
    );
  } else {
    const datos = await fuenteZonas.obtenerZonas();
    // Server actions: el navegador pide y el servidor le habla a la fuente (hoy simulada, después el BFF).
    const { crearAccionesServidor } = await import("./acciones-servidor");

    return (
      <ContenidoPestana titulo="Ciudades">
        <SeccionHu hu="HU-CAM-006">
          <ZonasCampania datos={datos} acciones={crearAccionesServidor(datos.campaniaId)} />
        </SeccionHu>
      </ContenidoPestana>
    );
  }
}
