import type { BecaDeColportor, CarreraDelCatalogo, DatosDeBecas, MetaDeBeca, ResultadoBeca, TipoDeBeca } from "@/datos/equipo/contrato";
import { logroDeBeca } from "@/datos/equipo/logro-de-beca";

/**
 * Datos de ejemplo de la pestaña «Becas» de la vista 33 (diseño «33 Equipo», canvas del 21/10). Las metas por carrera son
 * inventadas, como en el canvas (Sistemas media: 120 libros o $U 180.000; completa: el doble): salen de la lista de
 * bonificaciones de la CES, que llega en diciembre (C11). La carrera y el avance de cada colportor salen del mismo
 * generador que el canvas, así que la tabla coincide con el artboard (`canvas-33-becas.json` lo comprueba).
 */

function meta(libros: number, monto: number): MetaDeBeca {
  return { libros, monto };
}

function carrera(id: string, nombre: string, libros: number, monto: number): CarreraDelCatalogo {
  return { id, nombre, metaMedia: meta(libros, monto), metaCompleta: meta(libros * 2, monto * 2) };
}

export const CARRERAS_SIMULADAS: CarreraDelCatalogo[] = [
  carrera("sis", "Ingeniería en Sistemas", 120, 180000),
  carrera("teo", "Teología", 100, 150000),
  carrera("cont", "Contador Público", 130, 195000),
  carrera("enf", "Enfermería", 110, 165000),
  carrera("psi", "Psicología", 125, 187500),
];

/** El día en que el canvas dice que se eligieron las carreras («elegida el 01/09»). */
const ELEGIDA_EL = "2026-09-01";

/** Los dos del canvas que no tienen carrera todavía (con el botón «Elegir carrera»). */
const SIN_CARRERA = new Set(["Martín Olivera", "Paula Ferreira"]);

