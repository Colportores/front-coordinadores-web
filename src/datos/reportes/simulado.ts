import type { DatosReportes, FuenteDatosReportes } from "@/datos/reportes/contrato";

/** Datos de ejemplo del diseño ("Panel Coordinador", pestaña Reportes). */
export const DATOS_REPORTES_SIMULADOS: DatosReportes = {
  region: "Montevideo Oeste",
  ventasPorSemana: [
    { semana: "S1", montoMiles: 200 },
    { semana: "S2", montoMiles: 290 },
    { semana: "S3", montoMiles: 360 },
    { semana: "S4", montoMiles: 320 },
    { semana: "S5", montoMiles: 450 },
    { semana: "S6", montoMiles: 615 },
    { semana: "S7", montoMiles: 700 },
    { semana: "S8", montoMiles: 505, semanaActual: true },
  ],
  horasPorColportor: [
    { id: "col-1", nombre: "Melina Vázquez", horas: 31.0 },
    { id: "col-2", nombre: "Diego Rocha", horas: 28.4 },
    { id: "col-3", nombre: "Laura Suárez", horas: 26.2 },
    { id: "col-4", nombre: "Noelia Acosta", horas: 24.6 },
    { id: "col-5", nombre: "Pablo Ferreira", horas: 11.5, horasBajas: true },
  ],
  resumenCampania: {
    horasTotalesRegion: 2214,
    librosColocados: 784,
    visitasRegistradas: 3196,
    porcentajeJornadasAcompanadas: 21,
    porcentajeCobradoSobreVendido: 71,
  },
  marcadoresMapa: [
    { id: "m-1", cantidad: 5, left: 24, top: 30 },
    { id: "m-2", cantidad: 4, left: 52, top: 52 },
    { id: "m-3", cantidad: 3, left: 70, top: 28 },
    { id: "m-4", cantidad: 2, left: 62, top: 70 },
  ],
};

export const fuenteReportesSimulada: FuenteDatosReportes = {
  async obtenerReportes() {
    return DATOS_REPORTES_SIMULADOS;
  },
};
