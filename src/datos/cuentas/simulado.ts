import type {
  AccionesCuentas,
  CiudadDeCuentas,
  ColportorDeCuentas,
  DatosDeCuentas,
  DecisionDeAlquiler,
  DestinoDeAlquiler,
  FuenteDatosCuentas,
  MedioDeTicket,
  MotivoDeAnulacion,
  ResultadoDeAccion,
  ResultadoDeAnulacion,
  ResultadoDeDecision,
  TicketDeCuentas,
} from "@/datos/cuentas/contrato";
import { MOTIVOS_DE_ANULACION } from "@/datos/cuentas/contrato";
import { instanteHaceDias } from "@/datos/cuentas/fechas";
import { limiteDeAnulacion } from "@/features/cuentas/anular-cobro";
import { aplicarAlquiler, aplicarAnulacion, aplicarDecision } from "@/features/cuentas/modelo";
import { alquilerDecidible, hayPagosDeAlquiler, TEXTO_ALQUILER_CON_PAGOS } from "@/features/cuentas/por-decidir";
import { generadorDeAzar } from "@/lib/azar";

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
    // La coordinadora que mira el sitio de prueba, inscripta en su propia campaña (su alquiler no lo decide ella).
    "Marta Pérez",
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

/** Un ticket de tarjeta es el de un cobro (`cobranza`): lleva su id y la fecha en que se registró (vista 39). */
function conCobro(ticketId: string, medio: MedioDeTicket, fecha: string): Pick<TicketDeCuentas, "cobro"> {
  return medio === "tarjeta-debito" || medio === "tarjeta-credito" ? { cobro: { id: `cobro-${ticketId}`, fecha } } : {};
}

