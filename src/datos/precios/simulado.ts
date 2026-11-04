import {
  claveDe,
  type CambioDePrecio,
  type DatosDePrecios,
  type FuenteDatosPrecios,
  type ItemDePrecio,
  type ResultadoDeGuardado,
  type TipoDeItem,
  type TipoDeProducto,
} from "./contrato";

/**
 * Datos de ejemplo de la vista 27: el catálogo y las ciudades que dibuja el canvas (27G, sección «Precios: general y
 * excepciones por ciudad»). Montevideo tiene tres excepciones y Las Piedras ninguna.
 */

function producto(
  n: number,
  nombre: string,
  codigo: string,
  tipoDeProducto: TipoDeProducto,
  precioGeneral: number | null,
  extra: Partial<Pick<ItemDePrecio, "esBonificable" | "esMisionero">> = {},
): ItemDePrecio {
  const id = `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`;
  return {
    clave: claveDe("PRODUCTO", id),
    tipo: "PRODUCTO",
    id,
    nombre,
    codigo,
    tipoDeProducto,
    esBonificable: extra.esBonificable ?? false,
    esMisionero: extra.esMisionero ?? false,
    detalle: null,
    componentesDeBaja: 0,
    precioGeneral,
  };
}

function coleccion(n: number, nombre: string, codigo: string, detalle: string, precioGeneral: number): ItemDePrecio {
  const id = `00000000-0000-4000-8000-0000000002${String(n).padStart(2, "0")}`;
  return {
    clave: claveDe("COLECCION", id),
    tipo: "COLECCION",
    id,
    nombre,
    codigo,
    tipoDeProducto: null,
    esBonificable: false,
    esMisionero: false,
    detalle,
    componentesDeBaja: 0,
    precioGeneral,
  };
}

export const ITEMS_SIMULADOS: ItemDePrecio[] = [
  producto(1, "Salud y Hogar", "SH-12", "LIBRO", 2400, { esBonificable: true }),
  producto(2, "Nuestros Hijos", "NH-04", "LIBRO", 1900, { esBonificable: true }),
  producto(3, "El Deseado de todas las gentes", "DG-01", "MISIONERO", 450, { esMisionero: true }),
  producto(4, "La gran esperanza", "GE-02", "MISIONERO", 150, { esMisionero: true }),
  producto(5, "Vida Feliz", "VF-10", "REVISTA", 120),
  producto(6, "Nuestra Salud", "NS-03", "REVISTA", 120),
  coleccion(1, "Colección de 1 libro", "COL-1", "Misionero + revista + El Deseado + 1 libro a elegir", 4800),
  coleccion(2, "Colección de 2 libros", "COL-2", "Misionero + revista + El Deseado + 2 libros a elegir", 8900),
];

export const CIUDADES_SIMULADAS = [
  { id: "00000000-0000-4000-8000-000000000301", nombre: "Montevideo" },
  { id: "00000000-0000-4000-8000-000000000302", nombre: "Las Piedras" },
];

export const CAMPANIA_SIMULADA = { id: "00000000-0000-4000-8000-000000000001", nombre: "Primavera 2026" };

export function crearDatosDePreciosSimulados(): DatosDePrecios {
  const [montevideo, lasPiedras] = CIUDADES_SIMULADAS;
  const [saludYHogar, , deseado, , , , col1] = ITEMS_SIMULADOS;
  return {
    campaniaId: CAMPANIA_SIMULADA.id,
    campaniaNombre: CAMPANIA_SIMULADA.nombre,
    items: ITEMS_SIMULADOS.map((i) => ({ ...i })),
    ciudades: CIUDADES_SIMULADAS.map((c) => ({ ...c })),
    excepciones: {
      [montevideo.id]: { [saludYHogar.clave]: 2600, [deseado.clave]: 400, [col1.clave]: 4500 },
      [lasPiedras.id]: {},
    },
  };
}

/** Lo mismo que valida el servidor: un cambio sobre un producto o una colección del catálogo, con un precio entero positivo. */
function cambioValido(cambio: CambioDePrecio, claves: Set<string>): boolean {
  const tipo: TipoDeItem = cambio.tipo;
  if (tipo !== "PRODUCTO" && tipo !== "COLECCION") return false;
  if (!claves.has(claveDe(tipo, cambio.id))) return false;
  return cambio.precio === null || (Number.isSafeInteger(cambio.precio) && cambio.precio > 0);
}

/**
 * La fuente simulada **no guarda**: valida los cambios como lo haría el servidor y contesta que sí. La vista aplica lo guardado
 * a lo que muestra; al recargar vuelve a los datos de ejemplo (igual que la vista 35).
 */
export const fuentePreciosSimulada: FuenteDatosPrecios = {
  async obtenerPrecios() {
    return crearDatosDePreciosSimulados();
  },

  async guardarPrecios(_campaniaId, ciudadId, cambios): Promise<ResultadoDeGuardado> {
    if (!CIUDADES_SIMULADAS.some((c) => c.id === ciudadId)) {
      return { ok: false, causa: "rechazado", mensaje: "La ciudad no está en la campaña. Recargá la página y volvé a elegir." };
    }
    const claves = new Set(ITEMS_SIMULADOS.map((i) => i.clave));
    if (cambios.length === 0 || !cambios.every((c) => cambioValido(c, claves))) {
      return { ok: false, causa: "rechazado", mensaje: "Algún precio no es válido. Revisá los cambios marcados." };
    }
    return { ok: true };
  },
};
