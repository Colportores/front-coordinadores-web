import { fuenteCuentas } from "@/datos/cuentas";
import { SeccionHu } from "@/dev/SeccionHu";
import { CuentasConAccionesSimuladas } from "@/features/cuentas/CuentasConAccionesSimuladas";
import { CuentasLocal } from "@/features/cuentas/CuentasLocal";
import { ContenidoPestana } from "@/shell/ContenidoPestana";

// La vista llena el área bajo el topbar: la columna de ciudades va de borde a borde, sin el padding de las demás pestañas.
const SIN_PADDING = "gap-0 overflow-hidden p-0";
const LLENA = "flex min-h-0 flex-1 flex-col";

/** Vista 36 (HU-CTA-005): Cuentas con casa editora, alquiler y tickets. */
export default async function PestanaCuentas() {
  // Sitio de prueba (export estático): los datos se arman en el navegador con la fuente simulada. La condición es literal
  // para que el build exportado no arrastre la rama del servidor. Ver docs/PESTANAS.md §2.
  if (process.env.NEXT_PUBLIC_DEPLOY_PAGES === "1") {
    return (
      <ContenidoPestana titulo="Cuentas" className={SIN_PADDING}>
        <SeccionHu hu="HU-CTA-005" className={LLENA}>
          <CuentasLocal />
        </SeccionHu>
      </ContenidoPestana>
    );
  } else {
    const datos = await fuenteCuentas.obtenerCuentas();
    return (
      <ContenidoPestana titulo="Cuentas" className={SIN_PADDING}>
        <SeccionHu hu="HU-CTA-005" className={LLENA}>
          {/* `key`: al elegir otra campaña en el topbar la página se vuelve a pedir y el estado de la vista se reinicia. */}
          <CuentasConAccionesSimuladas key={datos.campaniaId} datos={datos} />
        </SeccionHu>
      </ContenidoPestana>
    );
  }
}
