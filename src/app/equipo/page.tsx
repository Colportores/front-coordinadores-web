import Link from "next/link";

import { Button } from "@/components/ui/button";
import { fuenteEquipo } from "@/datos/equipo";
import { SeccionHu } from "@/dev/SeccionHu";
import { Acompanamientos } from "@/features/equipo/Acompanamientos";
import { PreciosPorCiudad } from "@/features/equipo/PreciosPorCiudad";
import { SinZonaAsignada } from "@/features/equipo/SinZonaAsignada";
import { TablaColportores } from "@/features/equipo/TablaColportores";
import { ContenidoPestana } from "@/shell/ContenidoPestana";

export default async function PestanaEquipo() {
  const equipo = await fuenteEquipo.obtenerEquipo();

  return (
    <ContenidoPestana titulo="Equipo">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-[21px] font-semibold text-tinta">Mi equipo · {equipo.region}</h2>
        <div className="flex items-center gap-2.5">
          <Button asChild variant="outline" className="text-chico font-semibold text-tinta-2">
            <Link href="/equipo/anadir">+ Añadir colportor</Link>
          </Button>
          <Button asChild className="text-chico font-semibold">
            <Link href="/ciudades">+ Asignar colportor a zona</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_320px] items-start gap-4">
        <SeccionHu hu="HU-CAM-004">
          <TablaColportores colportores={equipo.colportores} />
        </SeccionHu>

        <div className="flex flex-col gap-4">
          <SeccionHu hu="HU-CAM-006">
            <SinZonaAsignada colportores={equipo.sinZonaAsignada} />
          </SeccionHu>
          <SeccionHu hu="HU-CAT-005">
            <PreciosPorCiudad ciudades={equipo.preciosPorCiudad} />
          </SeccionHu>
          <SeccionHu hu="HU-JOR-004">
            <Acompanamientos datos={equipo.acompanamiento} />
          </SeccionHu>
        </div>
      </div>
    </ContenidoPestana>
  );
}
