import type { CiudadHoras, ColportorHoras, DatosHoras, Fecha, VentasDelDia } from "@/datos/reportes/contrato";
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

/** Lo mismo que `horasConstantes`, para las ventas: el mismo día con las mismas cifras entre dos fechas. */
export function ventasConstantes(
  desde: Fecha,
  hasta: Fecha,
  dia: VentasDelDia,
  salvo: Record<Fecha, VentasDelDia | null> = {},
): Record<Fecha, VentasDelDia> {
  const resultado: Record<Fecha, VentasDelDia> = {};
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
    if (diaDeSemana(d) === 0) continue;
    const propio = salvo[d];
    if (propio === null) continue;
    resultado[d] = propio ?? dia;
  }
  return resultado;
}

export function colportor(
  id: string,
  nombre: string,
  horasPorDia: Record<Fecha, number>,
  sinDatosDesde: Fecha | null = null,
  ventasPorDia: Record<Fecha, VentasDelDia> = {},
): ColportorHoras {
  return { id, nombre, horasPorDia, ventasPorDia, sinDatosDesde };
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

const dia = (presentaciones: number, ventas: number, monto: number, cobrado: number | null): VentasDelDia => ({
  presentaciones,
  ventas,
  monto,
  cobrado,
});

/**
 * Los mismos colportores de `datosDePrueba` con sus ventas. Cada día de trabajo (sin domingos) de una semana vale lo
 * mismo, así que cada total se hace de cabeza:
 *   Ana:   S1 = 6 días de 4 pres., 1 venta, $U 1.000 (cobró 800); S2 = 6 días de 5 / 2 / 1.500 (900);
 *          S3 = 19 y 20 de 5 / 2 / 1.500 (cobró 1.500); hoy, 21, 2 / 0 / 0 / 0.
 *   Beto:  S1 = 6 días de 3 / 1 / 800 (800); S2 = 12 al 15 de 3 / 1 / 800 (400); después sin datos.
 *   Carla: S1 = 6 días de 6 / 2 / 2.000 (1.000); S2 y S3 = 6 / 3 / 3.000 (1.500).
 *   Darío: S1 = 6 días de 2 / 1 / 500 (500); S2 y S3 = 3 / 1 / 600 (600).
 * Todas las ciudades: S1 = 90 pres., 30 ventas, $U 25.800 (cobró 18.600, 28 % por cobrar);
 *                     S2 = 96 pres., 40 ventas, $U 33.800 (cobró 19.600, 42 % por cobrar).
 */
export function datosDePruebaConVentas(): DatosHoras {
  const base = datosDePrueba();
  const ventas: Record<string, Record<Fecha, VentasDelDia>> = {
    ana: {
      ...ventasConstantes("2026-10-05", "2026-10-10", dia(4, 1, 1000, 800)),
      ...ventasConstantes("2026-10-12", "2026-10-17", dia(5, 2, 1500, 900)),
      ...ventasConstantes("2026-10-19", "2026-10-21", dia(5, 2, 1500, 1500), { "2026-10-21": dia(2, 0, 0, 0) }),
    },
    beto: {
      ...ventasConstantes("2026-10-05", "2026-10-10", dia(3, 1, 800, 800)),
      ...ventasConstantes("2026-10-12", "2026-10-15", dia(3, 1, 800, 400)),
    },
    carla: {
      ...ventasConstantes("2026-10-05", "2026-10-10", dia(6, 2, 2000, 1000)),
      ...ventasConstantes("2026-10-12", "2026-10-21", dia(6, 3, 3000, 1500)),
    },
    dario: {
      ...ventasConstantes("2026-10-05", "2026-10-10", dia(2, 1, 500, 500)),
      ...ventasConstantes("2026-10-12", "2026-10-21", dia(3, 1, 600, 600)),
    },
  };
  return {
    ...base,
    ciudades: base.ciudades.map((ciudad) => ({
      ...ciudad,
      colportores: ciudad.colportores.map((c) => ({ ...c, ventasPorDia: ventas[c.id] ?? {} })),
    })),
  };
}
