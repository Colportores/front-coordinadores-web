import { fuenteZonas } from "@/datos/equipo/zonas";
import { ZonasCampania } from "@/features/equipo/zonas/ZonasCampania";
import { ZonasCampaniaLocal } from "@/features/equipo/zonas/ZonasCampaniaLocal";
import { SeccionHu } from "@/dev/SeccionHu";
import { ContenidoPestana } from "@/shell/ContenidoPestana";

/** Vista 24 (HU-CAM-006): zonas de la campaña, con ciudades, zonas radiales o por esquinas y asignación. */
export default async function ZonasPagina() {
  const datos = await fuenteZonas.obtenerZonas();

  // Sitio de prueba (export estático, sin servidor): no hay server actions, así que la vista le habla a la fuente
  // simulada desde el navegador. La condición es literal y el `import()` está en el `else` para que el módulo con
  // las server actions no entre al build exportado. Ver README, «Sitio de prueba».
  if (process.env.NEXT_PUBLIC_DEPLOY_PAGES === "1") {
    return (
      <ContenidoPestana titulo="Ciudades">
        <SeccionHu hu="HU-CAM-006">
          <ZonasCampaniaLocal datos={datos} />
        </SeccionHu>
      </ContenidoPestana>
    );
  } else {
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
