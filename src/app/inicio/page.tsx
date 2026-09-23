import { fuenteInicio } from "@/datos/inicio";
import { SeccionHu } from "@/dev/SeccionHu";
import { TarjetaActividadHoy } from "@/features/inicio/TarjetaActividadHoy";
import { TarjetaAvancePorZona } from "@/features/inicio/TarjetaAvancePorZona";
import { TarjetaKpis } from "@/features/inicio/TarjetaKpis";
import { TarjetaPendientesAccion } from "@/features/inicio/TarjetaPendientesAccion";
import { ContenidoPestana } from "@/shell/ContenidoPestana";

export default async function PestanaInicio() {
  const tablero = await fuenteInicio.obtenerTablero();

  return (
    <ContenidoPestana titulo="Inicio">
      <SeccionHu hu="HU-CAM-008">
        <TarjetaKpis kpis={tablero.kpis} />
      </SeccionHu>

      <div className="grid grid-cols-[1fr_340px] items-start gap-4">
        <div className="flex flex-col gap-4">
          <SeccionHu hu="HU-CAM-008">
            <TarjetaActividadHoy filas={tablero.actividadHoy} />
          </SeccionHu>
          <SeccionHu hu="HU-CAM-008">
            <TarjetaAvancePorZona zonas={tablero.avancePorZona} />
          </SeccionHu>
        </div>

        <SeccionHu hu="HU-CAM-008">
          <TarjetaPendientesAccion pendientes={tablero.pendientes} mapa={tablero.mapaRegion} />
        </SeccionHu>
      </div>
    </ContenidoPestana>
  );
}
