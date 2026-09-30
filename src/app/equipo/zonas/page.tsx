import { fuenteZonas } from "@/datos/equipo/zonas";
import type { AccionesZonas } from "@/features/equipo/zonas/ZonasCampania";
import { ZonasCampania } from "@/features/equipo/zonas/ZonasCampania";
import { SeccionHu } from "@/dev/SeccionHu";
import { ContenidoPestana } from "@/shell/ContenidoPestana";

/** Vista 24 (HU-CAM-006): zonas de la campaña, con ciudades, zonas radiales o por esquinas y asignación. */
export default async function ZonasPagina() {
  const datos = await fuenteZonas.obtenerZonas();

  // Server actions: el navegador pide y el servidor le habla a la fuente (hoy simulada, después el BFF).
  const acciones: AccionesZonas = {
    async esquinaMasCercana(ciudadId, punto) {
      "use server";
      return fuenteZonas.esquinaMasCercana(ciudadId, punto);
    },
    async tramoPorCalles(ciudadId, desde, hasta) {
      "use server";
      return fuenteZonas.tramoPorCalles(ciudadId, desde, hasta);
    },
    async vistaPreviaZona(entrada) {
      "use server";
      return fuenteZonas.vistaPreviaZona(entrada);
    },
    async guardarZona(entrada) {
      "use server";
      return fuenteZonas.guardarZona(entrada);
    },
    async asignarZona(usuarioId, zonaId) {
      "use server";
      return fuenteZonas.asignarZona(datos.campaniaId, usuarioId, zonaId);
    },
  };

  return (
    <ContenidoPestana titulo="Zonas de la campaña">
      <SeccionHu hu="HU-CAM-006">
        <ZonasCampania datos={datos} acciones={acciones} />
      </SeccionHu>
    </ContenidoPestana>
  );
}