function armarColportor(
  ciudad: CiudadDeCuentas,
  nombre: string,
  ahoraIso: string,
): { colportor: ColportorDeCuentas; tickets: TicketDeCuentas[] } {
  const r = generadorDeAzar(hash(`${nombre}cta`));
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
    const ticketId = `${id}-${n}`;
    tickets.push({
      id: ticketId,
      colportorId: id,
      estado: "VALIDADO",
      tieneFoto: resto.medio !== "retiro-coordinador",
      ...resto,
      ...conCobro(ticketId, resto.medio, resto.fecha),
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
      cobro: { id: "cobro-sofia-cabral-por-validar", fecha: instanteHaceDias(ahoraIso, 0, 9, 15) },
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
  tickets.push(...cobrosDeEjemplo(ahoraIso));
  return conAlquilerPorDecidir({
    campaniaId: "campania-simulada",
    ahora: ahoraIso,
    alquilerPorColportor: ALQUILER_SIMULADO,
    ciudades: CIUDADES_SIMULADAS,
    colportores,
    tickets,
  });
}

/**
 * Los cobros que deja a la vista la vista 39 en Rivera: uno validado dentro de las 72 h (se puede anular: 39A·01), uno pasado
 * del plazo (39B·01) y uno que la colportora ya anuló desde su teléfono (39A·07).
 */
function cobrosDeEjemplo(ahoraIso: string): TicketDeCuentas[] {
  const base = { destino: "casa-editora", estado: "VALIDADO", tieneFoto: true, medio: "tarjeta-debito", entidad: "Visa" } as const;
  const dentro = instanteHaceDias(ahoraIso, 1, 10, 20);
  const pasado = instanteHaceDias(ahoraIso, 6, 10, 20);
  const delTelefono = instanteHaceDias(ahoraIso, 2, 15, 40);
  return [
    { ...base, id: "florencia-pintos-cobro-vigente", colportorId: "florencia-pintos", fecha: dentro, monto: 4800, numero: "483920", cobro: { id: "cobro-florencia-pintos-vigente", fecha: dentro } },
    { ...base, id: "valentina-silva-cobro-pasado", colportorId: "valentina-silva", fecha: pasado, monto: 12400, numero: "771204", cobro: { id: "cobro-valentina-silva-pasado", fecha: pasado } },
    {
      ...base,
      id: "joaquin-duarte-cobro-anulado",
      colportorId: "joaquin-duarte",
      fecha: delTelefono,
      monto: 7500,
      numero: "351902",
      cobro: {
        id: "cobro-joaquin-duarte-anulado",
        fecha: delTelefono,
        anulado: { en: instanteHaceDias(ahoraIso, 1, 18, 12), motivo: "Lo registré dos veces", por: "Joaquín Duarte", origen: "telefono" },
      },
    },
  ];
}

/** Quien mira el sitio de prueba y decide lo pagado «por decidir» (vista 41). */
export const COORDINADORA_SIMULADA = "Marta Pérez";

interface PagoDeEjemplo {
  /** Días antes de hoy. */
  hace: number;
  monto: number;
  anulado?: number;
}

interface BajaDeEjemplo {
  nombre: string;
  /** Días antes de hoy en que se dio de baja. */
  baja: number;
  pagos: PagoDeEjemplo[];
  decisiones?: Array<{ destino: DestinoDeAlquiler; monto: number; hace: number }>;
}

/**
 * Las bajas de Rivera que dibuja la vista 41: una por decidir (41A·01), una por cada destino ya decidido (41A·07), una con
 * una decisión anterior y un pago que llegó después («Devolver resto») y la de la coordinadora, que no decide la suya.
 */
const BAJAS_DE_EJEMPLO: BajaDeEjemplo[] = [
  { nombre: "Santiago Pereira", baja: 2, pagos: [{ hace: 23, monto: 5000 }, { hace: 9, monto: 4250 }] },
  { nombre: "Camila Núñez", baja: 15, pagos: [{ hace: 24, monto: 5000 }], decisiones: [{ destino: "a-cuenta", monto: 5000, hace: 14 }] },
  { nombre: "Emiliano Sosa", baja: 20, pagos: [{ hace: 26, monto: 18500 }], decisiones: [{ destino: "se-lo-queda", monto: 18500, hace: 19 }] },
  {
    nombre: "Micaela Rodríguez",
    baja: 6,
    pagos: [
      { hace: 30, monto: 5000, anulado: 5 },
      { hace: 16, monto: 4250, anulado: 5 },
    ],
    decisiones: [{ destino: "devolver", monto: 9250, hace: 5 }],
  },
  {
    nombre: "Martín Olivera",
    baja: 12,
    pagos: [{ hace: 20, monto: 12000 }, { hace: 2, monto: 3000 }],
    decisiones: [{ destino: "a-cuenta", monto: 12000, hace: 10 }],
  },
  { nombre: COORDINADORA_SIMULADA, baja: 4, pagos: [{ hace: 18, monto: 5000 }] },
];

/** Reemplaza el alquiler de esas personas por el de ejemplo (sus demás cifras siguen saliendo del generador). */
function conAlquilerPorDecidir(datos: DatosDeCuentas): DatosDeCuentas {
  const ahoraIso = datos.ahora;
  const porId = new Map(BAJAS_DE_EJEMPLO.map((b) => [identificador(b.nombre), b]));
  const tickets = datos.tickets.filter((t) => !(t.destino === "alquiler" && porId.has(t.colportorId)));
  const decisiones: DecisionDeAlquiler[] = [];
  for (const [id, b] of porId) {
    b.pagos.forEach((p, i) => {
      const fecha = instanteHaceDias(ahoraIso, p.hace, 10, 15);
      tickets.push({
        id: `${id}-alquiler-${i + 1}`,
        colportorId: id,
        fecha,
        validadoEn: instanteHaceDias(ahoraIso, p.hace, 17, 40),
        monto: p.monto,
        medio: "deposito-banco",
        entidad: "BROU",
        numero: String(3100 + i * 7),
        destino: "alquiler",
        estado: "VALIDADO",
        tieneFoto: true,
        ...(p.anulado === undefined ? {} : { anulado: { en: instanteHaceDias(ahoraIso, p.anulado, 14, 20) } }),
      });
    });
    (b.decisiones ?? []).forEach((d, i) => {
      decisiones.push({
        id: `${id}-decision-${i + 1}`,
        colportorId: id,
        destino: d.destino,
        monto: d.monto,
        decididoPor: COORDINADORA_SIMULADA,
        decididoEn: instanteHaceDias(ahoraIso, d.hace, 14, 20),
      });
    });
  }
  return {
    ...datos,
    tickets,
    decisionesDeAlquiler: decisiones,
    colportores: datos.colportores.map((c) => {
      const b = porId.get(c.id);
      if (!b) return c;
      const marcada = { ...c, baja: { fecha: instanteHaceDias(ahoraIso, b.baja, 9, 0) } };
      return b.nombre === COORDINADORA_SIMULADA ? { ...marcada, esVos: true } : marcada;
    }),
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
export function crearAccionesSimuladas(inicial?: DatosDeCuentas, ahora: () => number = Date.now): AccionesCuentas {
  // Como el servidor, la fuente simulada recuerda lo que ya se decidió: el doble toque contesta `yaEstaba`.
  let datos = inicial;
  return {
    async editarAlquiler(monto: number): Promise<ResultadoDeAccion<number>> {
      if (!Number.isInteger(monto) || monto < 0) {
        return { ok: false, causa: "rechazado", mensaje: "El alquiler tiene que ser un monto entero, sin negativos." };
      }
      // Como definir_alquiler_de_campania (backend-supabase#260): con pagos de alquiler vivos, no queda en 0.
      if (monto === 0 && datos && hayPagosDeAlquiler(datos)) {
        return { ok: false, causa: "rechazado", mensaje: TEXTO_ALQUILER_CON_PAGOS };
      }
      if (datos) datos = aplicarAlquiler(datos, monto);
      return { ok: true, valor: monto };
    },
    async decidirAlquiler(colportorId: string, destino: DestinoDeAlquiler): Promise<ResultadoDeAccion<ResultadoDeDecision>> {
      const colportor = datos?.colportores.find((c) => c.id === colportorId);
      if (!datos || !colportor) {
        return { ok: false, causa: "rechazado", mensaje: "No encontramos ese alquiler en tus campañas. Recargá la lista de cuentas." };
      }
      if (colportor.esVos) {
        return {
          ok: false,
          causa: "rechazado",
          mensaje: "No podés decidir qué hacer con tu propio alquiler. Pedile a otro coordinador o a un administrador que lo haga.",
        };
      }
      const cuenta = alquilerDecidible(datos, colportor);
      if (!cuenta.decide) {
        return {
          ok: false,
          causa: "rechazado",
          mensaje: "El alquiler de esta persona sigue vigente: lo que pagó de más pasa solo a la deuda con la casa editora. No hay nada que decidir.",
        };
      }
      if (cuenta.porDecidir === 0) return { ok: true, valor: { yaEstaba: true } };
      const decision: DecisionDeAlquiler = {
        id: `decision-${colportorId}-${(datos.decisionesDeAlquiler ?? []).length + 1}`,
        colportorId,
        destino,
        monto: cuenta.porDecidir,
        decididoPor: COORDINADORA_SIMULADA,
        decididoEn: new Date().toISOString(),
      };
      datos = aplicarDecision(datos, decision);
      return { ok: true, valor: { yaEstaba: false, decision } };
    },
    async anularCobro(cobroId: string, motivo: MotivoDeAnulacion, detalle?: string): Promise<ResultadoDeAccion<ResultadoDeAnulacion>> {
      // Como `anular_cobro` (0072): el motivo es de la lista, un cobro ajeno o inexistente da el mismo aviso, anular dos veces
      // contesta `yaEstaba` y pasadas las 72 h desde el cobro rechaza (CB001), sin excepciones.
      const ticket = datos?.tickets.find((t) => t.cobro?.id === cobroId);
      if (!datos || !ticket?.cobro) {
        return { ok: false, causa: "rechazado", mensaje: "No encontramos ese cobro entre los de tu equipo. Recargá la lista de cuentas." };
      }
      if (!MOTIVOS_DE_ANULACION.includes(motivo)) {
        return {
          ok: false,
          causa: "rechazado",
          mensaje: "Elegí el motivo de la anulación: Monto equivocado, Cliente equivocado, Lo registré dos veces u Otro.",
        };
      }
      if (ticket.cobro.anulado) return { ok: true, valor: { yaEstaba: true } };
      // Una fecha ilegible tampoco deja anular (como el panel).
      if (!(ahora() <= limiteDeAnulacion(ticket.cobro.fecha))) {
        return { ok: false, causa: "rechazado", codigo: "fuera-de-plazo", mensaje: "Pasaron más de 72 h desde el cobro: ya no se puede anular." };
      }
      const escrito = detalle?.trim();
      const anulacion = {
        en: new Date(ahora()).toISOString(),
        motivo,
        ...(motivo === "Otro" && escrito ? { detalle: escrito } : {}),
        por: COORDINADORA_SIMULADA,
        origen: "panel",
      } as const;
      datos = aplicarAnulacion(datos, ticket.id, anulacion);
      return { ok: true, valor: { yaEstaba: false, anulacion } };
    },
  };
}
