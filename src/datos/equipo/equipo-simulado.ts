import type {
  AcompanamientoDeColportor,
  ColportorDeEquipo,
  DatosEquipoPorCiudad,
  FuenteDatosEquipo,
  ZonaAnterior,
} from "@/datos/equipo/contrato";
import { crearBecasSimuladas } from "@/datos/equipo/becas-simuladas";
import { diasEntre, sumarDias } from "@/lib/dias";

/**
 * Datos de ejemplo de la vista 33 (diseño «33 Equipo», canvas del 21/10): tres ciudades de dos departamentos, con
 * acompañamientos, zonas anteriores y una colportora sin zona. El día de hoy está fijo (21/10/2026) para que los
 * «hace N días» no cambien con el reloj. Lo que el diseño no dice (casas, horas de cada jornada, quién acompañó) sale de
 * un generador determinista: los mismos datos en cada arranque.
 */

export const HOY_SIMULADO = "2026-10-21";
const INICIO = "2026-09-01";
const FIN = "2026-12-19";
/** El coordinador de la sesión del ejemplo: el que figura como acompañante al registrar uno. */
export const COORDINADOR_SIMULADO = "Mariana Pérez";
const OTRO_COORDINADOR = "Tomás Ibarra";

const CIUDADES = [
  { id: "riv", nombre: "Rivera", departamento: "Rivera" },
  { id: "art", nombre: "Artigas", departamento: "Artigas" },
  { id: "bu", nombre: "Bella Unión", departamento: "Artigas" },
];

const NOMBRES: Record<string, string[]> = {
  riv: ["Lucía Fernández", "Bruno Techera", "Valentina Silva", "Joaquín Duarte", "Martín Olivera", "Florencia Pintos", "Camila Núñez", "Santiago Pereira", "Micaela Rodríguez", "Emiliano Sosa"],
  art: ["Sofía Cabral", "Agustina Rey", "Julieta Moreira", "Carolina Píriz", "Martina Correa", "Paula Ferreira", "Natalia Vidal", "Lorena Acuña"],
  bu: ["Gonzalo Méndez", "Federico Da Rosa", "Ignacio Bentancor", "Rodrigo Cardozo", "Matías Rivero", "Diego Machado", "Nicolás Viera"],
};

const ZONAS: Record<string, string[]> = {
  riv: ["Centro", "Cerro del Marco", "Villa Sara", "Mandubí", "Rivera Chico", "Pueblo Nuevo", "Lagunón", "Bisso", "Santa Isabel", "La Pedrera"],
  art: ["Centro", "Cerro Ejido", "Pintadito", "Zorrilla", "Cuaró", "Ayuí", "Las Láminas", "Rampla"],
  bu: ["Centro", "Las Piedras", "Coronado", "Cainsa", "Barrio Este", "Mevir", "Tres Bocas"],
};

/** Zonas que algunos colportores tuvieron antes (nombre, desde, hasta) y desde cuándo tienen la actual. */
const ANTERIORES: Record<string, [string, string, string][]> = {
  "Martín Olivera": [["Bisso", "2026-09-01", "2026-10-05"]],
  "Sofía Cabral": [
    ["Ayuí", "2026-09-01", "2026-09-20"],
    ["Rampla", "2026-09-21", "2026-10-11"],
  ],
  "Federico Da Rosa": [["Mevir", "2026-09-01", "2026-09-27"]],
  "Joaquín Duarte": [["Santa Isabel", "2026-09-01", "2026-09-13"]],
};
const ACTUAL_DESDE: Record<string, string> = {
  "Martín Olivera": "2026-10-06",
  "Sofía Cabral": "2026-10-12",
  "Federico Da Rosa": "2026-09-28",
  "Joaquín Duarte": "2026-09-14",
};

/** Días de las jornadas con acompañamiento que el diseño fija a mano; los demás salen del generador. */
const ACOMPANADOS_FIJOS: Record<string, string[]> = {
  "Emiliano Sosa": ["2026-09-08", "2026-10-02"],
  "Florencia Pintos": [],
};

