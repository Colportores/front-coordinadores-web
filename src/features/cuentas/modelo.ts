import type {
  CiudadDeCuentas,
  ColportorDeCuentas,
  DatosDeCuentas,
  DestinoDeTicket,
  NuevoRetiro,
  TicketDeCuentas,
} from "@/datos/cuentas";
import { textoFechaDeTicket } from "@/datos/cuentas/fechas";
import { formatMonto } from "@/features/cuentas/formato";

/**
 * Lo que la vista 36 calcula con los datos: qué ciudades y colportores abarca la selección, las filas de cada tabla, las
 * cifras de arriba, los textos de los tickets y las dos escrituras (retiro y alquiler) aplicadas a una copia de los datos.
 * Todo puro: sin React ni fechas del reloj (la hora llega en `datos.ahora`).
 */

export const plural = (n: number, singular: string, pluralTexto: string) => `${n} ${n === 1 ? singular : pluralTexto}`;

// ─── Selección de ciudades ─────────────────────────────────────────────────

export type Seleccion =
  | { tipo: "todas" }
  | { tipo: "departamento"; departamento: string }
  | { tipo: "ciudad"; ciudadId: string };

export const TODAS: Seleccion = { tipo: "todas" };

export function claveDe(seleccion: Seleccion): string {
  if (seleccion.tipo === "todas") return "todas";
  return seleccion.tipo === "departamento" ? `departamento:${seleccion.departamento}` : `ciudad:${seleccion.ciudadId}`;
}

/** La selección, o «todas» si la ciudad o el departamento ya no figuran (los datos cambiaron). */
export function seleccionVigente(datos: DatosDeCuentas, seleccion: Seleccion): Seleccion {
  if (seleccion.tipo === "ciudad" && !datos.ciudades.some((c) => c.id === seleccion.ciudadId)) return TODAS;
  if (seleccion.tipo === "departamento" && !datos.ciudades.some((c) => c.departamento === seleccion.departamento)) return TODAS;
  return seleccion;
}

export function ciudadesDe(datos: DatosDeCuentas, seleccion: Seleccion): CiudadDeCuentas[] {
  if (seleccion.tipo === "ciudad") return datos.ciudades.filter((c) => c.id === seleccion.ciudadId);
  if (seleccion.tipo === "departamento") return datos.ciudades.filter((c) => c.departamento === seleccion.departamento);
  return datos.ciudades;
}

export function colportoresDe(datos: DatosDeCuentas, seleccion: Seleccion): ColportorDeCuentas[] {
  const ids = new Set(ciudadesDe(datos, seleccion).map((c) => c.id));
  return datos.colportores.filter((c) => ids.has(c.ciudadId));
}

export function tituloDeSeleccion(datos: DatosDeCuentas, seleccion: Seleccion): string {
  if (seleccion.tipo === "todas") return "Todas las ciudades";
  if (seleccion.tipo === "departamento") return `Departamento ${seleccion.departamento}`;
  return datos.ciudades.find((c) => c.id === seleccion.ciudadId)?.nombre ?? "Todas las ciudades";
}

