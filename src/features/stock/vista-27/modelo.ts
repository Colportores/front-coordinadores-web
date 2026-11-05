import { claveDe, type CambioDePrecio, type DatosDePrecios, type ItemDePrecio } from "@/datos/precios";
import { formatMonto } from "@/features/cuentas/formato";

/**
 * Lógica pura de la vista 27 (precios: general y excepciones por ciudad, HU-CAT-005). Sin React: se prueba sola.
 *
 * - Pesos enteros en todo el modelo (la base guarda centavos; la fuente real convierte).
 * - Los cambios sin guardar de cada ciudad viven en un `Borrador` (clave del item → `Edicion`). Una edición es lo que la
 *   persona tipeó o marcó, no el resultado: así «Revertir» y «Esc» solo la sacan del borrador.
 * - Una edición que no cambia nada (el mismo valor que ya rige, o un campo recién abierto y vacío) no cuenta como cambio y no
 *   se manda.
 */

// ---------------------------------------------------------------------------------------------------------------------
// Precios
// ---------------------------------------------------------------------------------------------------------------------

/** El tope técnico: la base guarda centavos en un entero de 32 bits. */
export const PRECIO_MAXIMO = 21_474_836;

/** Más que esto respecto del precio anterior (hacia arriba o hacia abajo) pide confirmar antes de guardar (27A·03). */
export const UMBRAL_DE_CAMBIO_GRANDE = 0.2;

export const TEXTO_PRECIO_INVALIDO = "Ingresá un precio mayor a 0, sin centavos.";
export const TEXTO_PRECIO_MUY_ALTO = `El precio no puede pasar de ${formatMonto(PRECIO_MAXIMO)}.`;

export type LecturaDePrecio = { ok: true; valor: number } | { ok: false; motivo: "vacio" | "formato" | "cero" | "largo" };

/** Lee lo que se tipeó: un entero positivo, con o sin puntos de miles. «1900,50», «-3» o «abc» no son precios. */
export function leerPrecio(texto: string): LecturaDePrecio {
  const limpio = texto.replace(/^\s*\$\s*U?\s*/i, "").replace(/\s+/g, "");
  if (limpio === "") return { ok: false, motivo: "vacio" };
  if (!/^\d+$/.test(limpio) && !/^\d{1,3}(\.\d{3})+$/.test(limpio)) return { ok: false, motivo: "formato" };
  const valor = Number(limpio.replaceAll(".", ""));
  if (valor <= 0) return { ok: false, motivo: "cero" };
  if (valor > PRECIO_MAXIMO) return { ok: false, motivo: "largo" };
  return { ok: true, valor };
}

export function textoDeErrorDePrecio(motivo: Extract<LecturaDePrecio, { ok: false }>["motivo"]): string {
  return motivo === "largo" ? TEXTO_PRECIO_MUY_ALTO : TEXTO_PRECIO_INVALIDO;
}

export const formatoPesos = formatMonto;

function pesosConSigno(n: number): string {
  return `${n < 0 ? "−" : "+"}${formatMonto(Math.abs(n))}`;
}

function porcentaje(n: number, decimales: 0 | 1): string {
  const signo = n < 0 ? "−" : "+";
  const absoluto = Math.abs(n);
  const texto = decimales === 0 ? String(Math.round(absoluto)) : absoluto.toFixed(1).replace(".", ",");
  return `${signo}${texto} %`;
}

export interface Diferencia {
  texto: string;
  /** Sube (▲, verde) o baja (▼, rojo) respecto de la referencia. */
  sube: boolean;
}

/**
 * «▲ +$U 100 · +5 %» / «▼ −$U 400 · −17 %»: lo que cambia `nuevo` respecto de `anterior`, con la flecha además del color.
 * `null` si no hay con qué comparar. Igual: «Igual al general»-style lo decide quien llama (`df === 0`).
 */
