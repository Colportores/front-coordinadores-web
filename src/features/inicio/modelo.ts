import type { Pestana } from "@/config/flags";
import type {
  CiudadDelDia,
  ColportorDelDia,
  ColportorSinZona,
  EstadoJornada,
  PendienteDeAccion,
  TableroDelDia,
} from "@/datos/inicio";

/**
 * Lo que la vista 31 (Inicio) hace con los datos del día: qué ciudades entran en cada elección, las sumas, las listas
 * de la izquierda y los textos («hace 12 min», «$U 4.350», «3 de 10 en jornada»). Todo puro: el reloj es el
 * `calculadoA` del servidor, nunca el del navegador, y los días se cuentan en Montevideo, como la base.
 */

// ---------------------------------------------------------------------------------------------------------------------
// Elección: todas las ciudades, un departamento o una ciudad
// ---------------------------------------------------------------------------------------------------------------------

export type Seleccion =
  | { tipo: "todas" }
  | { tipo: "departamento"; nombre: string }
  | { tipo: "ciudad"; id: string };

export const TODAS: Seleccion = { tipo: "todas" };

/** El texto con que se recuerda la elección. */
export function claveDe(seleccion: Seleccion): string {
  if (seleccion.tipo === "departamento") return `departamento:${seleccion.nombre}`;
  if (seleccion.tipo === "ciudad") return `ciudad:${seleccion.id}`;
  return "todas";
}

export function seleccionDe(clave: unknown): Seleccion {
  if (typeof clave !== "string") return TODAS;
  if (clave.startsWith("departamento:") && clave.length > "departamento:".length) {
    return { tipo: "departamento", nombre: clave.slice("departamento:".length) };
  }
  if (clave.startsWith("ciudad:") && clave.length > "ciudad:".length) return { tipo: "ciudad", id: clave.slice("ciudad:".length) };
  return TODAS;
}

/** Departamentos con más de una ciudad: son los únicos que ofrecen «Todo el departamento». */
function departamentosConVarias(ciudades: CiudadDelDia[]): Set<string> {
  const cuenta = new Map<string, number>();
  for (const c of ciudades) if (c.departamento) cuenta.set(c.departamento, (cuenta.get(c.departamento) ?? 0) + 1);
  return new Set([...cuenta].filter(([, n]) => n > 1).map(([nombre]) => nombre));
}

/** La elección recordada puede ya no existir (otra campaña, una ciudad que se fue): en ese caso, todas las ciudades. */
export function seleccionVigente(seleccion: Seleccion, ciudades: CiudadDelDia[]): Seleccion {
  if (seleccion.tipo === "ciudad") return ciudades.some((c) => c.id === seleccion.id) ? seleccion : TODAS;
  if (seleccion.tipo === "departamento") {
    return departamentosConVarias(ciudades).has(seleccion.nombre) ? seleccion : TODAS;
  }
  return TODAS;
}

export function ciudadesDe(seleccion: Seleccion, ciudades: CiudadDelDia[]): CiudadDelDia[] {
  if (seleccion.tipo === "ciudad") return ciudades.filter((c) => c.id === seleccion.id);
  if (seleccion.tipo === "departamento") return ciudades.filter((c) => c.departamento === seleccion.nombre);
  return ciudades;
}

// ---------------------------------------------------------------------------------------------------------------------
// Sumas
// ---------------------------------------------------------------------------------------------------------------------

export interface Resumen {
  colportores: number;
  enJornada: number;
  horas: number;
  presentaciones: number;
  ventas: number;
  montoCentavos: number;
}

