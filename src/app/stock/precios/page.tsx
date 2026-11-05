import { fuentePrecios } from "@/datos/precios";
import { SeccionHu } from "@/dev/SeccionHu";
import { PreciosLocal } from "@/features/stock/vista-27/PreciosLocal";
import { PreciosVista } from "@/features/stock/vista-27/PreciosVista";
import { SinCampaniaParaPrecios } from "@/features/stock/vista-27/SinCampaniaParaPrecios";
import { ContenidoPestana } from "@/shell/ContenidoPestana";

/**
 * Vista 27 (HU-CAT-005): el precio de venta general y las excepciones de cada ciudad de la campaña. El canvas la cuelga de
 * Stock («‹ Stock / Precios»), así que vive en `/stock/precios` y comparte el flag de la pestaña (`src/app/stock/layout.tsx`).
 */
export default async function Precios() {
  // Sitio de prueba (export estático): los datos y los guardados se arman en el navegador con la fuente simulada. La condición
  // es literal para que el build exportado no arrastre la rama del servidor. Ver docs/PESTANAS.md §2.
  if (process.env.NEXT_PUBLIC_DEPLOY_PAGES === "1") {
    return (
      <ContenidoPestana titulo="Precios de venta">
        <SeccionHu hu="HU-CAT-005">
          <PreciosLocal />
        </SeccionHu>
      </ContenidoPestana>
    );
  } else {
    const datos = await fuentePrecios.obtenerPrecios();
    if (!datos) {
      return (
        <ContenidoPestana titulo="Precios de venta">
          <SeccionHu hu="HU-CAT-005">
            <SinCampaniaParaPrecios />
          </SeccionHu>
        </ContenidoPestana>
      );
    }
    // Server actions: el navegador pide y el servidor le habla a la fuente.
    const { crearAccionesPrecios } = await import("./acciones-servidor");
    return (
      <ContenidoPestana titulo="Precios de venta">
        <SeccionHu hu="HU-CAT-005">
          {/* `key`: al elegir otra campaña en el topbar la página se vuelve a pedir y el estado de la vista se reinicia. */}
          <PreciosVista key={datos.campaniaId} datos={datos} acciones={crearAccionesPrecios(datos.campaniaId)} />
        </SeccionHu>
      </ContenidoPestana>
    );
  }
}
