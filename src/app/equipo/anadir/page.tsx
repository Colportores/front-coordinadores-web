import { fuenteEquipo } from "@/datos/equipo";
import type { ResultadoInscripcion } from "@/datos/equipo";
import { SeccionHu } from "@/dev/SeccionHu";
import { AnadirColportor } from "@/features/equipo/AnadirColportor";
import { ContenidoPestana } from "@/shell/ContenidoPestana";

/** Vista 23 (HU-CAM-004): añadir colportor a la campaña. Cuelga de la pestaña Equipo. */
export default async function AnadirColportorPagina() {
  const datos = await fuenteEquipo.obtenerAnadirColportor();

  async function inscribir(usuarioId: string): Promise<ResultadoInscripcion> {
    "use server";
    return fuenteEquipo.inscribirColportor(datos.campaniaId, usuarioId);
  }

  return (
    <ContenidoPestana titulo="Añadir colportor">
      <SeccionHu hu="HU-CAM-004">
        <AnadirColportor datos={datos} inscribir={inscribir} />
      </SeccionHu>
    </ContenidoPestana>
  );
}
