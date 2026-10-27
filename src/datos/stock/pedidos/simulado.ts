import { hoyEnMontevideo, sumarDias } from "@/lib/dias";

import type {
  AccionesPedidos,
  CiudadDePedidos,
  DatosDePedidos,
  EstadoDePedido,
  FuenteDatosPedidos,
  LineaDePedido,
  PedidoDeColportor,
  StockDelProducto,
  TransferenciaDeStock,
} from "./contrato";

/**
 * Datos de ejemplo de la vista 35 (`35 Pedidos y Transferencias.dc.html`): los diez pedidos y las dos transferencias del
 * canvas, de tres ciudades, con el límite de $U 50.000. Las fechas son relativas a `ahora` (como en el canvas, «hace 3 h»,
 * «ayer» y los días de más atrás), así que el ejemplo no queda congelado en la hora del build. `canvas-35.json` (salida del
 * script del canvas) se compara contra esto en los tests de la vista.
 */

const CIUDADES: CiudadDePedidos[] = [
  { id: "rivera", nombre: "Rivera", departamento: "Rivera" },
  { id: "artigas", nombre: "Artigas", departamento: "Artigas" },
  { id: "bella-union", nombre: "Bella Unión", departamento: "Artigas" },
];

export const LIMITE_DE_EJEMPLO = 50_000;

const slug = (nombre: string) =>
  nombre
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, "-");

type Linea = [nombre: string, cantidad: number, costo: number];
const lineas = (xs: Linea[]): LineaDePedido[] => xs.map(([nombre, cantidad, costoUnitario]) => ({ nombre, cantidad, costoUnitario }));
const stock = (xs: Array<[string, number]>): StockDelProducto[] => xs.map(([nombre, cantidad]) => ({ nombre, cantidad }));

/** Un instante de hace `dias` días corridos, al mediodía de Montevideo (UTC-3 todo el año). */
function haceDias(hoy: string, dias: number, hora = "12:00"): string {
  return new Date(`${sumarDias(hoy, -dias)}T${hora}:00-03:00`).toISOString();
}

