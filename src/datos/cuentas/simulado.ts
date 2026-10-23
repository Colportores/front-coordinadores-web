import type {
  AccionesCuentas,
  CiudadDeCuentas,
  ColportorDeCuentas,
  DatosDeCuentas,
  FuenteDatosCuentas,
  MedioDeTicket,
  NuevoRetiro,
  ResultadoDeAccion,
  TicketDeCuentas,
} from "@/datos/cuentas/contrato";
import { diaEnMontevideo, esDiaValido, instanteDeRetiro, instanteHaceDias } from "@/datos/cuentas/fechas";

/**
 * Datos de ejemplo de la vista 36 («36 Cuentas.dc.html»): tres ciudades en dos departamentos (Rivera tiene banco;
 * Artigas y Bella Unión no, ahí el coordinador retira el efectivo) y 25 colportores con cifras y tickets que se arman
 * siempre igual (generador con semilla por nombre) y relativos a `ahora`, para que «hoy» y «ayer» sigan apareciendo.
 */

export const ALQUILER_SIMULADO = 18500;

export const CIUDADES_SIMULADAS: CiudadDeCuentas[] = [
  { id: "rivera", nombre: "Rivera", departamento: "Rivera", hayBanco: true },
  { id: "artigas", nombre: "Artigas", departamento: "Artigas", hayBanco: false },
  { id: "bella-union", nombre: "Bella Unión", departamento: "Artigas", hayBanco: false },
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
  artigas: [
    "Sofía Cabral",
    "Agustina Rey",
    "Julieta Moreira",
    "Carolina Píriz",
    "Martina Correa",
    "Paula Ferreira",
    "Natalia Vidal",
    "Lorena Acuña",
  ],
  "bella-union": [
    "Gonzalo Méndez",
    "Federico Da Rosa",
    "Ignacio Bentancor",
    "Rodrigo Cardozo",
    "Matías Rivero",
    "Diego Machado",
    "Nicolás Viera",
  ],
};