function generador(semilla: number): () => number {
  let estado = semilla >>> 0;
  return () => {
    estado = (Math.imul(estado ^ (estado >>> 15), 1 | estado) + 0x6d2b79f5) | 0;
    let t = estado;
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function semillaDe(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  return h >>> 0;
}

function identificador(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

interface JornadaSimulada {
  id: string;
  colportorId: string;
  dia: string;
  horas: number;
  acompanante: string | null;
}

interface Armado {
  base: Omit<ColportorDeEquipo, "acompanamientos">[];
  jornadas: JornadaSimulada[];
}

function armar(): Armado {
  const base: Armado["base"] = [];
  const jornadas: JornadaSimulada[] = [];

  for (const ciudad of CIUDADES) {
    NOMBRES[ciudad.id].forEach((nombre, i) => {
      const id = `col-${identificador(nombre)}`;
      const r = generador(semillaDe(nombre));
      const anteriores: ZonaAnterior[] = (ANTERIORES[nombre] ?? []).map(([zona, desde, hasta]) => ({
        nombre: zona,
        desde,
        hasta,
        eliminada: false,
        inicial: false,
      }));
      base.push({
        id,
        nombre,
        ciudadId: ciudad.id,
        zonaActual: { id: `zona-${ciudad.id}-${i}`, nombre: ZONAS[ciudad.id][i], desde: ACTUAL_DESDE[nombre] ?? INICIO, desdeInicial: false },
        zonasAnteriores: anteriores,
        casasRegistradas: 120 + Math.floor(r() * 780),
      });

      // Una jornada por día de trabajo (de lunes a sábado), con huecos; algunas con acompañamiento.
      const fijos = ACOMPANADOS_FIJOS[nombre];
      for (let dia = INICIO; diasEntre(dia, HOY_SIMULADO) > 0; dia = sumarDias(dia, 1)) {
        const trabaja = fijos?.includes(dia) || (new Date(`${dia}T00:00:00Z`).getUTCDay() !== 0 && r() < 0.8);
        if (!trabaja) continue;
        const horas = Math.round((3.5 + r() * 3) * 10) / 10;
        const sorteo = r();
        const acompanado = fijos ? fijos.includes(dia) : sorteo < 0.07;
        jornadas.push({
          id: `jor-${id}-${dia}`,
          colportorId: id,
          dia,
          horas,
          acompanante: !acompanado ? null : fijos ? (dia === fijos[0] ? OTRO_COORDINADOR : COORDINADOR_SIMULADO) : r() < 0.7 ? COORDINADOR_SIMULADO : OTRO_COORDINADOR,
        });
      }
    });
  }

  // Se sumó hoy: sin zona ni jornadas.
  base.push({
    id: "col-rocio-benitez",
    nombre: "Rocío Benítez",
    ciudadId: null,
    zonaActual: null,
    zonasAnteriores: [],
    casasRegistradas: 0,
  });
  return { base, jornadas };
}

const SIN_JORNADA = "La jornada no existe o no es de un colportor de esta campaña. Recargá las jornadas y elegí otra.";

/** Una fuente con su propio estado: registrar un acompañamiento cambia lo que ve la siguiente lectura. */
export function crearEquipoSimulado(): Pick<
  FuenteDatosEquipo,
  "obtenerEquipoPorCiudad" | "jornadasParaAcompanar" | "registrarAcompanamiento" | "elegirCarrera" | "asignarTipoDeBeca"
> {
  const { base, jornadas } = armar();
  const becas = crearBecasSimuladas(base, HOY_SIMULADO);

  const acompanamientosDe = (colportorId: string): AcompanamientoDeColportor[] =>
    jornadas
      .filter((j) => j.colportorId === colportorId && j.acompanante !== null)
      .sort((a, b) => (a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : 0))
      .map((j) => ({
        jornadaId: j.id,
        dia: j.dia,
        horas: j.horas,
        acompanante: j.acompanante as string,
        acompananteEsVos: j.acompanante === COORDINADOR_SIMULADO,
      }));

  return {
    async obtenerEquipoPorCiudad(): Promise<DatosEquipoPorCiudad> {
      return {
        campaniaId: "campania-primavera-2026",
        campania: "Primavera 2026",
        campaniaInicio: INICIO,
        campaniaFin: FIN,
        campaniaTipo: "VERANO",
        hoy: HOY_SIMULADO,
        ciudades: CIUDADES,
        colportores: base.map((c) => ({ ...c, acompanamientos: acompanamientosDe(c.id) })),
        // Sin flujo de «pedir entrar» (HU-CAM-009, después del 20/11): la franja «SOLICITUD» no aparece.
        solicitudesPendientes: 0,
        becas: becas.datos(),
      };
    },

    async jornadasParaAcompanar(_campaniaId, colportorId) {
      if (!base.some((c) => c.id === colportorId)) return { ok: false, mensaje: "El colportor no está en esta campaña." };
      return {
        ok: true,
        jornadas: jornadas
          .filter((j) => j.colportorId === colportorId)
          .sort((a, b) => (a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : 0))
          .map((j) => ({ id: j.id, dia: j.dia, horas: j.horas, acompanante: j.acompanante, acompananteEsVos: j.acompanante === COORDINADOR_SIMULADO })),
      };
    },

    async registrarAcompanamiento(_campaniaId, jornadaId) {
      const jornada = jornadas.find((j) => j.id === jornadaId);
      if (!jornada) return { ok: false, mensaje: SIN_JORNADA, recargar: true };
      if (jornada.acompanante === COORDINADOR_SIMULADO) {
        return { ok: true, dia: jornada.dia, acompanante: COORDINADOR_SIMULADO, yaEstaba: true };
      }
      if (jornada.acompanante !== null) {
        return {
          ok: false,
          mensaje: `Esta jornada ya figura acompañada por ${jornada.acompanante}. El acompañamiento registrado no se cambia desde el panel.`,
          recargar: true,
        };
      }
      jornada.acompanante = COORDINADOR_SIMULADO;
      return { ok: true, dia: jornada.dia, acompanante: COORDINADOR_SIMULADO, yaEstaba: false };
    },

    async elegirCarrera(_campaniaId, colportorId, carreraId) {
      return becas.elegirCarrera(colportorId, carreraId);
    },

    async asignarTipoDeBeca(_campaniaId, colportorId, tipo) {
      return becas.asignarTipoDeBeca(colportorId, tipo);
    },
  };
}