export function resumenDe(ciudades: CiudadDelDia[]): Resumen {
  const colportores = ciudades.flatMap((c) => c.colportores);
  return {
    colportores: colportores.length,
    enJornada: colportores.filter((c) => c.estado === "en-jornada").length,
    // Se redondea a centésimas como la base, para que no aparezca 6.300000000000001.
    horas: Math.round(colportores.reduce((suma, c) => suma + c.horas, 0) * 100) / 100,
    presentaciones: colportores.reduce((suma, c) => suma + c.presentaciones, 0),
    ventas: colportores.reduce((suma, c) => suma + c.ventas, 0),
    montoCentavos: colportores.reduce((suma, c) => suma + c.montoCentavos, 0),
  };
}

export function jornadaTexto(resumen: Resumen): string {
  return `${resumen.enJornada} de ${resumen.colportores} en jornada`;
}

/** Hoy, y todavía ni una presentación ni una venta: la primera hora, que no es un error. */
export function recienEmpieza(resumen: Resumen, esHoy: boolean): boolean {
  return esHoy && resumen.colportores > 0 && resumen.presentaciones === 0 && resumen.ventas === 0;
}

// ---------------------------------------------------------------------------------------------------------------------
// La lista de la izquierda
// ---------------------------------------------------------------------------------------------------------------------

export type ElementoDeLista =
  | { tipo: "grupo"; clave: string; etiqueta: string }
  | { tipo: "item"; clave: string; seleccion: Seleccion; nombre: string; sigla: string; resumen: Resumen };

const ORDEN = new Intl.Collator("es", { sensitivity: "base" });

/** «Riv.», «Art.», «B. Un.»: la sigla de la barra angosta. El nombre completo va en el `title` y en el nombre accesible. */
export function sigla(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return "?";
  if (palabras.length === 1) {
    const letras = Array.from(palabras[0]);
    return letras.length <= 3 ? palabras[0] : `${letras.slice(0, 3).join("")}.`;
  }
  const [primera, ...resto] = palabras;
  const inicial = `${Array.from(primera)[0]}.`;
  if (resto.length === 1) return `${inicial} ${Array.from(resto[0]).slice(0, 2).join("")}.`;
  return [inicial, ...resto.map((p) => `${Array.from(p)[0]}.`)].join(" ");
}

export const SIN_DEPARTAMENTO = "SIN DEPARTAMENTO";

export function elementosDeLista(ciudades: CiudadDelDia[]): ElementoDeLista[] {
  const elementos: ElementoDeLista[] = [
    {
      tipo: "item",
      clave: claveDe(TODAS),
      seleccion: TODAS,
      nombre: "Todas las ciudades",
      sigla: "Todas",
      resumen: resumenDe(ciudades),
    },
  ];
  const grupos = new Map<string | null, CiudadDelDia[]>();
  for (const ciudad of ciudades) grupos.set(ciudad.departamento, [...(grupos.get(ciudad.departamento) ?? []), ciudad]);
  const nombres = [...grupos.keys()].sort((a, b) => (a === null ? 1 : b === null ? -1 : ORDEN.compare(a, b)));

  for (const departamento of nombres) {
    const delGrupo = grupos.get(departamento) ?? [];
    elementos.push({
      tipo: "grupo",
      clave: `grupo:${departamento ?? ""}`,
      etiqueta: departamento === null ? SIN_DEPARTAMENTO : `DEPTO. ${departamento.toLocaleUpperCase("es")}`,
    });
    if (departamento !== null && delGrupo.length > 1) {
      const seleccion: Seleccion = { tipo: "departamento", nombre: departamento };
      elementos.push({
        tipo: "item",
        clave: claveDe(seleccion),
        seleccion,
        nombre: "Todo el departamento",
        sigla: "Dpto.",
        resumen: resumenDe(delGrupo),
      });
    }
    for (const ciudad of delGrupo) {
      const seleccion: Seleccion = { tipo: "ciudad", id: ciudad.id };
      elementos.push({
        tipo: "item",
        clave: claveDe(seleccion),
        seleccion,
        nombre: ciudad.nombre,
        sigla: sigla(ciudad.nombre),
        resumen: resumenDe([ciudad]),
      });
    }
  }
  return elementos;
}

