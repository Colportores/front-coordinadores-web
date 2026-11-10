import { textoFechaDeTicket } from "@/datos/cuentas/fechas";
import type { ConceptoPorValidar, ItemPorValidar, TarjetaDelDeposito } from "@/datos/cuentas/validar";
import { formatMonto } from "@/features/cuentas/formato";
import { conPuntosDeMiles } from "@/lib/texto";

/**
 * Lo que la vista 29 («Validar tickets») calcula sin pintar nada: el orden de la cola, los textos de cada fila y del panel,
 * la previa de la deuda y el motivo del rechazo. Los literales salen de «29 Validar Tickets.dc.html» (A·01 a A·03) y de la
 * sección 36R de «36 Cuentas.dc.html» (el retiro, «con el mismo panel y el mismo rechazo de la 29 A·02»).
 */

/** «Deshacer» dura 8 s y devuelve el ticket a la cola en su lugar (29, «Decisiones que la HU no dice»). */
export const MS_DESHACER = 8000;

/** El motivo del rechazo: no en blanco y hasta 500 caracteres (TV003 / DP006). El texto no se corta solo (36R·08). */
export const MAXIMO_DEL_MOTIVO = 500;

/** Motivos rápidos: completan el campo y se pueden editar. Los del retiro son otros (36R, «Textos propuesta»). */
export const MOTIVOS_RAPIDOS: Record<ItemPorValidar["tipo"], readonly string[]> = {
  deposito: ["Foto ilegible", "El monto no coincide", "Talonario ya usado"],
  retiro: ["El monto no coincide", "No recibí el efectivo", "Está cargado dos veces"],
};

/** Un ticket sin monto (`monto` null) no se puede validar: la base lo rechaza con TV004. Se muestra así en la fila y el panel. */
export const TEXTO_MONTO_NO_INFORMADO = "Monto no informado";

/** Por qué «Validar» está apagado en un ticket sin monto: el texto de TV004 de la base (0129), que dice qué hacer. */
export const TEXTO_SIN_MONTO_PARA_VALIDAR =
  "El ticket no tiene monto, no hay nada para acreditar. Rechazalo con un motivo para que el colportor lo cargue de nuevo.";

/** El monto como se lee («$U 9.000»), o «Monto no informado». */
export function textoDelMonto(item: Pick<ItemPorValidar, "monto">): string {
  return item.monto === null ? TEXTO_MONTO_NO_INFORMADO : formatMonto(item.monto);
}

/** Se puede validar (o confirmar): accionable y con monto. Sin monto solo se puede rechazar (no se ofrece algo que solo falla). */
export function sePuedeValidar(item: ItemPorValidar): boolean {
  return esAccionable(item) && item.monto !== null;
}

/**
 * Cuántos caracteres tiene el motivo como los cuenta la base (`length()` de PostgreSQL: puntos de código), no en unidades
 * UTF-16 de `String.length`: un emoji es uno, no dos.
 */
export function largoDelMotivo(texto: string): number {
  return Array.from(texto).length;
}

/** Se puede validar o rechazar: está pendiente y no es de quien mira (nadie confirma ni rechaza lo suyo, 36R·06). */
export function esAccionable(item: ItemPorValidar): boolean {
  return item.estado === "PENDIENTE" && !item.esVos;
}

/**
 * El orden de la cola, que se fija al abrir la vista: lo pendiente primero, del más antiguo al más nuevo (29: «la cola se
 * ordena del más antiguo al más nuevo»), y después lo ya resuelto, lo más nuevo primero. Validar o rechazar no mueve la fila
 * (29 A·03 y 36R·04: queda en su lugar con su estado nuevo).
 */
export function ordenarCola(items: readonly ItemPorValidar[]): ItemPorValidar[] {
  const pendientes = items.filter((i) => i.estado === "PENDIENTE").sort((a, b) => Date.parse(a.enviadoEn) - Date.parse(b.enviadoEn));
  const resueltos = items
    .filter((i) => i.estado !== "PENDIENTE")
    .sort((a, b) => Date.parse(b.resueltoEn ?? b.enviadoEn) - Date.parse(a.resueltoEn ?? a.enviadoEn));
  return [...pendientes, ...resueltos];
}

