import { Button } from "@/components/ui/button";
import { fuenteStock } from "@/datos/stock";
import { ChipHu } from "@/dev/ChipHu";
import { SeccionHu } from "@/dev/SeccionHu";
import { FlujoPedidos } from "@/features/stock/FlujoPedidos";
import { KpisStock } from "@/features/stock/KpisStock";
import { PedidosCasaEditora } from "@/features/stock/PedidosCasaEditora";
import { StockPorColportor } from "@/features/stock/StockPorColportor";
import { TransferenciasColportores } from "@/features/stock/TransferenciasColportores";
import { ContenidoPestana } from "@/shell/ContenidoPestana";

// Pestaña Stock (docs/PESTANAS.md). Sus HU están bloqueadas hasta V2 (después
// del 27/11): la UI se hace igual, con datos simulados; el shell ya la oculta
// fuera del modo dev (src/app/stock/layout.tsx).
export default async function PestanaStock() {
  const { kpis, pedidos, transferencias, stockPorColportor } = await fuenteStock.obtenerStock();

  return (
    <ContenidoPestana titulo="Stock">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-[21px] font-semibold text-tinta">Stock y pedidos</h2>
        {/* El formulario de "Pedido a casa editora" no está diseñado (HU-STK-001): botón sin comportamiento. */}
        <span className="relative inline-flex">
          <Button className="rounded-control bg-marca text-superficie hover:bg-marca/90">
            + Pedido a casa editora
          </Button>
          <ChipHu hu="HU-STK-001" className="absolute -top-2.5 -right-2 z-20" />
        </span>
      </div>

      <KpisStock kpis={kpis} />

      <div className="grid grid-cols-[1fr_320px] items-start gap-4">
        <div className="flex flex-col gap-4">
          <SeccionHu hu="HU-STK-001">
            <PedidosCasaEditora pedidos={pedidos} />
          </SeccionHu>
          <SeccionHu hu="HU-STK-005">
            <TransferenciasColportores transferencias={transferencias} />
          </SeccionHu>
        </div>
        <div className="flex flex-col gap-4">
          <SeccionHu hu="HU-STK-004">
            <StockPorColportor stock={stockPorColportor} />
          </SeccionHu>
          <SeccionHu hu="HU-STK-003">
            <FlujoPedidos />
          </SeccionHu>
        </div>
      </div>
    </ContenidoPestana>
  );
}