export function crearDatosDePedidosSimulados(ahora: Date = new Date()): DatosDePedidos {
  const hoy = hoyEnMontevideo(ahora);
  const haceHoras = (horas: number) => new Date(ahora.getTime() - horas * 3_600_000).toISOString();
  // «Ayer 19:20», pero nunca más nuevo que el de hace 5 h: de madrugada el orden de la bandeja sería otro.
  const ayerALasSiete = new Date(Math.min(Date.parse(haceDias(hoy, 1, "19:20")), ahora.getTime() - 6 * 3_600_000)).toISOString();
  const dep = (dias: number, monto: number) => ({ dia: sumarDias(hoy, -dias), monto });

  const pedido = (
    numero: string,
    colportor: string,
    ciudadId: string,
    estado: EstadoDePedido,
    enviadoEn: string,
    resueltoEn: string | null,
    items: Linea[],
    cuenta: { deuda: number; porCobrar: number; librosPorEntregar: number; deposito: [number, number] },
    enStock: Array<[string, number]>,
    motivoDeRechazo: string | null = null,
  ): PedidoDeColportor => ({
    id: `pedido-${numero.slice(1)}`,
    numero,
    colportorId: slug(colportor),
    colportorNombre: colportor,
    ciudadId,
    estado,
    enviadoEn,
    resueltoEn,
    motivoDeRechazo,
    lineas: lineas(items),
    cuenta: {
      deuda: cuenta.deuda,
      porCobrar: cuenta.porCobrar,
      librosPorEntregar: cuenta.librosPorEntregar,
      ultimoDeposito: dep(...cuenta.deposito),
    },
    stock: stock(enStock),
  });

  const pedidos: PedidoDeColportor[] = [
    pedido("#231", "Emiliano Sosa", "rivera", "POR_AUTORIZAR", haceHoras(3), null,
      [["La Gran Esperanza", 10, 1450], ["El Deseado de Todas las Gentes", 8, 1980], ["Revista Vida Feliz", 30, 190]],
      { deuda: 22_100, porCobrar: 12_600, librosPorEntregar: 4, deposito: [12, 9000] },
      [["La Gran Esperanza", 0], ["El Deseado", 2], ["revistas", 6]]),
    pedido("#230", "Lucía Fernández", "rivera", "POR_AUTORIZAR", haceHoras(5), null,
      [["Vida Sana · 3 tomos", 4, 2900], ["Historias para Niños", 3, 1650]],
      { deuda: 14_300, porCobrar: 8200, librosPorEntregar: 2, deposito: [5, 12_000] },
      [["Vida Sana", 1], ["Historias para Niños", 0]]),
    pedido("#229", "Sofía Cabral", "artigas", "POR_AUTORIZAR", ayerALasSiete, null,
      [["Jugos que curan", 10, 890], ["Alimentos saludables", 8, 950], ["Pamplona", 40, 120]],
      { deuda: 18_200, porCobrar: 6400, librosPorEntregar: 2, deposito: [8, 18_500] },
      [["Jugos", 1], ["Alimentos", 0], ["misioneros", 0]]),
    pedido("#228", "Rodrigo Cardozo", "bella-union", "POR_AUTORIZAR", haceHoras(30), null,
      [["La Gran Esperanza", 25, 792]],
      { deuda: 26_000, porCobrar: 9100, librosPorEntregar: 3, deposito: [9, 15_000] },
      [["La Gran Esperanza", 2]]),
    pedido("#224", "Valentina Silva", "rivera", "AUTORIZADO", haceDias(hoy, 7), haceDias(hoy, 7, "15:00"),
      [["La Gran Esperanza", 12, 1450]],
      { deuda: 31_000, porCobrar: 7300, librosPorEntregar: 0, deposito: [6, 10_000] },
      [["La Gran Esperanza", 3]]),
    pedido("#219", "Natalia Vidal", "artigas", "DESPACHADO", haceDias(hoy, 10), haceDias(hoy, 10, "16:00"),
      [["El Deseado de Todas las Gentes", 15, 1980], ["Revista Salud y Hogar", 40, 190]],
      { deuda: 29_400, porCobrar: 5200, librosPorEntregar: 1, deposito: [4, 20_000] },
      [["El Deseado", 4], ["revistas", 12]]),
    pedido("#216", "Matías Rivero", "bella-union", "DESPACHADO", haceDias(hoy, 11), haceDias(hoy, 11, "16:00"),
      [["Historias para Niños", 10, 1650]],
      { deuda: 21_000, porCobrar: 4300, librosPorEntregar: 0, deposito: [7, 8000] },
      [["Historias para Niños", 1]]),
    pedido("#214", "Julieta Moreira", "artigas", "RECIBIDO", haceDias(hoy, 14), haceDias(hoy, 12),
      [["Vida Sana · 3 tomos", 6, 2900]],
      { deuda: 19_800, porCobrar: 6100, librosPorEntregar: 0, deposito: [3, 14_000] },
      [["Vida Sana", 3]]),
    pedido("#210", "Martín Olivera", "rivera", "RECIBIDO", haceDias(hoy, 20), haceDias(hoy, 17),
      [["El Deseado de Todas las Gentes", 10, 1980]],
      { deuda: 16_900, porCobrar: 5800, librosPorEntregar: 0, deposito: [10, 9500] },
      [["El Deseado", 5]]),
    pedido("#205", "Gonzalo Méndez", "bella-union", "RECHAZADO", haceDias(hoy, 22), haceDias(hoy, 22, "18:00"),
      [["La Gran Esperanza", 30, 792]],
      { deuda: 41_200, porCobrar: 15_300, librosPorEntregar: 0, deposito: [30, 6000] },
      [["La Gran Esperanza", 8]],
      "Tenía un depósito pendiente de validar; volvé a pedirlo cuando se acredite."),
  ];

  const transferencias: TransferenciaDeStock[] = [
    {
      id: "transferencia-18",
      numero: "T-18",
      deId: slug("Valentina Silva"),
      deNombre: "Valentina Silva",
      aId: slug("Lucía Fernández"),
      aNombre: "Lucía Fernández",
      ciudadId: "rivera",
      estado: "POR_AUTORIZAR",
      pedidaEn: haceHoras(1),
      resueltaEn: null,
      motivoDeRechazo: null,
      lineas: [{ nombre: "La Gran Esperanza", cantidad: 2, costoUnitario: 1450, tieneQuienDa: 3, debeEntregarQuienRecibe: 2, tieneQuienRecibe: 0 }],
    },
    {
      id: "transferencia-17",
      numero: "T-17",
      deId: slug("Micaela Rodríguez"),
      deNombre: "Micaela Rodríguez",
      aId: slug("Joaquín Duarte"),
      aNombre: "Joaquín Duarte",
      ciudadId: "rivera",
      estado: "AUTORIZADA",
      pedidaEn: haceDias(hoy, 8),
      resueltaEn: haceDias(hoy, 8, "17:00"),
      motivoDeRechazo: null,
      lineas: [{ nombre: "Revista Vida Feliz", cantidad: 10, costoUnitario: 190, tieneQuienDa: 14, debeEntregarQuienRecibe: 0, tieneQuienRecibe: 2 }],
    },
  ];

  return {
    campaniaId: "campania-primavera-2026",
    limiteDeDeuda: LIMITE_DE_EJEMPLO,
    ahora: ahora.toISOString(),
    ciudades: CIUDADES.map((c) => ({ ...c })),
    pedidos,
    transferencias,
  };
}

export const fuentePedidosSimulada: FuenteDatosPedidos = {
  async obtenerPedidos() {
    return crearDatosDePedidosSimulados();
  },
};

/**
 * Las decisiones del sitio de prueba y del panel sin conectar: se resuelven en el navegador y no se guardan. La fuente real
 * serán las RPC de la bandeja (backend-supabase#104), con las mismas respuestas.
 */
export function crearAccionesSimuladas(): AccionesPedidos {
  return {
    async decidir(decision) {
      const esPedido = decision.tipo === "pedido";
      if (decision.accion === "rechazar" && decision.motivo.trim() === "") {
        return { ok: false, causa: "rechazado", mensaje: "Escribí el motivo para rechazar." };
      }
      return {
        ok: true,
        valor: {
          tipo: decision.tipo,
          id: decision.id,
          estado: decision.accion === "autorizar" ? (esPedido ? "AUTORIZADO" : "AUTORIZADA") : esPedido ? "RECHAZADO" : "RECHAZADA",
          resueltoEn: new Date().toISOString(),
          motivoDeRechazo: decision.accion === "rechazar" ? decision.motivo.trim() : null,
        },
      };
    },
  };
}
