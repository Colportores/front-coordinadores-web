import { instanteHaceDias } from "@/datos/cuentas/fechas";
import type {
  AccionesValidarTickets,
  DatosDeValidacion,
  FuenteValidarTickets,
  ItemPorValidar,
  Resolucion,
  ResultadoDeAccion,
} from "@/datos/cuentas/validar/contrato";

/**
 * Datos de ejemplo de «Validar tickets» (vista 29 y sección 36R de «36 Cuentas.dc.html»): la campaña Uruguay Norte, con
 * Rivera (tiene banco) y Artigas y Bella Unión (sin banco: el colportor le entrega el efectivo a Marta Pérez, la
 * coordinadora, y carga un «Retiro por el coordinador»). Las fechas son relativas a `ahora` para que «hoy», «ayer» y
 * «hace 3 h» sigan apareciendo. Nada parece un comprobante real: las fotos son un cartel de ejemplo.
 */

const MS_POR_MINUTO = 60_000;

function haceMinutos(ahoraIso: string, minutos: number): string {
  return new Date(Date.parse(ahoraIso) - minutos * MS_POR_MINUTO).toISOString();
}

/** Arma los datos de ejemplo tal como están a la hora `ahora`. */
export function armarValidacionSimulada(ahora: Date = new Date()): DatosDeValidacion {
  const a = ahora.toISOString();
  const items: ItemPorValidar[] = [
    {
      id: "gonzalo-mendez-retiro",
      tipo: "retiro",
      colportorId: "gonzalo-mendez",
      colportorNombre: "Gonzalo Méndez",
      esVos: false,
      ciudad: "Bella Unión",
      monto: 7200,
      concepto: "casa-editora",
      fecha: instanteHaceDias(a, 3, 17, 0),
      enviadoEn: instanteHaceDias(a, 2, 20, 10),
      estado: "PENDIENTE",
      tieneFoto: false,
      cifras: { enMano: 7200, deuda: 16800 },
    },
    {
      id: "lucia-fernandez-por-validar",
      tipo: "deposito",
      colportorId: "lucia-fernandez",
      colportorNombre: "Lucía Fernández",
      esVos: false,
      ciudad: "Rivera",
      monto: 9000,
      concepto: "casa-editora",
      lugar: "banco",
      entidad: "BROU",
      numeroAutorizacion: "0482",
      tarjeta: "no",
      fecha: instanteHaceDias(a, 1, 18, 30),
      enviadoEn: instanteHaceDias(a, 1, 19, 2),
      estado: "PENDIENTE",
      tieneFoto: true,
      cifras: { enMano: 12600, deuda: 18400 },
    },
    {
      id: "valentina-silva-alquiler",
      tipo: "deposito",
      colportorId: "valentina-silva",
      colportorNombre: "Valentina Silva",
      esVos: false,
      ciudad: "Rivera",
      monto: 5000,
      concepto: "alquiler",
      lugar: "oficina",
      numeroAutorizacion: "003981",
      tarjeta: "no",
      fecha: instanteHaceDias(a, 0, 9, 40),
      enviadoEn: haceMinutos(a, 180),
      estado: "PENDIENTE",
      tieneFoto: true,
      cifras: { enMano: 6200, deuda: 13500 },
    },
    {
      id: "joaquin-duarte-de-mas",
      tipo: "deposito",
      colportorId: "joaquin-duarte",
      colportorNombre: "Joaquín Duarte",
      esVos: false,
      ciudad: "Rivera",
      monto: 8000,
      concepto: "casa-editora",
      lugar: "banco",
      entidad: "BROU",
      numeroAutorizacion: "004512",
      tarjeta: "debito",
      fecha: instanteHaceDias(a, 0, 10, 5),
      enviadoEn: haceMinutos(a, 95),
      estado: "PENDIENTE",
      tieneFoto: true,
      cifras: { enMano: 8000, deuda: 5000 },
    },
    {
      id: "lucia-benitez-retiro",
      tipo: "retiro",
      colportorId: "lucia-benitez",
      colportorNombre: "Lucía Benítez",
      esVos: false,
      ciudad: "Artigas",
      monto: 6000,
      concepto: "casa-editora",
      fecha: instanteHaceDias(a, 0, 8, 0),
      enviadoEn: haceMinutos(a, 40),
      estado: "PENDIENTE",
      tieneFoto: false,
      cifras: { enMano: 9400, deuda: 21300 },
    },
    {
      id: "marta-perez-retiro",
      tipo: "retiro",
      colportorId: "marta-perez",
      colportorNombre: "Marta Pérez",
      esVos: true,
      ciudad: "Artigas",
      monto: 3000,
      concepto: "casa-editora",
      fecha: instanteHaceDias(a, 4, 18, 0),
      enviadoEn: instanteHaceDias(a, 4, 18, 20),
      estado: "PENDIENTE",
      tieneFoto: false,
      cifras: null,
    },
    {
      id: "agustina-rey-retiro",
      tipo: "retiro",
      colportorId: "agustina-rey",
      colportorNombre: "Agustina Rey",
      esVos: false,
      ciudad: "Artigas",
      monto: 4500,
      concepto: "casa-editora",
      fecha: instanteHaceDias(a, 2, 11, 0),
      enviadoEn: instanteHaceDias(a, 2, 11, 30),
      estado: "VALIDADO",
      resueltoEn: instanteHaceDias(a, 1, 9, 12),
      resueltoPorVos: true,
      tieneFoto: false,
      cifras: null,
    },
    {
      id: "bruno-techera-rechazado",
      tipo: "deposito",
      colportorId: "bruno-techera",
      colportorNombre: "Bruno Techera",
      esVos: false,
      ciudad: "Rivera",
      monto: 6000,
      concepto: "casa-editora",
      lugar: "banco",
      entidad: "BROU",
      numeroAutorizacion: "0377",
      tarjeta: "no",
      fecha: instanteHaceDias(a, 13, 16, 40),
      enviadoEn: instanteHaceDias(a, 13, 17, 5),
      estado: "RECHAZADO",
      motivoRechazo: "Foto ilegible",
      resueltoEn: instanteHaceDias(a, 12, 10, 0),
      resueltoPorVos: true,
      tieneFoto: true,
      cifras: null,
    },
  ];
  return { campaniaId: "campania-simulada", ahora: a, items };
}

