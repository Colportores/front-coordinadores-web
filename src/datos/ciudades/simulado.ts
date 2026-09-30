import type { DatosCiudades, FuenteDatosCiudades } from "@/datos/ciudades/contrato";

/** Datos de ejemplo, coherentes con los de Equipo (mismos colportores y zonas). */
export const DATOS_CIUDADES_SIMULADO: DatosCiudades = {
  campania: "Verano 2026",
  ciudades: [
    {
      id: "montevideo",
      nombre: "Montevideo",
      zonas: [
        {
          id: "cerro-norte",
          nombre: "Cerro Norte",
          colportores: [
            { id: "col-1", nombre: "Diego Rocha" },
            { id: "col-4", nombre: "Joel Cabrera" },
          ],
        },
        {
          id: "la-teja",
          nombre: "La Teja",
          colportores: [
            { id: "col-2", nombre: "Melina Vázquez" },
            { id: "col-6", nombre: "Noelia Acosta" },
          ],
        },
        { id: "paso-de-la-arena", nombre: "Paso de la Arena", colportores: [{ id: "col-6", nombre: "Noelia Acosta" }] },
        { id: "belvedere", nombre: "Belvedere", colportores: [{ id: "col-5", nombre: "Pablo Ferreira" }] },
      ],
      sinAsignar: [{ id: "sz-1", nombre: "Ana Martínez" }],
    },
    {
      id: "las-piedras",
      nombre: "Las Piedras",
      zonas: [{ id: "las-piedras-centro", nombre: "Centro", colportores: [] }],
      sinAsignar: [{ id: "col-3", nombre: "Laura Suárez" }],
    },
  ],
};

export const fuenteCiudadesSimulada: FuenteDatosCiudades = {
  async obtenerCiudades() {
    return DATOS_CIUDADES_SIMULADO;
  },
};