export function diferenciaDe(anterior: number | null, nuevo: number, decimales: 0 | 1 = 0): Diferencia | null {
  if (anterior === null || anterior <= 0) return null;
  const df = nuevo - anterior;
  if (df === 0) return null;
  const pc = (df / anterior) * 100;
  return { texto: `${df > 0 ? "▲" : "▼"} ${pesosConSigno(df)} · ${porcentaje(pc, decimales)}`, sube: df > 0 };
}

/** ¿Pasa del umbral de la confirmación respecto del precio anterior? Sin precio anterior no hay con qué comparar. */
export function esCambioGrande(anterior: number | null, nuevo: number | null): boolean {
  if (anterior === null || nuevo === null || anterior <= 0) return false;
  return Math.abs(nuevo - anterior) / anterior > UMBRAL_DE_CAMBIO_GRANDE;
}

// ---------------------------------------------------------------------------------------------------------------------
// Catálogo: grupos y etiquetas
// ---------------------------------------------------------------------------------------------------------------------

export type TituloDeGrupo = "LIBROS" | "REVISTAS" | "MATERIALES" | "PRODUCTOS" | "COLECCIONES";

const ORDEN_DE_GRUPOS: TituloDeGrupo[] = ["LIBROS", "REVISTAS", "MATERIALES", "PRODUCTOS", "COLECCIONES"];

/** El grupo del canvas, por la categoría (decisión del 04/11). Un producto sin categoría va a «Productos» en vez de adivinarlo. */
export function grupoDe(item: ItemDePrecio): TituloDeGrupo {
  if (item.tipo === "COLECCION") return "COLECCIONES";
  switch (item.categoria) {
    case "BONIFICABLES":
    case "MISIONEROS":
    case "ESPIRITUALES":
      return "LIBROS";
    case "REVISTAS":
      return "REVISTAS";
    case "MATERIAL":
      return "MATERIALES";
    default:
      return "PRODUCTOS";
  }
}

export type TonoDeEtiqueta = "bonificable" | "misionero" | "revista" | "coleccion";

export interface Etiqueta {
  texto: string;
  tono: TonoDeEtiqueta;
}

/** Las insignias del canvas (Bonificable, Misionero, Revista, Colección): un item puede llevar más de una. */
export function etiquetasDe(item: ItemDePrecio): Etiqueta[] {
  if (item.tipo === "COLECCION") return [{ texto: "Colección", tono: "coleccion" }];
  const etiquetas: Etiqueta[] = [];
  if (item.esMisionero) etiquetas.push({ texto: "Misionero", tono: "misionero" });
  if (item.esBonificable) etiquetas.push({ texto: "Bonificable", tono: "bonificable" });
  if (item.categoria === "REVISTAS") etiquetas.push({ texto: "Revista", tono: "revista" });
  return etiquetas;
}

export interface GrupoDeFilas<F> {
  titulo: TituloDeGrupo;
  filas: F[];
}

