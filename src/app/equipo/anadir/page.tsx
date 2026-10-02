import { fuenteEquipo } from "@/datos/equipo";
import { SeccionHu } from "@/dev/SeccionHu";
import { AnadirColportor } from "@/features/equipo/AnadirColportor";
import { AnadirColportorLocal } from "@/features/equipo/AnadirColportorLocal";
import { ContenidoPestana } from "@/shell/ContenidoPestana";

/** Vista 23 (HU-CAM-004): añadir colportor a la campaña. Cuelga de la pestaña Equipo. */
export default async function AnadirColportorPagina() {
  const datos = await fuenteEquipo.obtenerAnadirColportor();

  // Sitio de prueba (export estático, sin servidor): no hay server actions, así que la vista le habla a la fuente
  // simulada desde el navegador. La condición es literal y el `import()` está en el `else` para que el módulo con
  // la server action no entre al build exportado. Ver README, «Sitio de prueba».
  if (process.env.NEXT_PUBLIC_DEPLOY_PAGES === "1") {
    return (
      <ContenidoPestana titulo="Añadir colportor">
        <SeccionHu hu="HU-CAM-004">
          <AnadirColportorLocal datos={datos} />
        </SeccionHu>
      </ContenidoPestana>
    );
  } else {
    const { crearInscribirServidor } = await import("./inscribir-servidor");

    return (
      <ContenidoPestana titulo="Añadir colportor">
        <SeccionHu hu="HU-CAM-004">
          <AnadirColportor datos={datos} inscribir={crearInscribirServidor(datos.campaniaId)} />
        </SeccionHu>
      </ContenidoPestana>
    );
  }
}
