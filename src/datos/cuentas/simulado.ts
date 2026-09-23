import type {
  FilaEstadoCuenta,
  FuenteDatosCuentas,
  ListaTicketsPorValidar,
  ResumenCuentasEquipo,
  TicketPorValidar,
} from "@/datos/cuentas/contrato";

/** Datos de ejemplo del diseño ("Panel Coordinador", pestaña Cuentas). */
export const RESUMEN_CUENTAS_SIMULADO: ResumenCuentasEquipo = {
  deudaTotal: 214300,
  depositadoCampania: 398700,
};

export const FILAS_ESTADO_CUENTA_SIMULADAS: FilaEstadoCuenta[] = [
  {
    id: "diego-rocha",
    colportor: "Diego Rocha",
    deuda: 31200,
    depositado: 78400,
    enMano: 9150,
    porCobrar: 12600,
    ultimoDeposito: { fecha: "10 jun" },
  },
  {
    id: "melina-vazquez",
    colportor: "Melina Vázquez",
    deuda: 24800,
    depositado: 86100,
    enMano: 5400,
    porCobrar: 8200,
    ultimoDeposito: { fecha: "11 jun" },
  },
  {
    id: "laura-suarez",
    colportor: "Laura Suárez",
    deuda: 18900,
    depositado: 61300,
    enMano: 18500,
    porCobrar: 4100,
    ultimoDeposito: { alerta: "ticket-pendiente" },
  },
  {
    id: "joel-cabrera",
    colportor: "Joel Cabrera",
    deuda: 42600,
    depositado: 19800,
    enMano: 2300,
    porCobrar: 15900,
    ultimoDeposito: { fecha: "29 may", alerta: "atraso" },
  },
  {
    id: "noelia-acosta",
    colportor: "Noelia Acosta",
    deuda: 21400,
    depositado: 54200,
    enMano: 6800,
    porCobrar: 7400,
    ultimoDeposito: { fecha: "09 jun" },
  },
];

export const TICKETS_POR_VALIDAR_SIMULADOS: TicketPorValidar[] = [
  {
    id: "ticket-laura-suarez-1",
    colportor: "Laura Suárez",
    monto: 18500,
    medio: "deposito",
    medioDetalle: "depósito BROU",
    fecha: "hoy 10:42",
    recibo: "N° 0482",
    tieneFoto: true,
  },
  {
    id: "ticket-diego-rocha-1",
    colportor: "Diego Rocha",
    monto: 9000,
    medio: "transferencia",
    medioDetalle: "transferencia",
    fecha: "ayer 18:03",
    tieneFoto: false,
  },
];

export const LISTA_TICKETS_POR_VALIDAR_SIMULADA: ListaTicketsPorValidar = {
  tickets: TICKETS_POR_VALIDAR_SIMULADOS,
  totalPendientes: 4,
};

export const fuenteCuentasSimulada: FuenteDatosCuentas = {
  async obtenerResumenEquipo() {
    return RESUMEN_CUENTAS_SIMULADO;
  },
  async obtenerEstadoCuenta() {
    return { filas: FILAS_ESTADO_CUENTA_SIMULADAS };
  },
  async obtenerTicketsPorValidar() {
    return LISTA_TICKETS_POR_VALIDAR_SIMULADA;
  },
};