/** «hace 40 min», «hace 3 h», «hace 1 día», «hace 2 días». Nunca negativo ni «NaN». */
export function textoHace(iso: string, ahoraIso: string): string {
  const desde = Date.parse(iso);
  const ahora = Date.parse(ahoraIso);
  if (Number.isNaN(desde) || Number.isNaN(ahora)) return "—";
  const minutos = Math.max(0, Math.floor((ahora - desde) / 60_000));
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} ${dias === 1 ? "día" : "días"}`;
}

/** Fecha completa del depósito o de la entrega («28/09/2026»), en hora de Montevideo. */
export function fechaCompleta(iso: string): string {
  const instante = Date.parse(iso);
  if (Number.isNaN(instante)) return "—";
  const d = new Date(instante - 3 * 3_600_000);
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** El encabezado de la cola: «Tickets por validar · 4» y «el más antiguo: hace 2 días». */
export function encabezadoDeCola(items: readonly ItemPorValidar[], ahoraIso: string): { cantidad: number; masAntiguo: string | null } {
  const pendientes = items.filter(esAccionable);
  if (pendientes.length === 0) return { cantidad: 0, masAntiguo: null };
  const primero = pendientes.reduce((a, b) => (Date.parse(a.enviadoEn) <= Date.parse(b.enviadoEn) ? a : b));
  return { cantidad: pendientes.length, masAntiguo: textoHace(primero.enviadoEn, ahoraIso) };
}

export type TonoDeEstado = "alerta" | "exito" | "peligro";

/** El estado con símbolo y texto, además del color (◔ ✓ ✕). El retiro dice «Por confirmar» y «Confirmado» (36R). */
export function etiquetaDeEstado(item: Pick<ItemPorValidar, "tipo" | "estado">): { texto: string; tono: TonoDeEstado } {
  if (item.estado === "RECHAZADO") return { texto: "✕ Rechazado", tono: "peligro" };
  if (item.estado === "VALIDADO") return { texto: item.tipo === "retiro" ? "✓ Confirmado" : "✓ Validado", tono: "exito" };
  return { texto: item.tipo === "retiro" ? "◔ Por confirmar" : "◔ Por validar", tono: "alerta" };
}

/** El medio, como lo escribe la 36: «Depósito en banco · BROU», «Depósito en oficina», «Retiro por el coordinador». */
export function textoDeMedio(item: ItemPorValidar): string {
  if (item.tipo === "retiro") return "Retiro por el coordinador";
  if (item.lugar === "oficina") return item.entidad ? `Depósito en oficina · ${item.entidad}` : "Depósito en oficina";
  return item.entidad ? `Depósito en banco · ${item.entidad}` : "Depósito en banco";
}

/** Lo de abajo del medio en la fila: «aut. 004512» o «sin foto» (36R). */
export function detalleDeMedio(item: ItemPorValidar): string {
  if (item.tipo === "retiro") return "sin foto";
  return item.numeroAutorizacion ? `aut. ${item.numeroAutorizacion}` : "";
}

export function textoDeConcepto(concepto: ConceptoPorValidar): string {
  return concepto === "alquiler" ? "Alquiler" : "Casa editora";
}

const TARJETAS: Record<TarjetaDelDeposito, string> = { debito: "Débito", credito: "Crédito", no: "No" };

export interface Campo {
  rotulo: string;
  valor: string;
  grande?: boolean;
  mono?: boolean;
}

/** Los datos del ticket o del retiro, en el orden del panel (29 A·01 con los campos nuevos de C6; 36R·01 para el retiro). */
export function camposDelItem(item: ItemPorValidar, ahoraIso: string): Campo[] {
  const colportor = item.esVos ? `${item.colportorNombre} · vos` : item.colportorNombre;
  const comunes: Campo[] = [
    { rotulo: "MONTO", valor: textoDelMonto(item), grande: true },
    { rotulo: "PARA QUÉ ES", valor: textoDeConcepto(item.concepto) },
  ];
  if (item.tipo === "retiro") {
    return [
      ...comunes,
      { rotulo: "COLPORTOR", valor: colportor },
      { rotulo: "CIUDAD", valor: item.ciudad ?? "Sin zona" },
      { rotulo: "FECHA DE ENTREGA", valor: fechaCompleta(item.fecha) },
      { rotulo: "ENVIADO", valor: textoHace(item.enviadoEn, ahoraIso) },
    ];
  }
  return [
    ...comunes,
    { rotulo: "DÓNDE", valor: textoDeMedio(item) },
    { rotulo: "N.º DE AUTORIZACIÓN", valor: item.numeroAutorizacion ?? "—", mono: true },
    { rotulo: "TARJETA", valor: item.tarjeta ? TARJETAS[item.tarjeta] : "—" },
    { rotulo: "COLPORTOR", valor: colportor },
    { rotulo: "CIUDAD", valor: item.ciudad ?? "Sin zona" },
    { rotulo: "FECHA DEL DEPÓSITO", valor: fechaCompleta(item.fecha) },
    { rotulo: "ENVIADO", valor: textoHace(item.enviadoEn, ahoraIso) },
  ];
}

export interface Previa {
  campos: Campo[];
  /**
   * Avisos que no frenan (regla R4): «Pago de más» de casa editora (Cristian, 25/10), el alquiler de más que pasa a la casa
   * editora (`a_la_casa_editora`, 0152) y la diferencia con lo que tenía en mano (`diferencia = monto - en_mano`, 0152).
   * Textos decididos en pendientes/front-coordinadores-web-69-impl-261110-0734.md, P2.
   */
  avisos: string[];
}

/**
 * Lo que la app sabe para comparar con lo que contó la coordinadora (36R·01): en mano, la deuda del concepto y cómo queda
 * si valida o confirma. Un depósito de casa editora mayor que la deuda queda a favor y se avisa sin frenar.
 */
export function previaDelItem(item: ItemPorValidar): Previa | null {
  if (!item.cifras || !esAccionable(item) || item.monto === null) return null;
  const { enMano, deuda } = item.cifras;
  const despues = deuda - item.monto;
  const rotuloDeuda = item.concepto === "alquiler" ? "DEUDA DE ALQUILER" : "DEUDA CON LA CASA EDITORA";
  const rotuloQueda = item.tipo === "retiro" ? "SI CONFIRMÁS, QUEDA EN" : "SI VALIDÁS, QUEDA EN";
  const aFavor = item.concepto === "casa-editora" && despues < 0 ? -despues : 0;
  const aLaCasaEditora = item.concepto === "alquiler" && despues < 0 ? -despues : 0;
  const diferencia = item.monto - enMano;
  const avisos: string[] = [];
  if (aFavor > 0) avisos.push(`Supera la deuda de ${formatMonto(deuda)}: quedan ${formatMonto(aFavor)} a favor`);
  if (aLaCasaEditora > 0) {
    avisos.push(`Supera la deuda de alquiler de ${formatMonto(deuda)}: los ${formatMonto(aLaCasaEditora)} de más van a la deuda con la casa editora`);
  }
  if (diferencia !== 0) {
    avisos.push(
      `Según la app tenía en mano ${formatMonto(enMano)} y ${item.tipo === "retiro" ? "el retiro" : "el ticket"} dice ${formatMonto(item.monto)} (diferencia ${formatMonto(Math.abs(diferencia))})`,
    );
  }
  return {
    campos: [
      { rotulo: "EN MANO SEGÚN LA APP", valor: formatMonto(enMano), mono: true },
      { rotulo: rotuloDeuda, valor: formatMonto(deuda), mono: true },
      { rotulo: rotuloQueda, valor: aFavor > 0 ? `a favor ${formatMonto(aFavor)}` : formatMonto(Math.max(despues, 0)), mono: true },
    ],
    avisos,
  };
}

/** Qué dice el panel antes de decidir (36R·01) y antes de confirmar el rechazo (36R·03). */
export function textoInformativo(item: ItemPorValidar, rechazando: boolean): string | null {
  const nombre = item.colportorNombre.split(" ")[0];
  if (rechazando) {
    return item.tipo === "retiro"
      ? `${nombre} va a ver este motivo en su teléfono. El retiro queda rechazado en el historial: no se edita ni se borra, no baja la deuda y no cuenta como depositado.`
      : null;
  }
  if (item.tipo === "retiro") return `Confirmar acredita ${textoDelMonto(item)} igual que un depósito validado. Rechazar no cambia la deuda.`;
  return null;
}

export type ResultadoDelMotivo = { ok: true; motivo: string } | { ok: false; error: string };

/** El motivo recortado, o por qué no sirve: vacío o solo espacios (29 A·02), o más de 500 (36R·08). */
export function validarMotivo(texto: string, tipo: ItemPorValidar["tipo"]): ResultadoDelMotivo {
  const motivo = texto.trim();
  if (motivo === "") return { ok: false, error: tipo === "retiro" ? "Escribí el motivo para rechazar el retiro." : "Escribí el motivo para rechazar el ticket." };
  const largo = largoDelMotivo(motivo);
  if (largo > MAXIMO_DEL_MOTIVO) return { ok: false, error: textoDeMotivoLargo(largo) };
  return { ok: true, motivo };
}

export function textoDeMotivoLargo(n: number): string {
  return `El motivo tiene ${conPuntosDeMiles(String(n))} caracteres y el máximo es ${MAXIMO_DEL_MOTIVO}. Acortalo para rechazar.`;
}

/** El contador «N / 500». */
export function contadorDelMotivo(texto: string): string {
  return `${conPuntosDeMiles(String(largoDelMotivo(texto)))} / ${MAXIMO_DEL_MOTIVO}`;
}

/** El aviso de abajo tras decidir (29 A·03 y 36R·04 / 05). */
export function textoDeDecision(item: ItemPorValidar, decision: "validar" | "rechazar"): string {
  if (item.tipo === "retiro") {
    return decision === "validar" ? `✓ Retiro de ${item.colportorNombre} confirmado.` : `✕ Retiro de ${item.colportorNombre} rechazado. Le avisamos.`;
  }
  const numero = item.numeroAutorizacion ? `${item.numeroAutorizacion} ` : "";
  return decision === "validar"
    ? `✓ Ticket ${numero}de ${item.colportorNombre} validado.`
    : `✕ Ticket ${numero}de ${item.colportorNombre} rechazado. Le avisamos.`;
}

/** La franja de un ítem ya resuelto, o del retiro propio (36R·04, 05 y 06). */
export function bandaDelItem(item: ItemPorValidar, ahoraIso: string): { icono: string; texto: string; tono: "peligro" | "exito" | "neutro" } | null {
  if (item.estado === "PENDIENTE") {
    if (!item.esVos) return null;
    const que = item.tipo === "retiro" ? "Este retiro es tuyo" : "Este ticket es tuyo";
    return { icono: "i", texto: `${que}. Nadie confirma ni rechaza lo suyo: lo resuelve otro coordinador o el administrador.`, tono: "neutro" };
  }
  const cuando = item.resueltoEn ? ` · ${textoFechaDeTicket(item.resueltoEn, ahoraIso)}` : "";
  const quien = item.resueltoPorVos ? " por vos" : "";
  if (item.estado === "RECHAZADO") return { icono: "✕", texto: `Rechazado${quien}${cuando}`, tono: "peligro" };
  const verbo = item.tipo === "retiro" ? "Confirmado" : "Validado";
  return { icono: "✓", texto: `${verbo}${quien}${cuando}`, tono: "exito" };
}

/** Qué pasó con lo ya resuelto (36R·04 y 05), dicho para el ticket o para el retiro. */
export function textoDeResuelto(item: ItemPorValidar): string | null {
  const nombre = item.colportorNombre.split(" ")[0];
  if (item.estado === "RECHAZADO") {
    const nuevo = item.tipo === "retiro" ? "un retiro nuevo" : "un ticket nuevo";
    return `No bajó la deuda ni cuenta como depositado. ${nombre} recibió el aviso y ve el motivo en su teléfono; para corregirlo carga ${nuevo}.`;
  }
  if (item.estado === "VALIDADO") {
    return item.tipo === "retiro"
      ? "Acreditó igual que un depósito validado: bajó la deuda y cuenta como depositado."
      : "Acreditó: bajó la deuda y cuenta como depositado.";
  }
  return null;
}

/** El que se abre después de decidir: el siguiente que se puede validar después de `id` en la cola, o el primero de antes. */
export function siguienteAccionable(cola: readonly ItemPorValidar[], id: string): string | null {
  const i = cola.findIndex((x) => x.id === id);
  const despues = cola.slice(i + 1).find((x) => x.id !== id && esAccionable(x));
  if (despues) return despues.id;
  const antes = cola.slice(0, Math.max(i, 0)).find((x) => x.id !== id && esAccionable(x));
  return antes?.id ?? null;
}

/** Aplica una decisión al ítem (en el lugar: la fila no se mueve). */
export function conDecision(
  cola: readonly ItemPorValidar[],
  id: string,
  cambio: Pick<ItemPorValidar, "estado"> & Partial<Pick<ItemPorValidar, "motivoRechazo" | "resueltoEn" | "resueltoPorVos">>,
): ItemPorValidar[] {
  return cola.map((x) => (x.id === id ? { ...x, motivoRechazo: undefined, resueltoEn: undefined, resueltoPorVos: undefined, ...cambio } : x));
}