/** La lectura se arma en cada pedido: «hoy» y «ayer» son los de la hora en que se abre la vista. */
export const fuenteValidarTicketsSimulada: FuenteValidarTickets = {
  async obtenerPorValidar() {
    return armarValidacionSimulada(new Date());
  },
};

/** Una foto de ejemplo que se ve como tal: un cartel, nunca algo que parezca un comprobante real (docs/PESTANAS.md §5). */
const FOTO_DE_EJEMPLO =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">' +
      '<rect width="600" height="800" fill="#EDEEEA"/>' +
      '<text x="300" y="400" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#5B6B82">Foto de ejemplo del ticket</text>' +
      "</svg>",
  );

/**
 * Las escrituras de la vista contra la fuente simulada: se resuelven en el navegador y no se guardan (al recargar vuelven
 * los datos de ejemplo). Recuerdan lo resuelto para responder como el servidor: un reintento de lo mismo es `yaEstaba`, y
 * decidir otra cosa sobre algo ya resuelto se rechaza con el texto de TV002 / DP004 / DP005.
 */
export function crearAccionesDeValidacionSimuladas(): AccionesValidarTickets {
  const resueltos = new Map<string, { estado: "VALIDADO" | "RECHAZADO"; motivo?: string; en: string }>();

  const decidir = (
    id: string,
    tipo: ItemPorValidar["tipo"],
    estado: "VALIDADO" | "RECHAZADO",
    motivo?: string,
  ): ResultadoDeAccion<Resolucion> => {
    const previo = resueltos.get(id);
    if (previo) {
      if (previo.estado === estado && previo.motivo === motivo) return { ok: true, valor: { resueltoEn: previo.en, yaEstaba: true } };
      const que = tipo === "retiro" ? "Este retiro" : "Este ticket";
      return { ok: false, causa: "rechazado", mensaje: `${que} ya no está pendiente: otra persona lo resolvió. Recargá la lista para ver cómo quedó.` };
    }
    const en = new Date().toISOString();
    resueltos.set(id, { estado, motivo, en });
    return { ok: true, valor: { resueltoEn: en, yaEstaba: false } };
  };

  return {
    async validar(item) {
      return decidir(item.id, item.tipo, "VALIDADO");
    },
    async rechazar(item, motivo) {
      const limpio = motivo.trim();
      if (limpio === "" || limpio.length > 500) {
        return { ok: false, causa: "rechazado", mensaje: "Escribí el motivo del rechazo (hasta 500 caracteres) para que el colportor sepa qué corregir." };
      }
      return decidir(item.id, item.tipo, "RECHAZADO", limpio);
    },
    async enlaceDeFoto() {
      return { ok: true, valor: FOTO_DE_EJEMPLO };
    },
  };
}
