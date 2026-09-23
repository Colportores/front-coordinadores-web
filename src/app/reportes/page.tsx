import { fuenteReportes } from "@/datos/reportes";
import { SeccionHu } from "@/dev/SeccionHu";
import { ExportarReportes } from "@/features/reportes/ExportarReportes";
import { FiltrosReportes } from "@/features/reportes/FiltrosReportes";
import { GraficoVentasSemanales } from "@/features/reportes/GraficoVentasSemanales";
import { HorasPorColportor } from "@/features/reportes/HorasPorColportor";
import { MapaRegionPlaceholder } from "@/features/reportes/MapaRegionPlaceholder";
import { ResumenCampania } from "@/features/reportes/ResumenCampania";
import { ContenidoPestana } from "@/shell/ContenidoPestana";

export default async function PestanaReportes() {
  const datos = await fuenteReportes.obtenerReportes();

  return (
    <ContenidoPestana titulo="Reportes">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-[21px] font-semibold text-tinta">Reportes · {datos.region}</h2>
        <FiltrosReportes />
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] items-start gap-4">
        <div className="flex flex-col gap-4">
          <SeccionHu hu="HU-REP-002">
            <GraficoVentasSemanales semanas={datos.ventasPorSemana} />
          </SeccionHu>
          <SeccionHu hu="HU-REP-001">
            <HorasPorColportor colportores={datos.horasPorColportor} />
          </SeccionHu>
        </div>

        <div className="flex flex-col gap-4">
          <SeccionHu hu="HU-REP-002">
            <ResumenCampania resumen={datos.resumenCampania} />
          </SeccionHu>
          <SeccionHu hu="HU-REP-004">
            <MapaRegionPlaceholder region={datos.region} marcadores={datos.marcadoresMapa} />
          </SeccionHu>
          <SeccionHu hu="HU-REP-005">
            <ExportarReportes />
          </SeccionHu>
        </div>
      </div>
    </ContenidoPestana>
  );
}
