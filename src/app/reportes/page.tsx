import { fuenteReportes } from "@/datos/reportes";
import { fuenteReportesSimulada } from "@/datos/reportes/simulado";
import { SeccionHu } from "@/dev/SeccionHu";
import { ReporteHoras } from "@/features/reportes/horas/ReporteHoras";
import { ReporteHorasLocal } from "@/features/reportes/horas/ReporteHorasLocal";
import { SinCampaniaParaReportes } from "@/features/reportes/horas/SinCampaniaParaReportes";
import { ContenidoPestana } from "@/shell/ContenidoPestana";

/**
 * Vista 32 (HU-REP-001 y HU-REP-002): horas, presentaciones y ventas por ciudad y colportor, en días, semanas o
 * meses, con la tendencia de cada cifra. El % por cobrar es V2 y no se muestra todavía. El «Informe PDF» lo arma el
 * servidor (Edge Function `informe-reportes`, HU-REP-005, issue #84).
 */
export default async function PestanaReportes() {
  // Sitio de prueba (export estático, sin servidor): no hay server actions, así que la vista usa la variante local, con la
  // fuente simulada por construcción (nunca el selector) y sin «Informe PDF» del servidor. La condición es literal y el
  // `import()` está en el `else` para que el módulo con las server actions no entre al build exportado. Ver README,
  // «Sitio de prueba».
  if (process.env.NEXT_PUBLIC_DEPLOY_PAGES === "1") {
    const horas = await fuenteReportesSimulada.obtenerHoras();
    return (
      <ContenidoPestana titulo="Reportes" className="gap-0 overflow-hidden p-0">
        {horas ? (
          <SeccionHu hu="HU-REP-001" className="flex min-h-0 flex-1 flex-col">
            <ReporteHorasLocal datos={horas} />
          </SeccionHu>
        ) : (
          <div className="p-[22px]">
            <SeccionHu hu="HU-REP-001">
              <SinCampaniaParaReportes />
            </SeccionHu>
          </div>
        )}
      </ContenidoPestana>
    );
  } else {
    const horas = await fuenteReportes.obtenerHoras();
    if (!horas) {
      return (
        <ContenidoPestana titulo="Reportes" className="gap-0 overflow-hidden p-0">
          <div className="p-[22px]">
            <SeccionHu hu="HU-REP-001">
              <SinCampaniaParaReportes />
            </SeccionHu>
          </div>
        </ContenidoPestana>
      );
    }
    // Server action: el navegador pide el informe y el servidor se lo pide a la Edge Function con la sesión de la coordinadora.
    const { crearAccionesReportes } = await import("./acciones-servidor");
    const acciones = crearAccionesReportes();

    return (
      <ContenidoPestana titulo="Reportes" className="gap-0 overflow-hidden p-0">
        <SeccionHu hu="HU-REP-001" className="flex min-h-0 flex-1 flex-col">
          <ReporteHoras datos={horas} descargarInforme={acciones.descargarInforme} />
        </SeccionHu>
      </ContenidoPestana>
    );
  }
}