/** Título y subtítulo del detalle. */
export function encabezadoDe(seleccion: Seleccion, ciudades: CiudadDelDia[]): { titulo: string; subtitulo: string } {
  const elegidas = ciudadesDe(seleccion, ciudades);
  const jornada = jornadaTexto(resumenDe(elegidas));
  if (seleccion.tipo === "ciudad") {
    const departamento = elegidas[0]?.departamento;
    return {
      titulo: elegidas[0]?.nombre ?? "",
      subtitulo: departamento ? `Departamento ${departamento} · ${jornada}` : jornada,
    };
  }
  if (seleccion.tipo === "departamento") return { titulo: `Departamento ${seleccion.nombre}`, subtitulo: jornada };
  return { titulo: "Todas las ciudades", subtitulo: jornada };
}

// ---------------------------------------------------------------------------------------------------------------------
// Textos de las cifras
// ---------------------------------------------------------------------------------------------------------------------

/** «2,8 h»; sin horas, «0 h». */
export function horasTexto(horas: number): string {
  const texto = horas.toFixed(1);
  return texto === "0.0" ? "0 h" : `${texto.replace(".", ",")} h`;
}

/** «$U 4.350»; los centavos solo si los hay («$U 4.350,50»). */
export function montoTexto(centavos: number): string {
  const pesos = Math.trunc(centavos / 100);
  const resto = Math.abs(centavos % 100);
  const miles = String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `$U ${miles}${resto === 0 ? "" : `,${String(resto).padStart(2, "0")}`}`;
}

export const ETIQUETA_ESTADO: Record<EstadoJornada, string> = {
  "en-jornada": "En jornada",
  "sin-cerrar": "Sin cerrar",
  finalizada: "Finalizada",
  "sin-iniciar": "Sin iniciar",
};

/**
 * Un colportor «Sin iniciar» que no tiene nada que contar muestra guiones en vez de ceros (no es lo mismo no haber
 * salido que haber salido y no vender). Si la base trae cifras de quien no subió su jornada, se muestran.
 */
