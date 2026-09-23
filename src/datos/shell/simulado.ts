import type { FuenteDatosShell, ResumenCoordinador } from "@/datos/shell/contrato";

/** Datos de ejemplo del diseño ("Panel Coordinador", topbar). */
export const RESUMEN_COORDINADOR_SIMULADO: ResumenCoordinador = {
  nombre: "Coordinador de ejemplo",
  iniciales: "MP",
  region: "Montevideo Oeste",
  campania: "Verano 2026",
};

export const fuenteShellSimulada: FuenteDatosShell = {
  async obtenerResumenCoordinador() {
    return RESUMEN_COORDINADOR_SIMULADO;
  },
};
