import type {
  AccionesDeStock,
  AjusteDeStock,
  CiudadDeStock,
  ColportorDeStock,
  DatosDeStock,
  ExistenciaDeStock,
  FuenteDatosStock,
  PedidosPorAutorizarDeCiudad,
  ProductoDeStock,
} from "@/datos/stock/contrato";
import { generadorDeAzar } from "@/lib/azar";

/**
 * Datos de ejemplo de la vista 34 (`34 Stock por Ciudad.dc.html`): tres ciudades de dos departamentos, 25 colportores y
 * 11 productos. Es el mismo generador del canvas (mismo `hash` y mismo generador por colportor y producto), con sus casos
 * puestos a mano: «La Gran Esperanza» no alcanza en Rivera, las revistas «Salud y Hogar» se agotaron en Rivera y los
 * misioneros se agotaron en Artigas con 4 Pamplonas por entregar. `canvas-34.json` (salida del script del canvas) se compara
 * contra esto en los tests de la vista. La fecha del último dato de cada teléfono (`ultimoDatoAt`) no está en el canvas: sale
 * de la misma semilla, relativa a `ahora`; Natalia Vidal lleva tres días sin señal y Nicolás Viera todavía no sincronizó.
 */

const CIUDADES: CiudadDeStock[] = [
  { id: "rivera", nombre: "Rivera", departamento: "Rivera" },
  { id: "artigas", nombre: "Artigas", departamento: "Artigas" },
  { id: "bella-union", nombre: "Bella Unión", departamento: "Artigas" },
];

const PRODUCTOS: (ProductoDeStock & { max: number })[] = [
  { id: "ddg", nombre: "El Deseado de Todas las Gentes", tipo: "LIBRO", nota: null, max: 7 },
  { id: "lge", nombre: "La Gran Esperanza", tipo: "LIBRO", nota: null, max: 6 },
  { id: "vs", nombre: "Vida Sana · 3 tomos", tipo: "LIBRO", nota: null, max: 4 },
  { id: "hpn", nombre: "Historias para Niños", tipo: "LIBRO", nota: null, max: 5 },
  { id: "rts", nombre: "Revolución a tu salud", tipo: "LIBRO", nota: "tipo a confirmar", max: 4 },
  { id: "rvf", nombre: "Revista Vida Feliz", tipo: "REVISTA", nota: null, max: 18 },
  { id: "rsh", nombre: "Revista Salud y Hogar", tipo: "REVISTA", nota: null, max: 15 },
  { id: "jug", nombre: "Jugos que curan", tipo: "MATERIAL", nota: null, max: 6 },
  { id: "ali", nombre: "Alimentos saludables", tipo: "MATERIAL", nota: null, max: 5 },
  { id: "pam", nombre: "Pamplona", tipo: "MISIONERO", nota: null, max: 25 },
  { id: "mis", nombre: "Misionero de bolsillo", tipo: "MISIONERO", nota: null, max: 20 },
];

