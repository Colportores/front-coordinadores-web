import { fuenteReportes } from "@/datos/reportes";
import { fuenteReportesSimulada } from "@/datos/reportes/simulado";
import { SeccionHu } from "@/dev/SeccionHu";
import { ReporteHoras } from "@/features/reportes/horas/ReporteHoras";
import { SinCampaniaParaReportes } from "@/features/reportes/horas/SinCampaniaParaReportes";
import { ContenidoPestana } from "@/shell/ContenidoPestana";

/** Vista 32 (HU-REP-001): horas por ciudad y colportor, en días, semanas o meses, con la tendencia de cada cifra. */
export default async function PestanaReportes() {
  // El sitio de prueba (export estático) es siempre simulado por construcción: nunca lee el selector de fuente.
  const fuente = process.env.NEXT_PUBLIC_DEPLOY_PAGES === "1" ? fuenteReportesSimulada : fuenteReportes;
  const horas = await fuente.obtenerHoras();

  return (
    <ContenidoPestana titulo="Reportes" className="gap-0 overflow-hidden p-0">
      {horas ? (
        <SeccionHu hu="HU-REP-001" className="flex min-h-0 flex-1 flex-col">
          <ReporteHoras datos={horas} />
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
}