export function sinCifras(colportor: ColportorDelDia): boolean {
  return (
    colportor.estado === "sin-iniciar" &&
    colportor.horas === 0 &&
    colportor.presentaciones === 0 &&
    colportor.ventas === 0 &&
    colportor.montoCentavos === 0
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Días y horas en Montevideo
// ---------------------------------------------------------------------------------------------------------------------

const PARTES = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Montevideo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

interface Partes {
  anio: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
}

function partesDe(fecha: Date): Partes {
  const p: Record<string, string> = {};
  for (const parte of PARTES.formatToParts(fecha)) p[parte.type] = parte.value;
  return { anio: Number(p.year), mes: Number(p.month), dia: Number(p.day), hora: Number(p.hour), minuto: Number(p.minute) };
}

const DIAS_SEMANA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const dosDigitos = (n: number) => String(n).padStart(2, "0");

function horaTexto(p: Partes): string {
  return `${dosDigitos(p.hora)}:${dosDigitos(p.minuto)}`;
}

function diasEntre(antes: Partes, despues: Partes): number {
  return Math.round((Date.UTC(despues.anio, despues.mes - 1, despues.dia) - Date.UTC(antes.anio, antes.mes - 1, antes.dia)) / 86_400_000);
}

/** «10:40» (hora de Montevideo). */
export function horaDeActualizacion(calculadoA: string): string {
  return horaTexto(partesDe(new Date(calculadoA)));
}

/**
 * La columna «Últimos datos»: hace cuánto llegó algo del teléfono. Mismo formato en todas las filas, sin umbral.
 * `ahora` es el momento en que el servidor calculó el tablero.
 */
export function ultimosDatosTexto(ultimoPushAt: string | null, ahora: string): string {
  if (ultimoPushAt === null) return "Sin datos";
  const push = new Date(ultimoPushAt);
  const referencia = new Date(ahora);
  if (Number.isNaN(push.getTime()) || Number.isNaN(referencia.getTime())) return "Sin datos";

  const minutos = Math.max(0, Math.floor((referencia.getTime() - push.getTime()) / 60_000));
  if (minutos < 1) return "hace menos de 1 min";
  if (minutos < 60) return `hace ${minutos} min`;

  const antes = partesDe(push);
  const despues = partesDe(referencia);
  const dias = diasEntre(antes, despues);
  if (dias === 0) {
    const horas = Math.floor(minutos / 60);
    const resto = minutos % 60;
    return resto === 0 ? `hace ${horas} h` : `hace ${horas} h ${resto} min`;
  }
  if (dias === 1) return `ayer ${horaTexto(antes)}`;
  return `hace ${dias} días`;
}

/** «hoy 09:15», «ayer 18:30» o «21 oct 09:15». */
export function momentoCortoTexto(iso: string, ahora: string): string {
  const antes = partesDe(new Date(iso));
  const dias = diasEntre(antes, partesDe(new Date(ahora)));
  if (dias === 0) return `hoy ${horaTexto(antes)}`;
  if (dias === 1) return `ayer ${horaTexto(antes)}`;
  return `${antes.dia} ${MESES[antes.mes - 1]} ${horaTexto(antes)}`;
}

/** «hoy a las 11:02», «ayer a las 18:30» o «el 21 oct a las 09:15». */
function cuandoSeSumoTexto(iso: string, ahora: string): string {
  const antes = partesDe(new Date(iso));
  const dias = diasEntre(antes, partesDe(new Date(ahora)));
  if (dias === 0) return `hoy a las ${horaTexto(antes)}`;
  if (dias === 1) return `ayer a las ${horaTexto(antes)}`;
  return `el ${antes.dia} ${MESES[antes.mes - 1]} a las ${horaTexto(antes)}`;
}

/** Suma o resta días a un `AAAA-MM-DD`, sin pasar por la zona horaria del navegador. */
export function sumarDias(fecha: string, dias: number): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const nueva = new Date(Date.UTC(anio, mes - 1, dia + dias));
  return `${nueva.getUTCFullYear()}-${dosDigitos(nueva.getUTCMonth() + 1)}-${dosDigitos(nueva.getUTCDate())}`;
}

/** «mié 21 oct» (con el año si no es el de `hoy`). */
export function diaTexto(fecha: string, hoy: string): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const semana = DIAS_SEMANA[new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay()];
  const anioHoy = Number(hoy.slice(0, 4));
  return `${semana} ${dia} ${MESES[mes - 1]}${anio === anioHoy ? "" : ` ${anio}`}`;
}

/** Lo que se lee en negrita del selector de día: «Hoy», «Ayer» o el día. */
export function rotuloDelDia(fecha: string, hoy: string): { fuerte: string; resto: string } {
  const texto = diaTexto(fecha, hoy);
  if (fecha === hoy) return { fuerte: "Hoy", resto: texto };
  if (fecha === sumarDias(hoy, -1)) return { fuerte: "Ayer", resto: texto };
  return { fuerte: texto, resto: "" };
}

// ---------------------------------------------------------------------------------------------------------------------
// Pendientes de acción
// ---------------------------------------------------------------------------------------------------------------------

export interface AccionDeTarjeta {
  texto: string;
  tono: "primaria" | "peligro";
  /** Dónde se resuelve; sin él, la acción todavía no tiene formulario diseñado. */
  destino?: { pestana: Pestana; href: string };
}

export interface TarjetaPendiente {
  id: string;
  /** La pestaña que lo resuelve. */
  etiqueta: "CUENTAS" | "STOCK" | "EQUIPO";
  titulo: string;
  detalle?: string;
  personas?: { id: string; nombre: string; cuando: string }[];
  acciones: AccionDeTarjeta[];
}