/** FNV-1a y mulberry32, igual que el script del canvas. */
function semillaDe(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function generador(semilla: number): () => number {
  let s = semilla;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function becaInicial(nombre: string): BecaDeColportor {
  const r = generador(semillaDe(`${nombre}eq`));
  let elegida = CARRERAS_SIMULADAS[Math.floor(r() * CARRERAS_SIMULADAS.length)];
  let tipo: TipoDeBeca = r() < 0.45 ? "completa" : "media";
  const progreso = 0.25 + r() * 0.45;
  if (nombre === "Emiliano Sosa") {
    elegida = CARRERAS_SIMULADAS[0];
    tipo = "media";
  }
  if (SIN_CARRERA.has(nombre)) return { carrera: null, apuntaA: null, meta: null, avance: meta(0, 0) };
  const objetivo = (tipo === "completa" ? elegida.metaCompleta : elegida.metaMedia) as MetaDeBeca;
  return {
    carrera: { id: elegida.id, nombre: elegida.nombre, elegidaEl: ELEGIDA_EL },
    apuntaA: tipo,
    meta: objetivo,
    avance: meta(Math.round(objetivo.libros * progreso), Math.round((objetivo.monto * progreso) / 100) * 100),
  };
}

const COLPORTOR_FUERA = "El colportor no está en esta campaña. Recargá la página.";
const SIN_CARRERA_ELEGIDA = "Primero elegí la carrera del colportor.";
const SIN_META = "Falta configurar la meta de esta carrera. Avisale al administrador para que la cargue.";
const PERMANENTE = "En una campaña permanente no hay becas.";

function copia(beca: BecaDeColportor): BecaDeColportor {
  return {
    carrera: beca.carrera ? { ...beca.carrera } : null,
    apuntaA: beca.apuntaA,
    meta: beca.meta ? { ...beca.meta } : null,
    avance: { ...beca.avance },
    // Las marcas del servidor solo viajan cuando valen algo.
    ...(beca.alcanzada ? { alcanzada: beca.alcanzada } : {}),
    ...(beca.metaRecalculadaEn ? { metaRecalculadaEn: beca.metaRecalculadaEn } : {}),
  };
}

function metaDe(carreraDelCatalogo: CarreraDelCatalogo, tipo: TipoDeBeca): MetaDeBeca | null {
  return tipo === "completa" ? carreraDelCatalogo.metaCompleta : carreraDelCatalogo.metaMedia;
}

/**
 * Las becas de ejemplo con su propio estado: elegir la carrera o el tipo cambia lo que ve la siguiente lectura. Aplica las
 * reglas de HU-BEC-006: la carrera se elige una vez, el tipo fija la meta con la de la carrera y, sin meta cargada, avisa;
 * lo que ya alcanzó no se pierde al pasar a «Sin beca» («Logro beca»). `permanente`: en una campaña permanente no hay becas
 * («Beca perman.»): todos arrancan sin beca y la base rechaza cualquier tipo.
 */
export function crearBecasSimuladas(
  colportores: { id: string; nombre: string }[],
  hoy: string,
  carreras: CarreraDelCatalogo[] = CARRERAS_SIMULADAS,
  { permanente = false }: { permanente?: boolean } = {},
) {
  const inicial = (nombre: string): BecaDeColportor => {
    const beca = becaInicial(nombre);
    return permanente ? { ...beca, apuntaA: null, meta: null } : beca;
  };
  const becas = new Map<string, BecaDeColportor>(colportores.map((c) => [c.id, inicial(c.nombre)]));

  return {
    datos(): DatosDeBecas {
      return {
        carreras: carreras.map((c) => ({ ...c })),
        porColportor: Object.fromEntries(Array.from(becas, ([id, beca]) => [id, copia(beca)])),
      };
    },

    elegirCarrera(colportorId: string, carreraId: string): ResultadoBeca {
      const beca = becas.get(colportorId);
      if (!beca) return { ok: false, mensaje: COLPORTOR_FUERA, recargar: true };
      const elegida = carreras.find((c) => c.id === carreraId);
      if (!elegida) return { ok: false, mensaje: "Esa carrera ya no está en el catálogo. Recargá la página y elegí otra.", recargar: true };
      if (beca.carrera) {
        // Un reintento o un doble toque con la misma carrera no es un error.
        if (beca.carrera.id === elegida.id) return { ok: true, beca: copia(beca) };
        return {
          ok: false,
          mensaje: `Este colportor ya tiene la carrera ${beca.carrera.nombre}. La carrera no se cambia desde el panel: si hubo un error, la corrige el administrador.`,
          recargar: true,
        };
      }
      beca.carrera = { id: elegida.id, nombre: elegida.nombre, elegidaEl: hoy };
      return { ok: true, beca: copia(beca) };
    },

    asignarTipoDeBeca(colportorId: string, tipo: TipoDeBeca | null): ResultadoBeca {
      const beca = becas.get(colportorId);
      if (!beca) return { ok: false, mensaje: COLPORTOR_FUERA, recargar: true };
      if (!beca.carrera) return { ok: false, mensaje: SIN_CARRERA_ELEGIDA, recargar: true };
      if (tipo !== null && permanente) return { ok: false, mensaje: PERMANENTE };
      // Lo que ya alcanzó con el tipo de antes queda marcado, cualquiera sea el cambio.
      const logro = logroDeBeca(beca, carreras);
      if (logro !== null) beca.alcanzada = logro;
      if (tipo === null) {
        // «Sin beca»: no hay meta que buscar en el catálogo; lo que ya llevaba de avance queda.
        beca.apuntaA = null;
        beca.meta = null;
        return { ok: true, beca: copia(beca) };
      }
      const id = beca.carrera.id;
      const objetivo = carreras.find((c) => c.id === id);
      const nueva = objetivo ? metaDe(objetivo, tipo) : null;
      if (!nueva) return { ok: false, mensaje: SIN_META, sinMeta: true };
      beca.apuntaA = tipo;
      beca.meta = { ...nueva };
      return { ok: true, beca: copia(beca) };
    },
  };
}
