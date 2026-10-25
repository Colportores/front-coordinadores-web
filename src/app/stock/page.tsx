import { fuenteStock } from "@/datos/stock";
import { fuenteStockSimulada } from "@/datos/stock/simulado";
import { SeccionHu } from "@/dev/SeccionHu";
import { SinCampaniaParaStock } from "@/features/stock/vista-34/SinCampaniaParaStock";
import { StockVista } from "@/features/stock/vista-34/StockVista";
import { ContenidoPestana } from "@/shell/ContenidoPestana";

// La vista llena el área bajo el topbar: la lista de ciudades va de borde a borde, sin el padding de las demás pestañas.
const SIN_PADDING = "gap-0 overflow-hidden p-0";
const LLENA = "flex min-h-0 flex-1 flex-col";

/**
 * Vista 34 (HU-STK-010): el stock por ciudad, producto por producto, y quién lo tiene. Es V2: se conecta después del 20/11
 * (backend-supabase#101) y hasta entonces lee la fuente simulada; el shell oculta la pestaña fuera del modo dev
 * (`src/app/stock/layout.tsx`). Los pedidos y las transferencias son de la vista 35 (front-coordinadores-web#66).
 */
export default async function PestanaStock() {
  // Sitio de prueba (export estático): siempre la fuente simulada, por construcción; nunca el selector `fuenteStock`.
  // La condición es literal para que el build exportado no arrastre la otra rama. Ver docs/PESTANAS.md §2.
  const datos = process.env.NEXT_PUBLIC_DEPLOY_PAGES === "1" ? await fuenteStockSimulada.obtenerStock() : await fuenteStock.obtenerStock();

  return (
    <ContenidoPestana titulo="Stock" className={SIN_PADDING}>
      <SeccionHu hu="HU-STK-010" className={LLENA}>
        {/* `key`: al elegir otra campaña en el topbar la página se vuelve a pedir y el estado de la vista se reinicia. */}
        {datos ? <StockVista key={datos.campaniaId} datos={datos} /> : <SinCampaniaParaStock />}
      </SeccionHu>
    </ContenidoPestana>
  );
}
