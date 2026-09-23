import { fuenteCuentas } from "@/datos/cuentas";
import { SeccionHu } from "@/dev/SeccionHu";
import { ResumenCuentasEquipo } from "@/features/cuentas/ResumenCuentasEquipo";
import { TablaEstadoCuenta } from "@/features/cuentas/TablaEstadoCuenta";
import { TicketsPorValidar } from "@/features/cuentas/TicketsPorValidar";
import { ContenidoPestana } from "@/shell/ContenidoPestana";

export default async function PestanaCuentas() {
  const [resumen, estadoCuenta, ticketsPorValidar] = await Promise.all([
    fuenteCuentas.obtenerResumenEquipo(),
    fuenteCuentas.obtenerEstadoCuenta(),
    fuenteCuentas.obtenerTicketsPorValidar(),
  ]);

  return (
    <ContenidoPestana titulo="Cuentas">
      <SeccionHu hu="HU-CTA-005">
        <ResumenCuentasEquipo resumen={resumen} />
      </SeccionHu>

      <div className="grid grid-cols-[1fr_340px] items-start gap-4">
        <SeccionHu hu="HU-CTA-005">
          <TablaEstadoCuenta filas={estadoCuenta.filas} />
        </SeccionHu>
        <SeccionHu hu="HU-COB-008">
          <TicketsPorValidar lista={ticketsPorValidar} />
        </SeccionHu>
      </div>
    </ContenidoPestana>
  );
}
