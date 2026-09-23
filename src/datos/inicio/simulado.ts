import type { FuenteDatosInicio, TableroInicio } from "@/datos/inicio/contrato";

/** Datos de ejemplo del diseño ("Panel Coordinador", sección Inicio). */
export const TABLERO_INICIO_SIMULADO: TableroInicio = {
  kpis: [
    {
      id: "ventas-region",
      etiqueta: "Ventas de la región",
      valor: "$U 612K",
      detalle: "▲ 9% semana",
      tono: "positivo",
    },
    {
      id: "en-jornada",
      etiqueta: "En jornada ahora",
      valor: "11 / 14",
      detalle: "2 finalizaron · 1 sin iniciar",
    },
    { id: "horas-semana", etiqueta: "Horas esta semana", valor: "318", detalle: "promedio 22,7 h / colportor" },
    {
      id: "tickets-por-validar",
      etiqueta: "Tickets por validar",
      valor: "4",
      detalle: "el más antiguo: hace 2 días",
      tono: "alerta",
    },
  ],
  actividadHoy: [
    {
      id: "diego-rocha",
      colportor: "Diego Rocha",
      zona: "Cerro Norte",
      horasHoy: "5,2 h",
      ventasHoy: "$U 4.350",
      estado: "en-jornada",
    },
    {
      id: "melina-vazquez",
      colportor: "Melina Vázquez",
      zona: "La Teja",
      horasHoy: "4,8 h",
      ventasHoy: "$U 6.080",
      estado: "en-jornada",
    },
    {
      id: "laura-suarez",
      colportor: "Laura Suárez",
      zona: "Paso de la Arena",
      horasHoy: "6,1 h",
      ventasHoy: "$U 2.900",
      estado: "finalizada",
    },
    {
      id: "joel-cabrera",
      colportor: "Joel Cabrera",
      zona: "Cerro Norte",
      horasHoy: "3,4 h",
      ventasHoy: "$U 1.120",
      estado: "en-jornada",
    },
    {
      id: "pablo-ferreira",
      colportor: "Pablo Ferreira",
      zona: "Belvedere",
      horasHoy: null,
      ventasHoy: null,
      estado: "sin-iniciar",
    },
  ],
  avancePorZona: [
    { id: "cerro-norte", zona: "Cerro Norte", porcentajeMeta: 74 },
    { id: "la-teja", zona: "La Teja", porcentajeMeta: 68 },
    { id: "paso-de-la-arena", zona: "Paso de la Arena", porcentajeMeta: 55 },
    { id: "belvedere", zona: "Belvedere", porcentajeMeta: 38 },
  ],
  pendientes: [
    {
      id: "ticket-deposito-laura-suarez",
      titulo: "Ticket de depósito",
      etiqueta: "hoy",
      tono: "hoy",
      detalle: "L. Suárez · $U 18.500 · foto adjunta",
      accionPrincipal: { texto: "Validar", href: "/cuentas" },
      accionSecundaria: { texto: "Ver foto" },
    },
    {
      id: "transferencia-stock-rocha-cabrera",
      titulo: "Transferencia de stock",
      etiqueta: "2 días",
      tono: "atraso",
      detalle: "D. Rocha → J. Cabrera · 12 × El Deseado…",
      accionPrincipal: { texto: "Autorizar", href: "/stock" },
      accionSecundaria: { texto: "Rechazar", tono: "peligro" },
    },
    {
      id: "pedido-stock-cabrera",
      titulo: "Pedido de stock",
      etiqueta: "por autorizar",
      tono: "por-autorizar",
      detalle: "J. Cabrera · 25 × La Gran Esperanza · $U 19.800",
      accionPrincipal: { texto: "Autorizar", href: "/stock" },
      accionSecundaria: { texto: "Rechazar", tono: "peligro" },
    },
    {
      id: "colportora-sin-zona-martinez",
      titulo: "Colportora sin zona",
      etiqueta: "nueva",
      tono: "nueva",
      detalle: "Ana Martínez · se sumó a tu región · sin zona asignada",
      accionPrincipal: { texto: "Asignar zona", href: "/equipo" },
    },
  ],
  mapaRegion: [
    { id: "cerro-norte", zona: "Cerro Norte", left: 26, top: 34 },
    { id: "la-teja", zona: "La Teja", left: 48, top: 58 },
    { id: "paso-de-la-arena", zona: "Paso de la Arena", left: 68, top: 40 },
    { id: "belvedere", zona: "Belvedere", left: 60, top: 72 },
  ],
};

export const fuenteInicioSimulada: FuenteDatosInicio = {
  async obtenerTablero() {
    return TABLERO_INICIO_SIMULADO;
  },
};
