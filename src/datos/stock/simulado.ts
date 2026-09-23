import type { DatosStock, FuenteDatosStock } from "@/datos/stock/contrato";

/** Datos de ejemplo del diseño ("Panel Coordinador", sección STOCK). */
export const DATOS_STOCK_SIMULADO: DatosStock = {
  kpis: {
    librosEnCampo: 486,
    pedidosEnCurso: 2,
    transferenciasPendientes: 1,
  },
  pedidos: [
    { id: "#214", solicitante: "J. Cabrera", libros: 25, monto: 19_800, estado: "por_autorizar" },
    { id: "#208", solicitante: "M. Vázquez", libros: 40, monto: 58_000, estado: "despachado" },
    { id: "#196", solicitante: "D. Rocha", libros: 60, monto: 71_500, estado: "entregado" },
  ],
  transferencias: [
    {
      id: "t1",
      colportorOrigen: "Diego Rocha",
      colportorDestino: "Joel Cabrera",
      producto: "El Deseado de Todas…",
      cantidad: 12,
      estado: "por_autorizar",
    },
    {
      id: "t2",
      colportorOrigen: "Melina Vázquez",
      colportorDestino: "Noelia Acosta",
      producto: "Vida Sana · 3 tomos",
      cantidad: 4,
      estado: "autorizada",
      fechaResolucion: "08 jun",
    },
  ],
  stockPorColportor: [
    { colportorId: "c1", nombre: "Diego Rocha", libros: 64, stockBajo: false },
    { colportorId: "c2", nombre: "Melina Vázquez", libros: 51, stockBajo: false },
    { colportorId: "c3", nombre: "Laura Suárez", libros: 47, stockBajo: false },
    { colportorId: "c4", nombre: "Noelia Acosta", libros: 38, stockBajo: false },
    { colportorId: "c5", nombre: "Joel Cabrera", libros: 6, stockBajo: true },
  ],
};

export const fuenteStockSimulada: FuenteDatosStock = {
  async obtenerStock() {
    return DATOS_STOCK_SIMULADO;
  },
};