function listaConY(nombres: string[]): string {
  if (nombres.length <= 1) return nombres.join("");
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/** «N colportores · Departamento X · en A y B no hay banco: el coordinador retira el efectivo». */
export function subtituloDeSeleccion(datos: DatosDeCuentas, seleccion: Seleccion): string {
  const ciudades = ciudadesDe(datos, seleccion);
  const partes = [plural(colportoresDe(datos, seleccion).length, "colportor", "colportores")];
  if (ciudades.length === 1) partes.push(`Departamento ${ciudades[0].departamento}`);
  const sinBanco = ciudades.filter((c) => !c.hayBanco).map((c) => c.nombre);
  if (sinBanco.length > 0) partes.push(`en ${listaConY(sinBanco)} no hay banco: el coordinador retira el efectivo`);
  return partes.join(" · ");
}

export type ElementoDeLista =
  | { tipo: "grupo"; clave: string; etiqueta: string }
  | { tipo: "ciudad"; clave: string; nombre: string; sigla: string; pendientes: number; seleccion: Seleccion };

function siglaDe(nombre: string): string {
  const palabras = nombre.split(/\s+/).filter(Boolean);
  if (palabras.length > 1) return `${palabras[0][0]}. ${palabras[1].slice(0, 2)}.`;
  return `${nombre.slice(0, 3)}.`;
}

/** «Todas las ciudades», y por departamento: «Todo el departamento» (si tiene más de una ciudad) y sus ciudades. */
export function elementosDeLista(datos: DatosDeCuentas): ElementoDeLista[] {
  const pendientes = (seleccion: Seleccion) => pendientesDe(datos, seleccion).length;
  const elementos: ElementoDeLista[] = [
    { tipo: "ciudad", clave: "todas", nombre: "Todas las ciudades", sigla: "Todas", pendientes: pendientes(TODAS), seleccion: TODAS },
  ];
  const departamentos = [...new Set(datos.ciudades.map((c) => c.departamento))];
  for (const departamento of departamentos) {
    const ciudades = datos.ciudades.filter((c) => c.departamento === departamento);
    elementos.push({ tipo: "grupo", clave: `grupo:${departamento}`, etiqueta: `DEPTO. ${departamento.toUpperCase()}` });
    if (ciudades.length > 1) {
      const seleccion: Seleccion = { tipo: "departamento", departamento };
      elementos.push({
        tipo: "ciudad",
        clave: claveDe(seleccion),
        nombre: "Todo el departamento",
        sigla: "Dpto.",
        pendientes: pendientes(seleccion),
        seleccion,
      });
    }
    for (const ciudad of ciudades) {
      const seleccion: Seleccion = { tipo: "ciudad", ciudadId: ciudad.id };
      elementos.push({
        tipo: "ciudad",
        clave: claveDe(seleccion),
        nombre: ciudad.nombre,
        sigla: siglaDe(ciudad.nombre),
        pendientes: pendientes(seleccion),
        seleccion,
      });
    }
  }
  return elementos;
}

export function detalleDePendientes(n: number): string {
  return n > 0 ? `${plural(n, "ticket", "tickets")} por validar` : "";
}

// ─── Tickets ───────────────────────────────────────────────────────────────

export interface FilaDeTicket {
  ticket: TicketDeCuentas;
  colportor: ColportorDeCuentas;
  ciudad: CiudadDeCuentas;
}

function indices(datos: DatosDeCuentas) {
  return {
    colportores: new Map(datos.colportores.map((c) => [c.id, c])),
    ciudades: new Map(datos.ciudades.map((c) => [c.id, c])),
  };
}

/** Los tickets de los colportores de la selección (o de uno solo, si hay filtro), del más nuevo al más viejo. */
export function ticketsDe(datos: DatosDeCuentas, seleccion: Seleccion, colportorId: string): FilaDeTicket[] {
  const { colportores, ciudades } = indices(datos);
  const enAlcance = new Set(colportoresDe(datos, seleccion).map((c) => c.id));
  const filas: FilaDeTicket[] = [];
  for (const ticket of datos.tickets) {
    if (!enAlcance.has(ticket.colportorId)) continue;
    if (colportorId && ticket.colportorId !== colportorId) continue;
    const colportor = colportores.get(ticket.colportorId);
    const ciudad = colportor ? ciudades.get(colportor.ciudadId) : undefined;
    if (colportor && ciudad) filas.push({ ticket, colportor, ciudad });
  }
  return filas.sort((a, b) => Date.parse(b.ticket.fecha) - Date.parse(a.ticket.fecha) || a.ticket.id.localeCompare(b.ticket.id));
}

export function pendientesDe(datos: DatosDeCuentas, seleccion: Seleccion): FilaDeTicket[] {
  return ticketsDe(datos, seleccion, "").filter((f) => f.ticket.estado === "PENDIENTE");
}

export function textoDeMedio(t: TicketDeCuentas): string {
  const base = {
    "deposito-banco": "Depósito en banco",
    "tarjeta-debito": "Tarjeta de débito",
    "tarjeta-credito": "Tarjeta de crédito",
    "retiro-coordinador": "Retiro por el coordinador",
  }[t.medio];
  return t.entidad ? `${base} · ${t.entidad}` : base;
}

/** «aut. 483920» en una tarjeta, «recibo 0482» en un depósito en banco; vacío en el retiro (no tiene comprobante). */
export function textoDeNumero(t: TicketDeCuentas): string {
  if (!t.numero) return "";
  return t.medio === "deposito-banco" ? `recibo ${t.numero}` : `aut. ${t.numero}`;
}

export const textoDeDestino = (destino: DestinoDeTicket) => (destino === "alquiler" ? "Alquiler" : "Casa editora");

export function textoDeEstado(t: TicketDeCuentas): string {
  if (t.estado === "PENDIENTE") return "Por validar";
  if (t.estado === "RECHAZADO") return t.motivoRechazo ? `Rechazado · ${t.motivoRechazo}` : "Rechazado";
  return "Validado";
}

export const fechaDeTicket = (t: TicketDeCuentas, ahoraIso: string) => textoFechaDeTicket(t.fecha, ahoraIso);

// ─── Filas por colportor ───────────────────────────────────────────────────

export interface FilaDeCuenta {
  colportor: ColportorDeCuentas;
  ciudad: CiudadDeCuentas;
  /** Lo pagado de alquiler: depósitos validados con ese destino. */
  pagadoAlquiler: number;
  /** Lo que falta de alquiler (nunca negativo). */
  debeAlquiler: number;
  /** Instante del último depósito validado, de cualquier destino. */
  ultimoDeposito: string | null;
  /** Instante del último pago de alquiler validado. */
  ultimoPagoAlquiler: string | null;
}

const masReciente = (actual: string | null, otro: string) => (actual === null || Date.parse(otro) > Date.parse(actual) ? otro : actual);

export function filasDe(datos: DatosDeCuentas, seleccion: Seleccion): FilaDeCuenta[] {
  const { ciudades } = indices(datos);
  const pagado = new Map<string, number>();
  const ultimo = new Map<string, string | null>();
  const ultimoAlquiler = new Map<string, string | null>();
  for (const t of datos.tickets) {
    if (t.estado !== "VALIDADO") continue;
    ultimo.set(t.colportorId, masReciente(ultimo.get(t.colportorId) ?? null, t.fecha));
    if (t.destino === "alquiler") {
      pagado.set(t.colportorId, (pagado.get(t.colportorId) ?? 0) + t.monto);
      ultimoAlquiler.set(t.colportorId, masReciente(ultimoAlquiler.get(t.colportorId) ?? null, t.fecha));
    }
  }
  const orden = new Map(datos.ciudades.map((c, i) => [c.id, i]));
  return colportoresDe(datos, seleccion)
    .flatMap((colportor) => {
      const ciudad = ciudades.get(colportor.ciudadId);
      if (!ciudad) return [];
      const pagadoAlquiler = pagado.get(colportor.id) ?? 0;
      return [
        {
          colportor,
          ciudad,
          pagadoAlquiler,
          debeAlquiler: Math.max(0, datos.alquilerPorColportor - pagadoAlquiler),
          ultimoDeposito: ultimo.get(colportor.id) ?? null,
          ultimoPagoAlquiler: ultimoAlquiler.get(colportor.id) ?? null,
        },
      ];
    })
    .sort((a, b) => (orden.get(a.ciudad.id) ?? 0) - (orden.get(b.ciudad.id) ?? 0));
}

/** Qué porcentaje de lo vendido ya está cobrado: (depositado + en mano) sobre todo lo que le corresponde. */
export function porcentajeCobrado(c: ColportorDeCuentas): number | null {
  const cobrado = c.depositado + c.enMano;
  const total = cobrado + c.porCobrar;
  return total > 0 ? Math.round((cobrado / total) * 100) : null;
}

export type EstadoDeAlquiler = "pagado" | "parcial" | "debe-todo";

export function estadoDeAlquiler(fila: FilaDeCuenta, alquiler: number): EstadoDeAlquiler {
  if (fila.pagadoAlquiler >= alquiler) return "pagado";
  return fila.pagadoAlquiler > 0 ? "parcial" : "debe-todo";
}

// ─── Orden de las tablas ───────────────────────────────────────────────────

export type ColumnaOrdenable =
  | "colportor"
  | "deuda"
  | "depositado"
  | "enMano"
  | "porCobrar"
  | "cobrado"
  | "ultimoDeposito"
  | "pagado"
  | "debe"
  | "ultimoPago";

export interface Orden {
  columna: ColumnaOrdenable;
  sentido: "asc" | "desc";
}

function valorDeOrden(fila: FilaDeCuenta, columna: ColumnaOrdenable): number | string {
  const instante = (iso: string | null) => (iso === null ? -Infinity : Date.parse(iso));
  switch (columna) {
    case "colportor":
      return fila.colportor.nombre;
    case "deuda":
      return fila.colportor.deuda;
    case "depositado":
      return fila.colportor.depositado;
    case "enMano":
      return fila.colportor.enMano;
    case "porCobrar":
      return fila.colportor.porCobrar;
    case "cobrado":
      return porcentajeCobrado(fila.colportor) ?? -1;
    case "ultimoDeposito":
      return instante(fila.ultimoDeposito);
    case "pagado":
      return fila.pagadoAlquiler;
    case "debe":
      return fila.debeAlquiler;
    case "ultimoPago":
      return instante(fila.ultimoPagoAlquiler);
  }
}

/** Ordena dentro de cada ciudad (los grupos siguen el orden de las ciudades); sin orden, el de los datos. */
export function ordenarFilas(filas: FilaDeCuenta[], orden: Orden | null): FilaDeCuenta[] {
  const porNombre = (a: FilaDeCuenta, b: FilaDeCuenta) => a.colportor.nombre.localeCompare(b.colportor.nombre, "es");
  const posicion = new Map<string, number>();
  filas.forEach((f) => {
    if (!posicion.has(f.ciudad.id)) posicion.set(f.ciudad.id, posicion.size);
  });
  return [...filas].sort((a, b) => {
    const grupo = (posicion.get(a.ciudad.id) ?? 0) - (posicion.get(b.ciudad.id) ?? 0);
    if (grupo !== 0) return grupo;
    if (!orden) return 0;
    const va = valorDeOrden(a, orden.columna);
    const vb = valorDeOrden(b, orden.columna);
    const comparacion = typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb, "es") : Number(va) - Number(vb);
    // `-Infinity - -Infinity` es NaN: dos filas sin fecha empatan.
    const base = Number.isNaN(comparacion) ? 0 : comparacion;
    return (orden.sentido === "asc" ? base : -base) || porNombre(a, b);
  });
}