function hash(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function generador(semilla: number): () => number {
  let s = semilla | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const aCentenas = (x: number) => Math.round(x / 100) * 100;

function identificador(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const TARJETAS: Array<{ medio: MedioDeTicket; entidad: string }> = [
  { medio: "tarjeta-debito", entidad: "Visa" },
  { medio: "tarjeta-credito", entidad: "OCA" },
  { medio: "tarjeta-debito", entidad: "Mastercard" },
];

function armarColportor(
  ciudad: CiudadDeCuentas,
  nombre: string,
  ahoraIso: string,
): { colportor: ColportorDeCuentas; tickets: TicketDeCuentas[] } {
  const r = generador(hash(`${nombre}cta`));
  const id = identificador(nombre);
  const colportor: ColportorDeCuentas = {
    id,
    nombre,
    ciudadId: ciudad.id,
    depositado: aCentenas(25000 + r() * 65000),
    enMano: aCentenas(2000 + r() * 16000),
    porCobrar: aCentenas(3000 + r() * 13000),
    deuda: aCentenas(8000 + r() * 36000),
  };
  const tickets: TicketDeCuentas[] = [];
  let n = 0;
  const agregar = (
    resto: Pick<TicketDeCuentas, "fecha" | "monto" | "destino" | "medio"> & Partial<Pick<TicketDeCuentas, "entidad" | "numero">>,
  ) => {
    n += 1;
    tickets.push({
      id: `${id}-${n}`,
      colportorId: id,
      estado: "VALIDADO",
      tieneFoto: resto.medio !== "retiro-coordinador",
      ...resto,
    });
  };
  const comoLlego = (): Pick<TicketDeCuentas, "medio" | "entidad" | "numero"> => {
    const retiro = !ciudad.hayBanco && r() < 0.6;
    if (retiro) return { medio: "retiro-coordinador" };
    if (r() < 0.5) {
      const t = TARJETAS[Math.floor(r() * 3)];
      return { ...t, numero: String(100000 + Math.floor(r() * 899999)).slice(0, 6) };
    }
    return { medio: "deposito-banco", entidad: "BROU", numero: String(100000 + Math.floor(r() * 899999)).slice(0, 4) };
  };

  // El alquiler pagado sale de depósitos validados con destino alquiler (nunca de un número suelto).
  const pagos: number[][] = [[], [5000], [5000, 4250], [18500]];
  for (const monto of pagos[Math.floor(r() * 4)]) {
    agregar({ fecha: instanteHaceDias(ahoraIso, 3 + Math.floor(r() * 40), 10, 20), monto, destino: "alquiler", ...comoLlego() });
  }
  const cantidad = 2 + Math.floor(r() * 3);
  for (let i = 0; i < cantidad; i++) {
    agregar({
      fecha: instanteHaceDias(ahoraIso, 3 + Math.floor(r() * 45), 9 + Math.floor(r() * 9), Math.floor(r() * 60)),
      monto: aCentenas(4000 + r() * 16000),
      destino: "casa-editora",
      ...comoLlego(),
    });
  }
  return { colportor, tickets };
}

/** Arma los datos de ejemplo tal como están a la hora `ahora`. */
export function armarCuentasSimuladas(ahora: Date = new Date()): DatosDeCuentas {
  const ahoraIso = ahora.toISOString();
  const colportores: ColportorDeCuentas[] = [];
  const tickets: TicketDeCuentas[] = [];
  for (const ciudad of CIUDADES_SIMULADAS) {
    for (const nombre of NOMBRES[ciudad.id]) {
      const armado = armarColportor(ciudad, nombre, ahoraIso);
      colportores.push(armado.colportor);
      tickets.push(...armado.tickets);
    }
  }
  // Los que el diseño deja a la vista: dos por validar (uno de hoy, uno de ayer) y un rechazo con motivo.
  tickets.push(
    {
      id: "lucia-fernandez-por-validar",
      colportorId: "lucia-fernandez",
      fecha: instanteHaceDias(ahoraIso, 1, 18, 30),
      monto: 9000,
      medio: "deposito-banco",
      entidad: "BROU",
      numero: "0482",
      destino: "casa-editora",
      estado: "PENDIENTE",
      tieneFoto: true,
    },
    {
      id: "sofia-cabral-por-validar",
      colportorId: "sofia-cabral",
      fecha: instanteHaceDias(ahoraIso, 0, 9, 15),
      monto: 18500,
      medio: "tarjeta-debito",
      entidad: "Visa",
      numero: "483920",
      destino: "casa-editora",
      estado: "PENDIENTE",
      tieneFoto: true,
    },
    {
      id: "bruno-techera-rechazado",
      colportorId: "bruno-techera",
      fecha: instanteHaceDias(ahoraIso, 13, 16, 40),
      monto: 6000,
      medio: "deposito-banco",
      entidad: "BROU",
      numero: "0377",
      destino: "casa-editora",
      estado: "RECHAZADO",
      motivoRechazo: "Foto ilegible",
      tieneFoto: true,
    },
  );
  return {
    campaniaId: "campania-simulada",
    ahora: ahoraIso,
    alquilerPorColportor: ALQUILER_SIMULADO,
    ciudades: CIUDADES_SIMULADAS,
    colportores,
    tickets,
  };
}

/** La lectura se arma en cada pedido: «hoy» y «ayer» de los tickets son los de la hora en que se abre la pestaña. */
export const fuenteCuentasSimulada: FuenteDatosCuentas = {
  async obtenerCuentas() {
    return armarCuentasSimuladas(new Date());
  },
};

/**
 * Las escrituras de la vista contra la fuente simulada: se resuelven en el navegador y no se guardan (al recargar vuelven
 * los datos de ejemplo). Cuando se conecten las RPC, lo reemplazan las server actions con el mismo contrato.
 */
export function crearAccionesSimuladas(ahora: () => Date = () => new Date()): AccionesCuentas {
  let contador = 0;
  return {
    async registrarRetiro(retiro: NuevoRetiro): Promise<ResultadoDeAccion<TicketDeCuentas>> {
      const instante = ahora().toISOString();
      if (!Number.isInteger(retiro.monto) || retiro.monto <= 0) {
        return { ok: false, causa: "rechazado", mensaje: "El monto tiene que ser mayor que cero." };
      }
      const hoy = diaEnMontevideo(instante);
      if (!esDiaValido(retiro.dia) || (hoy !== null && retiro.dia > hoy)) {
        return { ok: false, causa: "rechazado", mensaje: "La fecha del retiro no puede ser futura." };
      }
      contador += 1;
      return {
        ok: true,
        valor: {
          id: `retiro-${retiro.colportorId}-${contador}`,
          colportorId: retiro.colportorId,
          fecha: instanteDeRetiro(retiro.dia, instante),
          monto: retiro.monto,
          medio: "retiro-coordinador",
          destino: retiro.destino,
          estado: "VALIDADO",
          tieneFoto: false,
        },
      };
    },
    async editarAlquiler(monto: number): Promise<ResultadoDeAccion<number>> {
      if (!Number.isInteger(monto) || monto < 0) {
        return { ok: false, causa: "rechazado", mensaje: "El alquiler tiene que ser un monto entero, sin negativos." };
      }
      return { ok: true, valor: monto };
    },
  };
}
