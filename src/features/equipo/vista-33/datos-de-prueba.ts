import type { BecaDeColportor, ColportorDeEquipo, DatosDeBecas, DatosEquipoPorCiudad } from "@/datos/equipo/contrato";

/** Hoy y el inicio de la campaña de los tests: 21/10/2026 es miércoles y la campaña empezó el martes 01/09 (50 días antes). */
export const HOY = "2026-10-21";
export const INICIO = "2026-09-01";

export function colportor(datos: Partial<ColportorDeEquipo> & Pick<ColportorDeEquipo, "id" | "nombre">): ColportorDeEquipo {
  return {
    ciudadId: "riv",
    zonaActual: { id: `zona-${datos.id}`, nombre: "Centro", desde: INICIO, desdeInicial: false },
    zonasAnteriores: [],
    casasRegistradas: 100,
    acompanamientos: [],
    ...datos,
  };
}

/** Sistemas: media = 120 libros o $U 180.000, completa el doble (como el canvas). «Contador» no tiene la meta cargada. */
export function becasDePrueba(): DatosDeBecas {
  const sistemas = { id: "sis", nombre: "Ingeniería en Sistemas", elegidaEl: "2026-09-01" };
  const beca = (cambios: Partial<BecaDeColportor>): BecaDeColportor => ({
    carrera: sistemas,
    apuntaA: "media",
    meta: { libros: 120, monto: 180000 },
    avance: { libros: 64, monto: 90000 },
    ...cambios,
  });
  return {
    carreras: [
      { id: "sis", nombre: "Ingeniería en Sistemas", metaMedia: { libros: 120, monto: 180000 }, metaCompleta: { libros: 240, monto: 360000 } },
      { id: "teo", nombre: "Teología", metaMedia: { libros: 100, monto: 150000 }, metaCompleta: { libros: 200, monto: 300000 } },
      { id: "cont", nombre: "Contador Público", metaMedia: null, metaCompleta: null },
    ],
    porColportor: {
      emiliano: beca({}),
      florencia: beca({ carrera: { id: "teo", nombre: "Teología", elegidaEl: "2026-09-01" }, apuntaA: "completa", meta: { libros: 200, monto: 300000 }, avance: { libros: 40, monto: 75000 } }),
      sofia: beca({ apuntaA: null, meta: null, avance: { libros: 12, monto: 20000 } }),
      federico: { carrera: null, apuntaA: null, meta: null, avance: { libros: 0, monto: 0 } },
    },
  };
}

/**
 * Cinco colportores en tres ciudades de dos departamentos, como el diseño: Emiliano acompañado el 08/09 y el 02/10,
 * Florencia nunca, Sofía con dos zonas anteriores, Federico en Bella Unión y Rocío sin zona.
 */
export function datosDePrueba(cambios: Partial<DatosEquipoPorCiudad> = {}): DatosEquipoPorCiudad {
  return {
    campaniaId: "camp-1",
    campania: "Primavera 2026",
    campaniaInicio: INICIO,
    campaniaFin: "2026-12-19",
    hoy: HOY,
    ciudades: [
      { id: "riv", nombre: "Rivera", departamento: "Rivera" },
      { id: "art", nombre: "Artigas", departamento: "Artigas" },
      { id: "bu", nombre: "Bella Unión", departamento: "Artigas" },
    ],
    colportores: [
      colportor({
        id: "emiliano",
        nombre: "Emiliano Sosa",
        zonaActual: { id: "z-santa-isabel", nombre: "Santa Isabel", desde: "2026-10-06", desdeInicial: false },
        zonasAnteriores: [{ nombre: "Bisso", desde: "2026-09-01", hasta: "2026-10-05", eliminada: false, inicial: false }],
        casasRegistradas: 340,
        acompanamientos: [
          { jornadaId: "j-e2", dia: "2026-10-02", horas: 4.5, acompanante: "Mariana Pérez", acompananteEsVos: true },
          { jornadaId: "j-e1", dia: "2026-09-08", horas: 5, acompanante: "Tomás Ibarra", acompananteEsVos: false },
        ],
      }),
      colportor({ id: "florencia", nombre: "Florencia Pintos", casasRegistradas: 120 }),
      colportor({
        id: "sofia",
        nombre: "Sofía Cabral",
        ciudadId: "art",
        zonaActual: { id: "z-rampla", nombre: "Rampla", desde: "2026-10-12", desdeInicial: false },
        zonasAnteriores: [
          { nombre: "Ayuí", desde: "2026-09-01", hasta: "2026-09-20", eliminada: false, inicial: false },
          { nombre: "Cuaró", desde: "2026-09-21", hasta: "2026-10-11", eliminada: true, inicial: false },
        ],
        casasRegistradas: 410,
        acompanamientos: [{ jornadaId: "j-s1", dia: "2026-10-12", horas: 6, acompanante: "Mariana Pérez", acompananteEsVos: true }],
      }),
      colportor({ id: "federico", nombre: "Federico Da Rosa", ciudadId: "bu", casasRegistradas: 75 }),
      colportor({ id: "rocio", nombre: "Rocío Benítez", ciudadId: null, zonaActual: null, casasRegistradas: 0 }),
    ],
    solicitudesPendientes: 1,
    becas: becasDePrueba(),
    ...cambios,
  };
}