/** El clic en una cabecera: primero «mayores primero» (A→Z en el nombre), después al revés, después sin orden. */
export function siguienteOrden(actual: Orden | null, columna: ColumnaOrdenable): Orden | null {
  const primero = columna === "colportor" ? "asc" : "desc";
  if (!actual || actual.columna !== columna) return { columna, sentido: primero };
  if (actual.sentido === primero) return { columna, sentido: primero === "asc" ? "desc" : "asc" };
  return null;
}

// ─── Cifras de arriba ──────────────────────────────────────────────────────

export interface Kpi {
  rotulo: string;
  valor: string;
  extra: string;
  detalle: string;
}

const suma = (filas: FilaDeCuenta[], f: (c: FilaDeCuenta) => number) => filas.reduce((total, fila) => total + f(fila), 0);

export function kpisDeCasaEditora(filas: FilaDeCuenta[]): Kpi[] {
  return [
    { rotulo: "DEUDA TOTAL", valor: formatMonto(suma(filas, (f) => f.colportor.deuda)), extra: "", detalle: "con la casa editora" },
    { rotulo: "DEPOSITADO", valor: formatMonto(suma(filas, (f) => f.colportor.depositado)), extra: "", detalle: "en la campaña" },
    { rotulo: "EN MANO", valor: formatMonto(suma(filas, (f) => f.colportor.enMano)), extra: "", detalle: "cobrado y no depositado" },
    { rotulo: "POR COBRAR", valor: formatMonto(suma(filas, (f) => f.colportor.porCobrar)), extra: "", detalle: "a clientes" },
  ];
}

