import { fuenteZonas } from "@/datos/equipo/zonas";
import type { AccionesZonas } from "@/features/equipo/zonas/ZonasCampania";

/**
 * Server actions de la vista 24: el navegador pide y el servidor le habla a la
 * fuente (hoy simulada, después el BFF). `campaniaId` queda atado a cada acción
 * (Next lo cifra), el navegador no lo puede cambiar.
 *
 * Este módulo no entra al build exportado del sitio de prueba (no hay servidor
 * ahí): la página lo importa solo cuando no es ese build. Ver README, «Sitio de prueba».
 */
export function crearAccionesServidor(campaniaId: string): AccionesZonas {
  return {
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
      return fuenteZonas.asignarZona(campaniaId, usuarioId, zonaId);
    },
    async quitarZona(usuarioId) {
      "use server";
      return fuenteZonas.quitarZona(campaniaId, usuarioId);
    },
    async eliminarZona(zonaId) {
      "use server";
      return fuenteZonas.eliminarZona(campaniaId, zonaId);
    },
    async buscarCiudades(texto) {
      "use server";
      return fuenteZonas.buscarCiudades(campaniaId, texto);
    },
    async agregarCiudad(catalogoId) {
      "use server";
      return fuenteZonas.agregarCiudad(campaniaId, catalogoId);
    },
  };
}
