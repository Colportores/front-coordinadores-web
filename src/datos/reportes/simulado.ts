import type {
  CiudadHoras,
  ColportorHoras,
  DatosHoras,
  DatosReportes,
  Fecha,
  FuenteDatosReportes,
  VentasDelDia,
} from "@/datos/reportes/contrato";
import { diaDeSemana, diasEntre, sumarDias } from "@/datos/reportes/fechas";

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

/** Día de hoy de los datos de ejemplo: la vista 32 del diseño se dibujó el martes 21/10/2026 (un día después del 20). */
export const HOY_SIMULADO: Fecha = "2026-10-21";
export const INICIO_CAMPANIA_SIMULADO: Fecha = "2026-09-01";

/**
 * Generador de ejemplo de la vista 32: las mismas cifras del diseño (misma semilla y mismo orden de números al
 * azar), así que lo que se ve coincide con el canvas. Determinista: no usa el reloj ni `Math.random`.
 */
function hashDeTexto(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function azar(semilla: number): () => number {
  let s = semilla | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tendencia semanal de los colportores con una historia (baja, sube, se estanca). */
const TENDENCIA: Record<string, number[]> = {
  "Emiliano Sosa": [1.05, 1, 0.95, 0.85, 0.78, 0.7, 0.6, 0.55],
  "Natalia Vidal": [0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.12, 1.1],
  "Bruno Techera": [1, 1, 1, 0.95, 0.95, 0.9, 0.8, 0.8],
};
const SIN_TENDENCIA = [1, 1, 1, 1, 1, 1, 1, 1];

/** Último día con datos de quien dejó de sincronizar (sin conexión): el diseño lo muestra con guion y sin tendencia. */
const SIN_DATOS: Record<string, Fecha> = { "Bruno Techera": "2026-10-17" };

function diasHabiles(inicio: Fecha, hoy: Fecha): Fecha[] {
  const dias: Fecha[] = [];
  for (let d = inicio; d <= hoy; d = sumarDias(d, 1)) {
    if (diaDeSemana(d) !== 0) dias.push(d); // los domingos no se trabaja
  }
  return dias;
}

function colportorSimulado(nombre: string, dias: Fecha[]): ColportorHoras {
  const r = azar(hashDeTexto(nombre));
  const base = (23 + r() * 8) / 6;
  const tendencia = TENDENCIA[nombre] ?? SIN_TENDENCIA;
  const sinDatosDesde = SIN_DATOS[nombre] ?? null;
  const horasPorDia: Record<Fecha, number> = {};
  const ventasPorDia: Record<Fecha, VentasDelDia> = {};
  const acompaniadasPorDia: Record<Fecha, number> = {};
  const lunesBase = "2026-08-31";
  dias.forEach((fecha, i) => {
    const semana = Math.floor(diasEntre(lunesBase, fecha) / 7);
    const sinDatos = sinDatosDesde !== null && fecha > sinDatosDesde;
    const horas = sinDatos
      ? 0
      : Math.round(base * tendencia[semana] * (0.75 + r() * 0.5) * (i === dias.length - 1 ? 0.5 : 1) * 10) / 10;
    // Después de las horas, el diseño sortea las presentaciones, las ventas, el monto y la cobranza de cada día, en
    // este orden: así lo que se ve coincide con el canvas. La cobranza (V2) baja con la antigüedad de la semana.
    const presentaciones = Math.round(horas * (0.8 + r() * 0.35));
    const ventas = Math.round(presentaciones * (0.24 + r() * 0.16));
    const monto = ventas * (1900 + Math.round(r() * 24) * 50);
    const tasaCobrada =
      semana < 4 ? 0.9 + r() * 0.08 : semana < 6 ? 0.74 + r() * 0.12 : semana === 6 ? 0.55 + r() * 0.15 : 0.35 + r() * 0.15;
    if (!sinDatos) {
      horasPorDia[fecha] = horas;
      // Una de cada cinco jornadas con acompañante, repartida con un hash del nombre y el día (no gasta números del azar
      // del canvas, así que las demás cifras no cambian).
      acompaniadasPorDia[fecha] = hashDeTexto(`${nombre}|${fecha}`) % 5 === 0 ? 1 : 0;
      ventasPorDia[fecha] = { presentaciones, ventas, monto, cobrado: Math.round(monto * tasaCobrada) };
    }
  });
  return { id: `col-${hashDeTexto(nombre).toString(36)}`, nombre, horasPorDia, acompaniadasPorDia, ventasPorDia, sinDatosDesde };
}

const CIUDADES_SIMULADAS: { id: string; nombre: string; departamento: string; colportores: string[] }[] = [
  {
    id: "ciu-rivera",
    nombre: "Rivera",
    departamento: "Rivera",
    colportores: [
      "Lucía Fernández",
      "Bruno Techera",
      "Valentina Silva",
      "Joaquín Duarte",
      "Martín Olivera",
      "Florencia Pintos",
      "Camila Núñez",
      "Santiago Pereira",
      "Micaela Rodríguez",
      "Emiliano Sosa",
    ],
  },
  {
    id: "ciu-artigas",
    nombre: "Artigas",
    departamento: "Artigas",
    colportores: [
      "Sofía Cabral",
      "Agustina Rey",
      "Julieta Moreira",
      "Carolina Píriz",
      "Martina Correa",
      "Paula Ferreira",
      "Natalia Vidal",
      "Lorena Acuña",
    ],
  },
  {
    id: "ciu-bella-union",
    nombre: "Bella Unión",
    departamento: "Artigas",
    colportores: [
      "Gonzalo Méndez",
      "Federico Da Rosa",
      "Ignacio Bentancor",
      "Rodrigo Cardozo",
      "Matías Rivero",
      "Diego Machado",
      "Nicolás Viera",
    ],
  },
];

export function crearHorasSimuladas(inicio: Fecha = INICIO_CAMPANIA_SIMULADO, hoy: Fecha = HOY_SIMULADO): DatosHoras {
  const dias = diasHabiles(inicio, hoy);
  const ciudades: CiudadHoras[] = CIUDADES_SIMULADAS.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    departamento: c.departamento,
    colportores: c.colportores.map((nombre) => colportorSimulado(nombre, dias)),
  }));
  return { inicioCampania: inicio, finCampania: null, hoy, ciudades };
}

export const fuenteReportesSimulada: FuenteDatosReportes = {
  async obtenerReportes() {
    return DATOS_REPORTES_SIMULADOS;
  },
  async obtenerHoras() {
    return crearHorasSimuladas();
  },
};
