import type { CampaniaElegible, FuenteDatosShell, ResumenCoordinador } from "@/datos/shell/contrato";

/** Campañas de ejemplo (la primera es la que ve el panel simulado: la de las vistas simuladas). */
export const CAMPANIAS_SIMULADAS: CampaniaElegible[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    nombre: "Verano 2026",
    ciudades: ["Montevideo Oeste"],
    fechaInicio: "2026-09-01",
    fechaFin: "2026-12-31",
    estado: "en-curso",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    nombre: "Permanente 2026",
    ciudades: ["Salto"],
    fechaInicio: "2026-03-01",
    fechaFin: "2026-11-30",
    estado: "en-curso",
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    nombre: "Verano 2027",
    ciudades: ["Maldonado", "Punta del Este", "San Carlos"],
    fechaInicio: "2027-01-04",
    fechaFin: "2027-03-31",
    estado: "por-empezar",
  },
];

/** Datos de ejemplo del diseño ("Panel Coordinador", topbar). */
export const RESUMEN_COORDINADOR_SIMULADO: ResumenCoordinador = {
  nombre: "Coordinador de ejemplo",
  iniciales: "MP",
  region: "Montevideo Oeste",
  campania: "Verano 2026",
  campaniaId: CAMPANIAS_SIMULADAS[0].id,
};

export const fuenteShellSimulada: FuenteDatosShell = {
  async obtenerResumenCoordinador() {
    return RESUMEN_COORDINADOR_SIMULADO;
  },
  async listarCampanias() {
    return CAMPANIAS_SIMULADAS;
  },
};