type Ticket = Extract<PendienteDeAccion, { tipo: "ticket-por-validar" }>;
type Pedido = Extract<PendienteDeAccion, { tipo: "pedido-por-autorizar" }>;

function tarjetaDeTickets(tickets: Ticket[], ahora: string): TarjetaPendiente {
  const masViejo = [...tickets].sort((a, b) => a.cuando.localeCompare(b.cuando))[0];
  const resto = tickets.length - 1;
  return {
    id: "tickets",
    etiqueta: "CUENTAS",
    titulo: tickets.length > 1 ? `${tickets.length} tickets de depósito por validar` : "Ticket de depósito por validar",
    detalle:
      `${masViejo.colportor} · ${masViejo.ciudad} · ${montoTexto(masViejo.montoCentavos)} · ${momentoCortoTexto(masViejo.cuando, ahora)}` +
      (resto > 0 ? ` · y ${resto} más` : ""),
    acciones: [{ texto: "Validar", tono: "primaria", destino: { pestana: "cuentas", href: "/cuentas" } }],
  };
}

function tarjetaDePedido(pedido: Pedido, ahora: string): TarjetaPendiente {
  return {
    id: pedido.id,
    etiqueta: "STOCK",
    titulo: "Pedido de libros por autorizar",
    detalle: `${pedido.colportor} · ${pedido.ciudad} · ${pedido.libros} ${pedido.libros === 1 ? "libro" : "libros"} · ${montoTexto(pedido.montoCentavos)} · ${momentoCortoTexto(pedido.cuando, ahora)}`,
    acciones: [
      { texto: "Autorizar", tono: "primaria" },
      { texto: "Rechazar", tono: "peligro" },
    ],
  };
}

function tarjetaSinZona(personas: ColportorSinZona[], ahora: string): TarjetaPendiente {
  const accion: AccionDeTarjeta = { texto: "Asignar zona", tono: "primaria", destino: { pestana: "ciudades", href: "/ciudades" } };
  if (personas.length === 1) {
    const [persona] = personas;
    return {
      id: "sin-zona",
      etiqueta: "EQUIPO",
      titulo: "Colportora sin zona asignada",
      detalle: `${persona.nombre} · se sumó ${cuandoSeSumoTexto(persona.inscriptoAt, ahora)}`,
      acciones: [accion],
    };
  }
  return {
    id: "sin-zona",
    etiqueta: "EQUIPO",
    titulo: `${personas.length} colportores sin zona asignada`,
    personas: personas.map((p) => ({ id: p.id, nombre: p.nombre, cuando: `se sumó ${cuandoSeSumoTexto(p.inscriptoAt, ahora)}` })),
    acciones: [accion],
  };
}

/**
 * Las tarjetas de «Pendientes de acción» de la elección: tickets y pedidos de sus ciudades, y los inscriptos sin zona
 * (que no tienen ciudad, así que figuran en toda elección). Quien ya se dio de baja no está en la campaña: no se le ofrece
 * «Asignar zona».
 */
export function tarjetasPendientes(tablero: TableroDelDia, seleccion: Seleccion): TarjetaPendiente[] {
  const ids = new Set(ciudadesDe(seleccion, tablero.ciudades).map((c) => c.id));
  const delAmbito = tablero.pendientes.filter((p) => ids.has(p.ciudadId));
  const tickets = delAmbito.filter((p): p is Ticket => p.tipo === "ticket-por-validar");
  const pedidos = delAmbito.filter((p): p is Pedido => p.tipo === "pedido-por-autorizar");
  const sinZona = tablero.sinZona.filter((p) => !p.deBaja);

  return [
    ...(tickets.length > 0 ? [tarjetaDeTickets(tickets, tablero.calculadoA)] : []),
    ...pedidos.map((p) => tarjetaDePedido(p, tablero.calculadoA)),
    ...(sinZona.length > 0 ? [tarjetaSinZona(sinZona, tablero.calculadoA)] : []),
  ];
}
