import type {
  CiudadDelDia,
  ColportorDelDia,
  ColportorSinZona,
  EstadoJornada,
  FuenteDatosInicio,
  OpcionesTablero,
  PendienteDeAccion,
  TableroDelDia,
} from "@/datos/inicio/contrato";
import { hoyEnMontevideo } from "@/datos/shell/rpc";

/**
 * Datos de ejemplo de la vista 31 (`31 Inicio Vista Rapida.dc.html`, artboard «Principal · 10:40»): tres ciudades de dos
 * departamentos, con un colportor sin iniciar porque no salió (Florencia, hace 6 min) y otro sin conexión hace días
 * (Bruno). Las horas de «últimos datos» se calculan hacia atrás desde el momento del pedido, así «hace 12 min» siempre
 * es cierto. Solo para el sitio de prueba y desarrollo sin Supabase.
 */

const CAMPANIA_SIMULADA = "campania-simulada";

type Fila = [nombre: string, estado: "J" | "S" | "F", horas: number, presentaciones: number, ventas: number, montoPesos: number, hacePorMin: number];

const GENTE: Record<string, { nombre: string; departamento: string; filas: Fila[] }> = {
  rivera: {
    nombre: "Rivera",
    departamento: "Rivera",
    filas: [
      ["Lucía Fernández", "J", 2.8, 4, 2, 4350, 12],
      ["Bruno Techera", "S", 0, 0, 0, 0, 4 * 24 * 60],
      ["Valentina Silva", "J", 3.1, 5, 2, 5120, 8],
      ["Joaquín Duarte", "J", 1.1, 1, 0, 0, 160],
      ["Martín Olivera", "J", 2.5, 3, 1, 1980, 25],
      ["Florencia Pintos", "S", 0, 0, 0, 0, 6],
      ["Camila Núñez", "J", 2.2, 2, 1, 2050, 40],
      ["Santiago Pereira", "F", 3.0, 4, 1, 1500, 5],
      ["Micaela Rodríguez", "J", 2.6, 3, 2, 3600, 15],
      ["Emiliano Sosa", "J", 2.4, 2, 0, 0, 30],
    ],
  },
  artigas: {
    nombre: "Artigas",
    departamento: "Artigas",
    filas: [
      ["Sofía Cabral", "J", 2.9, 4, 1, 2900, 18],
      ["Agustina Rey", "J", 2.3, 3, 1, 1450, 9],
      ["Julieta Moreira", "J", 2.7, 3, 2, 3950, 22],
      ["Carolina Píriz", "J", 1.9, 2, 0, 0, 70],
      ["Martina Correa", "S", 0, 0, 0, 0, 20],
      ["Paula Ferreira", "J", 2.5, 4, 1, 2050, 14],
      ["Natalia Vidal", "J", 3.0, 5, 3, 5600, 4],
      ["Lorena Acuña", "J", 2.1, 2, 1, 1500, 35],
    ],
  },
  "bella-union": {
    nombre: "Bella Unión",
    departamento: "Artigas",
    filas: [
      ["Gonzalo Méndez", "J", 2.6, 3, 1, 2900, 11],
      ["Federico Da Rosa", "J", 2.4, 3, 1, 1980, 27],
      ["Ignacio Bentancor", "J", 2.0, 2, 0, 0, 50],
      ["Rodrigo Cardozo", "J", 2.8, 4, 2, 3450, 7],
      ["Matías Rivero", "F", 2.5, 3, 1, 1450, 3],
      ["Diego Machado", "J", 1.8, 1, 0, 0, 65],
      ["Nicolás Viera", "J", 2.2, 2, 1, 2050, 19],
    ],
  },
};

const ESTADOS: Record<Fila[1], EstadoJornada> = { J: "en-jornada", S: "sin-iniciar", F: "finalizada" };

/** Los días anteriores salen cerrados: nadie sigue «En jornada» y nadie queda con una jornada sin cerrar. */
function colportorDelDia(ciudad: string, fila: Fila, indice: number, calculadoA: Date, esHoy: boolean): ColportorDelDia {
  const [nombre, estado, horas, presentaciones, ventas, montoPesos, hacePorMin] = fila;
  const estadoDelDia: EstadoJornada = estado === "S" ? "sin-iniciar" : esHoy ? ESTADOS[estado] : "finalizada";
  return {
    id: `${ciudad}-${indice}`,
    nombre,
    estado: estadoDelDia,
    horas,
    presentaciones,
    ventas,
    montoCentavos: montoPesos * 100,
    ultimoPushAt: new Date(calculadoA.getTime() - hacePorMin * 60_000).toISOString(),
  };
}

const NOMBRES_ORDEN = new Intl.Collator("es");

/** Siempre hay tablero: la simulada tiene una campaña (por eso su `obtenerTablero` nunca devuelve `null`). */
export function crearFuenteInicioSimulada(ahora: () => Date = () => new Date()): { obtenerTablero(opciones?: OpcionesTablero): Promise<TableroDelDia> } {
  return {
    async obtenerTablero(opciones: OpcionesTablero = {}): Promise<TableroDelDia> {
      const calculadoA = ahora();
      const hoy = hoyEnMontevideo(calculadoA);
      const fecha = opciones.fecha ?? hoy;
      const esHoy = fecha === hoy;

      const ciudades: CiudadDelDia[] = Object.entries(GENTE)
        .map(([id, { nombre, departamento, filas }]) => ({
          id,
          nombre,
          departamento,
          colportores: filas.map((fila, i) => colportorDelDia(id, fila, i, calculadoA, esHoy)),
        }))
        .sort((a, b) => NOMBRES_ORDEN.compare(a.nombre, b.nombre));

      const sinZona: ColportorSinZona[] = [
        {
          id: "sin-zona-1",
          nombre: "Rocío Benítez",
          estado: "sin-iniciar",
          deBaja: false,
          inscriptoAt: new Date(calculadoA.getTime() - 90 * 60_000).toISOString(),
          ultimoPushAt: new Date(calculadoA.getTime() - 90 * 60_000).toISOString(),
        },
      ];

      const pendientes: PendienteDeAccion[] = [
        {
          tipo: "ticket-por-validar",
          id: "ticket-1",
          ciudadId: "rivera",
          colportor: "Lucía Fernández",
          ciudad: "Rivera",
          montoCentavos: 9000_00,
          cuando: new Date(calculadoA.getTime() - 20 * 3600_000).toISOString(),
        },
        {
          tipo: "ticket-por-validar",
          id: "ticket-2",
          ciudadId: "artigas",
          colportor: "Sofía Cabral",
          ciudad: "Artigas",
          montoCentavos: 18500_00,
          cuando: new Date(calculadoA.getTime() - 90 * 60_000).toISOString(),
        },
        {
          tipo: "pedido-por-autorizar",
          id: "pedido-1",
          ciudadId: "bella-union",
          colportor: "Rodrigo Cardozo",
          ciudad: "Bella Unión",
          libros: 25,
          montoCentavos: 19800_00,
          cuando: new Date(calculadoA.getTime() - 26 * 3600_000).toISOString(),
        },
      ];

      return {
        campaniaId: opciones.campaniaId ?? CAMPANIA_SIMULADA,
        fecha,
        esHoy,
        calculadoA: calculadoA.toISOString(),
        ciudades,
        sinZona: esHoy ? sinZona : [],
        pendientes: esHoy ? pendientes : [],
      };
    },
  };
}

export const fuenteInicioSimulada: FuenteDatosInicio = crearFuenteInicioSimulada();
