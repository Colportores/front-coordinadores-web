import type { CiudadHoras, ColportorHoras, DatosHoras, Fecha } from "@/datos/reportes/contrato";
import { diaDeSemana, sumarDias } from "@/datos/reportes/fechas";

/** Datos chicos y a mano para los tests de la vista 32: cada cifra se puede calcular de cabeza. */

/** Horas por día de trabajo (sin domingos) entre dos fechas, ambas incluidas. */
export function horasConstantes(desde: Fecha, hasta: Fecha, horas: number, salvo: Record<Fecha, number | null> = {}) {
  const resultado: Record<Fecha, number> = {};
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
    if (diaDeSemana(d) === 0) continue;
    const propio = salvo[d];
    if (propio === null) continue;
    resultado[d] = propio ?? horas;
  }
  return resultado;
}

export function colportor(id: string, nombre: string, horasPorDia: Record<Fecha, number>, sinDatosDesde: Fecha | null = null): ColportorHoras {
  return { id, nombre, horasPorDia, sinDatosDesde };
}

/**
 * Campaña desde el lunes 05/10 hasta hoy, miércoles 21/10 (S1 = 5 al 10, S2 = 12 al 17, S3 = 19 al 21, en curso).
 *   Ana (Rivera): 6 h por día; hoy 3 h.            S1 36, S2 36.
 *   Beto (Rivera): 8 h hasta el jueves 15/10, después sin datos.   S1 48, S2 32.
 *   Carla (Artigas): 5 h por día.                  S1 30, S2 30.
 *   Dario (Bella Unión): 4 h por día.              S1 24, S2 24.
 */
export function datosDePrueba(): DatosHoras {
  const ciudades: CiudadHoras[] = [
    {
      id: "rivera",
      nombre: "Rivera",
      departamento: "Rivera",
      colportores: [
        colportor("ana", "Ana Silva", horasConstantes("2026-10-05", "2026-10-21", 6, { "2026-10-21": 3 })),
        colportor("beto", "Beto Techera", horasConstantes("2026-10-05", "2026-10-15", 8), "2026-10-15"),
      ],
    },
    {
      id: "artigas",
      nombre: "Artigas",
      departamento: "Artigas",
      colportores: [colportor("carla", "Carla Rey", horasConstantes("2026-10-05", "2026-10-21", 5))],
    },
    {
      id: "bella-union",
      nombre: "Bella Unión",
      departamento: "Artigas",
      colportores: [colportor("dario", "Darío Viera", horasConstantes("2026-10-05", "2026-10-21", 4))],
    },
  ];
  return { inicioCampania: "2026-10-05", finCampania: null, hoy: "2026-10-21", ciudades };
}