/** Agrupa conservando el orden de la lista dentro de cada grupo; los grupos vacíos no salen. */
export function agruparFilas<F extends { item: ItemDePrecio }>(filas: F[]): GrupoDeFilas<F>[] {
  return ORDEN_DE_GRUPOS.map((titulo) => ({ titulo, filas: filas.filter((f) => grupoDe(f.item) === titulo) })).filter(
    (g) => g.filas.length > 0,
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Pestaña General
// ---------------------------------------------------------------------------------------------------------------------

export interface FilaGeneral {
  item: ItemDePrecio;
  /** «$U 2.400», o «sin precio» (en rojo) cuando el producto no tiene precio general. */
  precio: string;
  sinPrecio: boolean;
  /** En cuántas ciudades de la campaña tiene excepción. */
  ciudadesConExcepcion: number;
  /** «2 ciudades», «1 ciudad» o «—». */
  textoDeExcepciones: string;
}

export function textoDeCiudades(n: number): string {
  if (n === 0) return "—";
  return n === 1 ? "1 ciudad" : `${n} ciudades`;
}

export function armarFilasGenerales(datos: DatosDePrecios): FilaGeneral[] {
  return datos.items.map((item) => {
    const ciudadesConExcepcion = datos.ciudades.filter((c) => datos.excepciones[c.id]?.[item.clave] !== undefined).length;
    return {
      item,
      precio: item.precioGeneral === null ? "sin precio" : formatMonto(item.precioGeneral),
      sinPrecio: item.precioGeneral === null,
      ciudadesConExcepcion,
      textoDeExcepciones: textoDeCiudades(ciudadesConExcepcion),
    };
  });
}

/** Los productos bonificables sin precio general: no se ofrecen en ninguna ciudad que no les ponga una excepción. */
export function bonificablesSinPrecioGeneral(datos: DatosDePrecios): ItemDePrecio[] {
  return datos.items.filter((i) => i.tipo === "PRODUCTO" && i.esBonificable && i.precioGeneral === null);
}

/**
 * La alerta de la pestaña General (decisión del 04/11: la alerta de un producto sin precio general sale solo ahí, no en las
 * ciudades, hasta que Cristian conteste «Sin general»). Sin artboard: texto armado sobre el de 27G·05.
 */
export function textoDeAlertaSinPrecioGeneral(sinPrecio: ItemDePrecio[]): string | null {
  if (sinPrecio.length === 0) return null;
  if (sinPrecio.length === 1) {
    return `${sinPrecio[0].nombre} es bonificable y no tiene precio general: los colportores no lo pueden vender en una ciudad que no le ponga una excepción.`;
  }
  const nombres = sinPrecio.map((i) => i.nombre).join(", ");
  return `${sinPrecio.length} productos bonificables no tienen precio general (${nombres}): los colportores no los pueden vender en una ciudad que no les ponga una excepción.`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Pestaña de una ciudad
// ---------------------------------------------------------------------------------------------------------------------

/** Lo que se tocó en una fila: un valor tipeado (`tocado`: ya se escribió algo, vacío incluido) o quitar la excepción. */
export type Edicion = { tipo: "valor"; texto: string; tocado: boolean } | { tipo: "quitar" };

/** Los cambios sin guardar de una ciudad: clave del item → edición. */
export type Borrador = Record<string, Edicion>;

/** Los de todas las ciudades: `campania_ciudad_id` → borrador. */
export type BorradoresPorCiudad = Record<string, Borrador>;

export type CambioNeto =
  | { clave: string; estado: "invalido"; motivo: Extract<LecturaDePrecio, { ok: false }>["motivo"] }
  | { clave: string; estado: "valido"; precio: number | null };

/**
 * Qué cambia de verdad una edición sobre lo que rige hoy en la ciudad. `null` cuando no cambia nada: quitar donde no hay
 * excepción, el mismo valor que ya rige (la excepción o, sin ella, el general) o un campo recién abierto y vacío.
 */
export function cambioDe(item: ItemDePrecio, excepcion: number | null, edicion: Edicion): CambioNeto | null {
  if (edicion.tipo === "quitar") return excepcion === null ? null : { clave: item.clave, estado: "valido", precio: null };
  if (edicion.texto.trim() === "" && !edicion.tocado) return null;
  const lectura = leerPrecio(edicion.texto);
  if (!lectura.ok) return { clave: item.clave, estado: "invalido", motivo: lectura.motivo };
  const rige = excepcion ?? item.precioGeneral;
  if (lectura.valor === rige) return null;
  return { clave: item.clave, estado: "valido", precio: lectura.valor };
}

export function excepcionDe(datos: DatosDePrecios, ciudadId: string, clave: string): number | null {
  return datos.excepciones[ciudadId]?.[clave] ?? null;
}

export type TonoDeEstado = "excepcion" | "modificado" | "invalido" | "sin-excepcion" | "no-se-ofrece";

export type AccionDeFila = "agregar" | "quitar" | "revertir" | "deshacer";

export const TEXTO_DE_ACCION: Record<AccionDeFila, string> = {
  agregar: "+ Excepción",
  quitar: "Quitar excepción",
  revertir: "Revertir",
  deshacer: "Deshacer",
};

export const TEXTO_DE_ESTADO: Record<TonoDeEstado, string> = {
  excepcion: "Excepción",
  modificado: "Modificado",
  invalido: "Inválido",
  "sin-excepcion": "Sin excepción",
  "no-se-ofrece": "No se ofrece",
};

export interface FilaDeCiudad {
  item: ItemDePrecio;
  /** El general de la fila: «$U 2.400» o «sin precio». */
  general: string;
  generalSinPrecio: boolean;
  /** Se atenúa cuando la ciudad lo reemplaza con una excepción. */
  generalAtenuado: boolean;
  campo:
    | { tipo: "texto"; texto: string }
    | { tipo: "entrada"; valor: string; marcado: boolean; invalido: boolean };
  diferencia: Diferencia | null;
  estado: TonoDeEstado | null;
  accion: AccionDeFila | null;
  error: string | null;
  /** Para pintar la fila: lo que cambió y todavía no se guardó. */
  resaltada: "modificada" | "invalida" | "quitada" | null;
}

export function armarFilaDeCiudad(item: ItemDePrecio, excepcion: number | null, edicion: Edicion | undefined): FilaDeCiudad {
  const general = item.precioGeneral;
  const base = {
    item,
    general: general === null ? "sin precio" : formatMonto(general),
    generalSinPrecio: general === null,
    error: null,
    resaltada: null,
  } as const;
  const sinExcepcion = general === null ? "sin precio" : "usa el general";

  const conExcepcion = (valor: number | null, extra: Partial<FilaDeCiudad> = {}): FilaDeCiudad => ({
    ...base,
    generalAtenuado: true,
    campo: { tipo: "entrada", valor: valor === null ? "" : String(valor), marcado: false, invalido: false },
    diferencia: valor === null ? null : diferenciaDe(general, valor),
    estado: "excepcion",
    accion: "quitar",
    ...extra,
  });

  if (edicion === undefined) {
    if (excepcion !== null) return conExcepcion(excepcion);
    if (general === null) {
      return {
        ...base,
        generalAtenuado: false,
        campo: { tipo: "texto", texto: "—" },
        diferencia: null,
        estado: "no-se-ofrece",
        accion: "agregar",
      };
    }
    return { ...base, generalAtenuado: false, campo: { tipo: "texto", texto: sinExcepcion }, diferencia: null, estado: null, accion: "agregar" };
  }

  if (edicion.tipo === "quitar") {
    return {
      ...base,
      generalAtenuado: false,
      campo: { tipo: "texto", texto: sinExcepcion },
      diferencia: null,
      estado: "sin-excepcion",
      accion: "deshacer",
      resaltada: "quitada",
    };
  }

  const cambio = cambioDe(item, excepcion, edicion);
  if (cambio?.estado === "invalido") {
    return {
      ...base,
      generalAtenuado: excepcion !== null,
      campo: { tipo: "entrada", valor: edicion.texto, marcado: true, invalido: true },
      diferencia: null,
      estado: "invalido",
      accion: "revertir",
      error: textoDeErrorDePrecio(cambio.motivo),
      resaltada: "invalida",
    };
  }
  if (cambio === null) {
    // Lo tipeado coincide con lo que rige: el campo sigue abierto, sin nada que guardar.
    return {
      ...base,
      generalAtenuado: excepcion !== null,
      campo: { tipo: "entrada", valor: edicion.texto, marcado: false, invalido: false },
      diferencia: excepcion !== null ? diferenciaDe(general, excepcion) : null,
      estado: excepcion !== null ? "excepcion" : null,
      accion: excepcion !== null ? "quitar" : "revertir",
    };
  }
  const precio = cambio.precio as number;
  return {
    ...base,
    generalAtenuado: true,
    campo: { tipo: "entrada", valor: edicion.texto, marcado: true, invalido: false },
    diferencia: diferenciaDe(general, precio),
    estado: "modificado",
    accion: "revertir",
    resaltada: "modificada",
  };
}

export function armarFilasDeCiudad(datos: DatosDePrecios, ciudadId: string, borrador: Borrador): FilaDeCiudad[] {
  return datos.items.map((item) => armarFilaDeCiudad(item, excepcionDe(datos, ciudadId, item.clave), borrador[item.clave]));
}

export interface ResumenDeCambios {
  /** Los cambios que cuentan (sin los que no cambian nada), por clave. */
  cambios: CambioNeto[];
  invalidos: number;
}

export function resumirBorrador(datos: DatosDePrecios, ciudadId: string, borrador: Borrador): ResumenDeCambios {
  const cambios: CambioNeto[] = [];
  for (const item of datos.items) {
    const edicion = borrador[item.clave];
    if (!edicion) continue;
    const cambio = cambioDe(item, excepcionDe(datos, ciudadId, item.clave), edicion);
    if (cambio) cambios.push(cambio);
  }
  return { cambios, invalidos: cambios.filter((c) => c.estado === "invalido").length };
}

export function cantidadSinGuardar(datos: DatosDePrecios, borradores: BorradoresPorCiudad): number {
  return datos.ciudades.reduce((suma, c) => suma + resumirBorrador(datos, c.id, borradores[c.id] ?? {}).cambios.length, 0);
}

/** Los cambios listos para mandar a la fuente (en el orden del catálogo). Vacío si hay alguno inválido. */
export function cambiosParaGuardar(datos: DatosDePrecios, ciudadId: string, borrador: Borrador): CambioDePrecio[] {
  const { cambios, invalidos } = resumirBorrador(datos, ciudadId, borrador);
  if (invalidos > 0) return [];
  const porClave = new Map(cambios.map((c) => [c.clave, c]));
  const enviados: CambioDePrecio[] = [];
  for (const item of datos.items) {
    const cambio = porClave.get(item.clave);
    if (cambio?.estado === "valido") enviados.push({ tipo: item.tipo, id: item.id, precio: cambio.precio });
  }
  return enviados;
}

export interface CambioGrande {
  item: ItemDePrecio;
  anterior: number;
  nuevo: number;
  diferencia: Diferencia;
}

/**
 * Los cambios que pasan del umbral (27A·03). El precio anterior es el que regía en la ciudad (la excepción o, sin ella, el
 * general); el nuevo, la excepción que queda o, al quitarla, el general.
 */
export function cambiosGrandes(datos: DatosDePrecios, ciudadId: string, cambios: CambioDePrecio[]): CambioGrande[] {
  const grandes: CambioGrande[] = [];
  for (const cambio of cambios) {
    const item = datos.items.find((i) => i.clave === claveDe(cambio.tipo, cambio.id));
    if (!item) continue;
    const anterior = excepcionDe(datos, ciudadId, item.clave) ?? item.precioGeneral;
    const nuevo = cambio.precio ?? item.precioGeneral;
    if (anterior === null || nuevo === null || !esCambioGrande(anterior, nuevo)) continue;
    const diferencia = diferenciaDe(anterior, nuevo, 1);
    if (diferencia) grandes.push({ item, anterior, nuevo, diferencia });
  }
  return grandes;
}

/** Aplica lo que se guardó a las excepciones que muestra la vista. No toca los datos que recibe. */
export function aplicarGuardado(datos: DatosDePrecios, ciudadId: string, guardados: CambioDePrecio[]): DatosDePrecios {
  const deLaCiudad = { ...(datos.excepciones[ciudadId] ?? {}) };
  for (const cambio of guardados) {
    const clave = claveDe(cambio.tipo, cambio.id);
    if (cambio.precio === null) delete deLaCiudad[clave];
    else deLaCiudad[clave] = cambio.precio;
  }
  return { ...datos, excepciones: { ...datos.excepciones, [ciudadId]: deLaCiudad } };
}

function igualesLasEdiciones(a: Edicion | undefined, b: Edicion | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  if (a.tipo !== b.tipo) return false;
  return a.tipo === "quitar" || (b.tipo === "valor" && a.texto === b.texto);
}

/**
 * Saca del borrador lo que ya se guardó. `enviado` es el borrador tal como estaba al mandar: una fila que la persona siguió
 * tocando mientras se guardaba (otro valor, o «Revertir») conserva su última edición, y las que no se mandaron no se tocan.
 */
export function descontarGuardado(actual: Borrador, enviado: Borrador, guardadas: Set<string>): Borrador {
  const resto: Borrador = {};
  for (const [clave, edicion] of Object.entries(actual)) {
    if (guardadas.has(clave) && igualesLasEdiciones(edicion, enviado[clave])) continue;
    resto[clave] = edicion;
  }
  return resto;
}

// ---------------------------------------------------------------------------------------------------------------------
// Pestañas
// ---------------------------------------------------------------------------------------------------------------------

export const ID_PESTANA_GENERAL = "general";

export interface PestanaDePrecios {
  id: string;
  nombre: string;
  /** «3 excepciones», «1 excepción»; `null` sin ninguna (y en General). */
  excepciones: string | null;
  sinGuardar: number;
}

export function textoDeExcepciones(n: number): string | null {
  if (n === 0) return null;
  return n === 1 ? "1 excepción" : `${n} excepciones`;
}

export function armarPestanas(datos: DatosDePrecios, borradores: BorradoresPorCiudad): PestanaDePrecios[] {
  return [
    { id: ID_PESTANA_GENERAL, nombre: "General", excepciones: null, sinGuardar: 0 },
    ...datos.ciudades.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      excepciones: textoDeExcepciones(Object.keys(datos.excepciones[c.id] ?? {}).length),
      sinGuardar: resumirBorrador(datos, c.id, borradores[c.id] ?? {}).cambios.length,
    })),
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------------------------------------------------

export const SUBTITULO_GENERAL = "El precio de todo el país. Cada ciudad usa este precio salvo que tenga una excepción.";

export function subtituloDeCiudad(ciudad: string): string {
  return `Se aplican a las ventas nuevas de ${ciudad}. Sin excepción, la ciudad usa el precio general.`;
}

export const AVISO_GENERAL = "El precio general lo fija el administrador. Para cambiar el de una ciudad, agregá una excepción en su pestaña.";

export function textoDeCambios(n: number): string {
  return n === 1 ? "1 cambio sin guardar" : `${n} cambios sin guardar`;
}

export function textoDeCorregir(n: number): string {
  return n === 1 ? "Corregí 1 precio para poder guardar." : `Corregí ${n} precios para poder guardar.`;
}

export function textoDeAplicacion(ciudad: string): string {
  return `Se aplican a las ventas nuevas de ${ciudad}; las anteriores conservan su precio.`;
}

/** «Guardamos 2 precios de Montevideo. Valen para las ventas nuevas.» (con una excepción quitada, «cambios»). */
export function textoDeGuardado(guardados: CambioDePrecio[], ciudad: string): string {
  const n = guardados.length;
  const soloPrecios = guardados.every((c) => c.precio !== null);
  if (soloPrecios) {
    return n === 1
      ? `Guardamos 1 precio de ${ciudad}. Vale para las ventas nuevas.`
      : `Guardamos ${n} precios de ${ciudad}. Valen para las ventas nuevas.`;
  }
  return n === 1
    ? `Guardamos 1 cambio de ${ciudad}. Vale para las ventas nuevas.`
    : `Guardamos ${n} cambios de ${ciudad}. Valen para las ventas nuevas.`;
}
