import { fuenteCiudades } from "@/datos/ciudades";
import { SeccionHu } from "@/dev/SeccionHu";
import { ListaCiudades } from "@/features/ciudades/ListaCiudades";
import { ContenidoPestana } from "@/shell/ContenidoPestana";

export default async function PestanaCiudades() {
  const { campania, ciudades } = await fuenteCiudades.obtenerCiudades();

  return (
    <ContenidoPestana titulo="Ciudades">
      <h2 className="font-serif text-[21px] font-semibold text-tinta">Ciudades · {campania}</h2>
      <SeccionHu hu="HU-CAM-006">
        <ListaCiudades ciudades={ciudades} />
      </SeccionHu>
    </ContenidoPestana>
  );
}