const NOMBRES: Record<string, string[]> = {
  rivera: [
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
  artigas: ["Sofía Cabral", "Agustina Rey", "Julieta Moreira", "Carolina Píriz", "Martina Correa", "Paula Ferreira", "Natalia Vidal", "Lorena Acuña"],
  "bella-union": ["Gonzalo Méndez", "Federico Da Rosa", "Ignacio Bentancor", "Rodrigo Cardozo", "Matías Rivero", "Diego Machado", "Nicolás Viera"],
};

const hash = (texto: string): number => {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const LGE_RIVERA: Record<string, number> = { "Valentina Silva": 3, "Santiago Pereira": 1 };
const LGE_POR_ENTREGAR: Record<string, number> = { "Lucía Fernández": 2, "Emiliano Sosa": 3, "Camila Núñez": 1 };
const RSH_POR_ENTREGAR: Record<string, number> = { "Micaela Rodríguez": 2, "Joaquín Duarte": 1 };
const HORAS_SIN_SENAL: Record<string, number | null> = { "Natalia Vidal": 74, "Nicolás Viera": null };

/**
 * Los pedidos a la casa editora que esperan autorización en cada ciudad: los mismos de la fuente simulada de la vista 35 (dos en
 * Rivera, uno en Artigas y uno en Bella Unión), para que el aviso de Stock y la bandeja de Pedidos cuenten lo mismo.
 */
const PEDIDOS_POR_AUTORIZAR: PedidosPorAutorizarDeCiudad[] = [
  { ciudadId: "rivera", pedidos: 2 },
  { ciudadId: "artigas", pedidos: 1 },
  { ciudadId: "bella-union", pedidos: 1 },
];

/** Ajustes de ejemplo que cargaron algunas colportoras desde el teléfono: `[colportor, producto, cantidad, motivo, horas atrás]`. */
const AJUSTES: ReadonlyArray<readonly [string, string, number, AjusteDeStock["motivo"], number]> = [
  ["Lucía Fernández", "ddg", 7, "STOCK_INICIAL", 24 * 12],
  ["Lucía Fernández", "ddg", -1, "LIBROS_DANADOS", 24 * 3 + 5],
  ["Bruno Techera", "rvf", -2, "CONTEO", 30],
  ["Bruno Techera", "rsh", 4, "STOCK_INICIAL", 24 * 12],
  ["Sofía Cabral", "pam", 10, "STOCK_INICIAL", 24 * 9],
  ["Natalia Vidal", "lge", -1, "LIBROS_DANADOS", 24 * 5],
];

const PAMPLONA_POR_ENTREGAR: Record<string, number> = { "Sofía Cabral": 2, "Natalia Vidal": 2 };

function existencia(ciudadId: string, nombre: string, producto: (typeof PRODUCTOS)[number]): ExistenciaDeStock {
  const r = generadorDeAzar(hash(nombre + producto.id));
  let tiene = r() < 0.25 ? 0 : 1 + Math.floor(r() * producto.max);
  let porEntregar = r() < 0.65 ? 0 : 1 + Math.floor(r() * 2);
  const entregados = Math.floor(r() * (producto.max + 4));
  const porCobrar = Math.min(entregados, Math.floor(r() * 3));
  // Los devueltos salen de su propio generador: así las demás cifras (las del canvas) no cambian. Nunca más que lo entregado.
  const rd = generadorDeAzar(hash(nombre + producto.id + "devueltos"));
  const devueltos = Math.min(entregados, rd() < 0.7 ? 0 : 1 + Math.floor(rd() * 2));
  const rivera = ciudadId === "rivera";
  const artigas = ciudadId === "artigas";
  if (rivera && producto.id === "rsh") {
    tiene = 0;
    porEntregar = RSH_POR_ENTREGAR[nombre] || 0;
  }
  if (rivera && producto.id === "lge") {
    tiene = LGE_RIVERA[nombre] || 0;
    porEntregar = LGE_POR_ENTREGAR[nombre] || 0;
  }
  if (artigas && (producto.id === "pam" || producto.id === "mis")) {
    tiene = 0;
    porEntregar = producto.id === "pam" ? 4 : 0;
  }
  if (porEntregar > tiene && !(rivera && (producto.id === "rsh" || producto.id === "lge")) && !(artigas && producto.id === "pam")) {
    porEntregar = tiene;
  }
  if (artigas && producto.id === "pam") porEntregar = PAMPLONA_POR_ENTREGAR[nombre] || 0;
  return { productoId: producto.id, tiene, porEntregar, entregados, devueltos, porCobrar };
}

const slug = (nombre: string) =>
  nombre
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");

/** Hace cuántas horas llegó el último dato del teléfono: casi siempre de hoy, a veces de ayer; `null` = ninguno. */
function ultimoDato(nombre: string, ahora: Date): string | null {
  const horas = nombre in HORAS_SIN_SENAL ? HORAS_SIN_SENAL[nombre] : 1 + Math.floor(generadorDeAzar(hash(nombre + "sincronizo"))() * 30);
  if (horas === null) return null;
  // Con minutos distintos para que no queden todos a la misma hora en punto.
  const minutos = Math.floor(generadorDeAzar(hash(nombre + "minuto"))() * 60);
  return new Date(ahora.getTime() - horas * 3_600_000 - minutos * 60_000).toISOString();
}

function ajustesDe(nombre: string, ahora: Date): AjusteDeStock[] {
  return AJUSTES.filter(([quien]) => quien === nombre).map(([, productoId, cantidad, motivo, horas], i) => ({
    id: `ajuste-${slug(nombre)}-${i + 1}`,
    productoId,
    cantidad,
    motivo,
    cuando: new Date(ahora.getTime() - horas * 3_600_000).toISOString(),
    cargadoPor: nombre,
  }));
}

export function crearDatosDeStockSimulados(ahora: Date = new Date()): DatosDeStock {
  const colportores: ColportorDeStock[] = CIUDADES.flatMap((ciudad) =>
    NOMBRES[ciudad.id].map((nombre) => ({
      id: slug(nombre),
      nombre,
      ciudadId: ciudad.id,
      ultimoDatoAt: ultimoDato(nombre, ahora),
      existencias: PRODUCTOS.map((p) => existencia(ciudad.id, nombre, p)),
      ajustes: ajustesDe(nombre, ahora),
    })),
  );
  return {
    campaniaId: "campania-simulada",
    ciudades: CIUDADES,
    productos: PRODUCTOS.map(({ id, nombre, tipo, nota }) => ({ id, nombre, tipo, nota })),
    colportores,
    pedidosPorAutorizar: PEDIDOS_POR_AUTORIZAR,
  };
}

export const fuenteStockSimulada: FuenteDatosStock = {
  async obtenerStock() {
    return crearDatosDeStockSimulados();
  },
};

/**
 * «Pedir transferencia de materiales» simulado: valida como la base (`pedir_transferencia_de_stock`, TR007: puntas iguales o
 * sin elegir, sin libros, un libro repetido, una cantidad que no sirve o un libro que no existe) y numera de a una desde T-19
 * (la T-18 es la última de la fuente simulada de la vista 35). No guarda nada: la transferencia no aparece en Pedidos.
 */
export function crearAccionesSimuladas(datos: DatosDeStock = crearDatosDeStockSimulados()): AccionesDeStock {
  let ultimo = 18;
  return {
    async pedirTransferencia({ origenId, destinoId, lineas }) {
      const conocido = (id: string) => datos.colportores.some((c) => c.id === id);
      if (!origenId || !destinoId || origenId === destinoId || !conocido(origenId) || !conocido(destinoId)) {
        return { ok: false, causa: "rechazado", mensaje: "Elegí dos colportores distintos: el que da los libros y el que los recibe." };
      }
      const ids = lineas.map((l) => l.productoId);
      if (lineas.length === 0 || new Set(ids).size !== ids.length || lineas.some((l) => !Number.isInteger(l.cantidad) || l.cantidad <= 0)) {
        return {
          ok: false,
          causa: "rechazado",
          mensaje: "La transferencia tiene que llevar una lista de libros con su cantidad (mayor que cero), sin repetir ninguno. Corregí la lista y volvé a intentar.",
        };
      }
      if (ids.some((id) => !datos.productos.some((p) => p.id === id))) {
        return { ok: false, causa: "rechazado", mensaje: "Hay un libro que ya no está en el catálogo. Sacalo de la transferencia y volvé a intentar." };
      }
      ultimo += 1;
      return { ok: true, valor: { id: `transferencia-simulada-${ultimo}`, numero: `T-${ultimo}` } };
    },
  };
}