export function kpisDeAlquiler(filas: FilaDeCuenta[], alquiler: number): Kpi[] {
  const total = filas.length * alquiler;
  const pagado = suma(filas, (f) => f.pagadoAlquiler);
  const deben = filas.filter((f) => f.pagadoAlquiler < alquiler);
  return [
    { rotulo: "ALQUILER DE LA CAMPAÑA", valor: formatMonto(total), extra: "", detalle: `${filas.length} × ${formatMonto(alquiler)}` },
    {
      rotulo: "PAGADO",
      valor: formatMonto(pagado),
      extra: total > 0 ? `${Math.round((pagado / total) * 100)}%` : "",
      detalle: "depósitos con destino alquiler",
    },
    { rotulo: "DEBEN", valor: formatMonto(suma(filas, (f) => f.debeAlquiler)), extra: "", detalle: plural(deben.length, "colportor", "colportores") },
    {
      rotulo: "PAGARON TODO",
      valor: String(filas.length - deben.length),
      extra: `de ${filas.length}`,
      detalle: "no bloquea nada",
    },
  ];
}

export function kpisDeTickets(tickets: FilaDeTicket[]): Kpi[] {
  const validados = tickets.filter((f) => f.ticket.estado === "VALIDADO");
  return [
    { rotulo: "POR VALIDAR", valor: String(tickets.filter((f) => f.ticket.estado === "PENDIENTE").length), extra: "", detalle: "se validan en «Validar tickets»" },
    {
      rotulo: "VALIDADOS",
      valor: String(validados.length),
      extra: formatMonto(validados.reduce((total, f) => total + f.ticket.monto, 0)),
      detalle: "en la campaña",
    },
    {
      rotulo: "RETIROS DEL COORDINADOR",
      valor: String(tickets.filter((f) => f.ticket.medio === "retiro-coordinador").length),
      extra: "",
      detalle: "sin banco en la ciudad",
    },
    { rotulo: "RECHAZADOS", valor: String(tickets.filter((f) => f.ticket.estado === "RECHAZADO").length), extra: "", detalle: "con motivo" },
  ];
}

