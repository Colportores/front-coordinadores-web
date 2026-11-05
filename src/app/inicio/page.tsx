import { fuenteInicio, type TableroDelDia } from "@/datos/inicio";
import { RechazoDelTablero } from "@/datos/inicio/rpc";
import { SeccionHu } from "@/dev/SeccionHu";
import { InicioLocal } from "@/features/inicio/InicioLocal";
import { InicioVista } from "@/features/inicio/InicioVista";
import { RechazoParaInicio } from "@/features/inicio/RechazoParaInicio";
import { SinCampaniaParaInicio } from "@/features/inicio/SinCampaniaParaInicio";
import { ContenidoPestana } from "@/shell/ContenidoPestana";

// La vista llena el área bajo el topbar: la columna de ciudades va de borde a borde, sin el padding de las demás pestañas.
const SIN_PADDING = "gap-0 overflow-hidden p-0";

/** Vista 31 (HU-CAM-008): Inicio, vista rápida por ciudad. */
export default async function PestanaInicio() {
  // Sitio de prueba (export estático, sin servidor): no hay server actions, así que la vista arma los datos en el navegador
  // con la fuente simulada. La condición es literal y el `import()` está en el `else` para que el módulo con las server
  // actions no entre al build exportado. Ver README, «Sitio de prueba».
  if (process.env.NEXT_PUBLIC_DEPLOY_PAGES === "1") {
    return (
      <ContenidoPestana titulo="Inicio" className={SIN_PADDING}>
        <SeccionHu hu="HU-CAM-008" className="min-h-0 flex-1">
          <InicioLocal />
        </SeccionHu>
      </ContenidoPestana>
    );
  } else {
    let tablero: TableroDelDia | null;
    try {
      tablero = await fuenteInicio.obtenerTablero();
    } catch (error) {
      // Un rechazo de la base (por ejemplo, sin permiso) trae su propio texto; una caída sigue a `error.tsx`.
      if (!(error instanceof RechazoDelTablero)) throw error;
      return (
        <ContenidoPestana titulo="Inicio" className={SIN_PADDING}>
          <SeccionHu hu="HU-CAM-008" className="min-h-0 flex-1">
            <RechazoParaInicio mensaje={error.message} />
          </SeccionHu>
        </ContenidoPestana>
      );
    }
    if (!tablero) {
      return (
        <ContenidoPestana titulo="Inicio" className={SIN_PADDING}>
          <SeccionHu hu="HU-CAM-008" className="min-h-0 flex-1">
            <SinCampaniaParaInicio />
          </SeccionHu>
        </ContenidoPestana>
      );
    }
    // Server actions: el navegador pide otro día y el servidor le habla a la fuente.
    const { crearAccionesServidor } = await import("./acciones-servidor");

    return (
      <ContenidoPestana titulo="Inicio" className={SIN_PADDING}>
        <SeccionHu hu="HU-CAM-008" className="min-h-0 flex-1">
          {/* `key`: al elegir otra campaña en el topbar la página se vuelve a pedir (`router.refresh()`), que conserva el
              estado de cliente; sin `key` la vista seguiría con el día de la campaña anterior (#70). */}
          <InicioVista key={tablero.campaniaId} tablero={tablero} acciones={crearAccionesServidor(tablero.campaniaId)} />
        </SeccionHu>
      </ContenidoPestana>
    );
  }
}
