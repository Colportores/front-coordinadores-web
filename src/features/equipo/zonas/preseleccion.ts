import type { CiudadDeCampania } from "@/datos/equipo/zonas";

/** El parámetro de la URL con el que Inicio (tarjeta «Sin zona asignada») manda a Ciudades a asignarle zona a alguien (#187). */
export const PARAMETRO_COLPORTOR = "colportor";

/** El enlace de «Asignar zona» de Inicio: Ciudades con ese colportor ya elegido. */
export function hrefAsignarZona(colportorId: string): string {
  return `/ciudades?${PARAMETRO_COLPORTOR}=${encodeURIComponent(colportorId)}`;
}

export const TEXTO_COLPORTOR_NO_ENCONTRADO =
  "No encontramos a ese colportor entre los inscriptos de la campaña (puede que ya se haya dado de baja). Mirá la lista «Sin zona» de cada ciudad o volvé a Inicio.";

export const textoYaTieneZona = (nombre: string, zona: string | null) =>
  `${nombre} ya tiene zona${zona ? ` («${zona}»)` : ""}. Para cambiársela, elegí la zona en la lista y asignala desde su detalle.`;

export const textoCuentaSuspendida = (nombre: string) =>
  `No se le puede asignar zona a ${nombre}: su cuenta está suspendida. Pedile a un administrador que la reactive.`;

export interface Preseleccion {
  /** La ciudad con la que abre la vista; `null`: la primera, como siempre. */
  ciudadId: string | null;
  /** El colportor al que se le está buscando zona: el panel de zonas lo muestra y pide elegirla. */
  asignandoA: string | null;
  /** Lo que hay que avisar cuando no se puede dejar elegido: qué pasó y qué hacer. */
  aviso: string | null;
}

const NADA: Preseleccion = { ciudadId: null, asignandoA: null, aviso: null };

/**
 * A quién se venía a asignar y dónde. Sin parámetro: nada cambia. Con uno que no sirve (no existe, ya tiene zona, está
 * suspendido) no se deja elegido a nadie y se avisa qué hacer.
 */
export function preseleccionDeColportor(ciudades: readonly CiudadDeCampania[], colportorId: string | null): Preseleccion {
  if (!colportorId) return NADA;
  const donde = ciudades.find((c) => c.colportores.some((p) => p.id === colportorId));
  const persona = donde?.colportores.find((p) => p.id === colportorId);
  if (!donde || !persona) return { ...NADA, aviso: TEXTO_COLPORTOR_NO_ENCONTRADO };

  if (persona.zonaId !== null) {
    // Se abre en la ciudad de su zona, para que la vea.
    const ciudadDeSuZona = ciudades.find((c) => c.zonas.some((z) => z.id === persona.zonaId));
    return { ciudadId: (ciudadDeSuZona ?? donde).id, asignandoA: null, aviso: textoYaTieneZona(persona.nombre, persona.zonaNombre) };
  }
  if (persona.suspendido) return { ciudadId: donde.id, asignandoA: null, aviso: textoCuentaSuspendida(persona.nombre) };
  return { ciudadId: donde.id, asignandoA: persona.id, aviso: null };
}