/** La franja de arriba: «2 tickets por validar · Lucía $U 9.000 (ayer 18:30) · …». `null` si no hay ninguno. */
export function avisoDePendientes(pendientes: FilaDeTicket[], ahoraIso: string): { titulo: string; detalle: string } | null {
  if (pendientes.length === 0) return null;
  return {
    titulo: `${plural(pendientes.length, "ticket", "tickets")} por validar`,
    detalle:
      "· " +
      pendientes.map((f) => `${f.colportor.nombre} ${formatMonto(f.ticket.monto)} (${fechaDeTicket(f.ticket, ahoraIso)})`).join(" · "),
  };
}

// ─── Entradas de los formularios ───────────────────────────────────────────

export type LecturaDeMonto = { ok: true; valor: number } | { ok: false; motivo: "vacio" | "formato" | "largo" };

const MAX_DIGITOS_DE_MONTO = 9;

/** «18500» o «18.500»: pesos enteros. Rechaza decimales, signos y letras sin adivinar qué quiso decir. */
export function leerMonto(texto: string): LecturaDeMonto {
  const limpio = texto.trim().replace(/[\s.]/g, "");
  if (limpio === "") return { ok: false, motivo: "vacio" };
  if (!/^\d+$/.test(limpio)) return { ok: false, motivo: "formato" };
  if (limpio.replace(/^0+(?=\d)/, "").length > MAX_DIGITOS_DE_MONTO) return { ok: false, motivo: "largo" };
  return { ok: true, valor: Number(limpio) };
}

export interface BorradorDeRetiro {
  colportorId: string;
  monto: string;
  dia: string;
  destino: DestinoDeTicket | "";
}

export type CampoDeRetiro = keyof BorradorDeRetiro;
export type ErroresDeRetiro = Partial<Record<CampoDeRetiro, string>>;

export const ORDEN_DE_CAMPOS: CampoDeRetiro[] = ["colportorId", "monto", "dia", "destino"];

export function validarRetiro(
  borrador: BorradorDeRetiro,
  hoy: string,
  elegibles: ReadonlySet<string>,
): { errores: ErroresDeRetiro; retiro: NuevoRetiro | null } {
  const errores: ErroresDeRetiro = {};
  if (!borrador.colportorId || !elegibles.has(borrador.colportorId)) {
    errores.colportorId = "Elegí el colportor al que le retiraste el efectivo.";
  }
  const monto = leerMonto(borrador.monto);
  if (!monto.ok) {
    errores.monto =
      monto.motivo === "vacio"
        ? "Escribí el monto retirado."
        : monto.motivo === "largo"
          ? "El monto es demasiado grande: revisá que no sobren dígitos."
          : "El monto tiene que ser un número entero de pesos, sin centavos ni signos.";
  } else if (monto.valor <= 0) {
    errores.monto = "El monto tiene que ser mayor que cero.";
  }
  if (!borrador.dia) {
    errores.dia = "Elegí el día del retiro.";
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(borrador.dia)) {
    errores.dia = "El día no es válido: elegilo del calendario.";
  } else if (borrador.dia > hoy) {
    errores.dia = "El día no puede ser futuro: elegí hoy o uno anterior.";
  }
  if (!borrador.destino) errores.destino = "Elegí si el dinero es de la casa editora o del alquiler.";
  if (Object.keys(errores).length > 0 || !monto.ok || borrador.destino === "") return { errores, retiro: null };
  return { errores, retiro: { colportorId: borrador.colportorId, monto: monto.valor, dia: borrador.dia, destino: borrador.destino } };
}

export function validarAlquiler(texto: string): { error: string | null; monto: number | null } {
  const monto = leerMonto(texto);
  if (monto.ok) return { error: null, monto: monto.valor };
  const error =
    monto.motivo === "vacio"
      ? "Escribí el monto del alquiler (0 si la campaña no cobra)."
      : monto.motivo === "largo"
        ? "El monto es demasiado grande: revisá que no sobren dígitos."
        : "El alquiler tiene que ser un número entero de pesos, sin centavos ni signos.";
  return { error, monto: null };
}

// ─── Escrituras sobre una copia de los datos ──────────────────────────────

/** Suma un ticket. Si es `VALIDADO`, acredita: sube «Depositado» y, si es de casa editora, baja la deuda (sin pasar de 0). */
export function aplicarTicket(datos: DatosDeCuentas, ticket: TicketDeCuentas): DatosDeCuentas {
  if (datos.tickets.some((t) => t.id === ticket.id)) return datos;
  const acredita = ticket.estado === "VALIDADO";
  return {
    ...datos,
    tickets: [...datos.tickets, ticket],
    colportores: acredita
      ? datos.colportores.map((c) =>
          c.id !== ticket.colportorId
            ? c
            : {
                ...c,
                depositado: c.depositado + ticket.monto,
                deuda: ticket.destino === "casa-editora" ? Math.max(0, c.deuda - ticket.monto) : c.deuda,
              },
        )
      : datos.colportores,
  };
}

export function aplicarAlquiler(datos: DatosDeCuentas, monto: number): DatosDeCuentas {
  return { ...datos, alquilerPorColportor: monto };
}

/** La fecha de un depósito o pago tal como la muestra la tabla: «hoy 09:15», «ayer 18:30» o «09/10». */
export const fechaDeCuenta = (iso: string, ahoraIso: string) => textoFechaDeTicket(iso, ahoraIso);
