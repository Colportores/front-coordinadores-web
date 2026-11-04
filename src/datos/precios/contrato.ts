/**
 * Contrato de datos de Precios (vista 27, HU-CAT-005): el precio de venta es general para todo el país y una ciudad de la
 * campaña se aparta solo con una excepción (decisión de Cristian del 21/10, C9; docs#69). El coordinador ve el general sin
 * poder cambiarlo («Precio gral.», 06/10) y carga, cambia o quita las excepciones de las ciudades de su campaña.
 *
 * - La lectura sale de `precios_de_la_ciudad()` (backend-supabase#84, migraciones 0037, 0057 y 0071), una llamada por ciudad
 *   de la campaña. Los importes viajan en centavos y acá son **pesos enteros** (la vista no admite centavos).
 * - Sin datos de clientes: producto o colección, importes y fechas.
 * - Una excepción por producto o colección y ciudad (un solo precio vigente a la vez). Quitarla devuelve el producto al
 *   precio general de esa ciudad; las ventas ya registradas conservan el suyo.
 */

export type TipoDeItem = "PRODUCTO" | "COLECCION";

/** El tipo del catálogo (`producto.tipo`). `null` cuando la lectura todavía no lo trae. */
export type TipoDeProducto = "LIBRO" | "REVISTA" | "MATERIAL" | "MISIONERO";

/** Un producto o una colección (combo) del catálogo vivo, con su precio general. */
export interface ItemDePrecio {
  /** `PRODUCTO:<id>` o `COLECCION:<id>`: único en la lista, es la clave de los borradores y de las excepciones. */
  clave: string;
  tipo: TipoDeItem;
  id: string;
  nombre: string;
  /** Código del editor (`producto.codigo_editor`, opcional). `null`: sin código, o la lectura todavía no lo trae. */
  codigo: string | null;
  /** Solo en un producto, y `null` mientras la lectura no lo trae (entonces se agrupa como «Productos»). */
  tipoDeProducto: TipoDeProducto | null;
  /** Solo un producto puede serlo: una colección es siempre `false`. */
  esBonificable: boolean;
  esMisionero: boolean;
  /** Lo que lleva una colección además de lo fijo («2 libros a elegir»); `null` en un producto o sin nada que decir. */
  detalle: string | null;
  /** Componentes de un combo dados de baja: con alguno, el combo deja de ofrecerse hasta corregirlo (HU-CAT-009). */
  componentesDeBaja: number;
  /** El precio general vigente en pesos enteros; `null` cuando no tiene (R-CT05: sin general ni excepción no se ofrece). */
  precioGeneral: number | null;
}

/** Una ciudad de la campaña; `id` es `campania_ciudad_id`, el que piden las lecturas y las escrituras de precios. */
export interface CiudadDePrecios {
  id: string;
  nombre: string;
}

export interface DatosDePrecios {
  campaniaId: string;
  campaniaNombre: string;
  /** El catálogo vivo: primero los productos y después las colecciones, cada grupo por nombre. Puede estar vacío. */
  items: ItemDePrecio[];
  /** Las ciudades de la campaña, una pestaña cada una (también las que no tienen excepciones). */
  ciudades: CiudadDePrecios[];
  /** Las excepciones guardadas: ciudad (`campania_ciudad_id`) → clave del item → pesos enteros. */
  excepciones: Record<string, Record<string, number>>;
}

/**
 * Un cambio de la ciudad abierta: `precio` es la excepción nueva en pesos enteros, o `null` para quitarla (el producto
 * vuelve al general).
 */
export interface CambioDePrecio {
  tipo: TipoDeItem;
  id: string;
  precio: number | null;
}

/** Por qué no se pudo guardar: sin conexión (se reintenta igual) o rechazado por el servidor (trae su texto). */
export type CausaDeFalla = "sin-conexion" | "rechazado";

export type ResultadoDeGuardado = { ok: true } | { ok: false; causa: CausaDeFalla; mensaje?: string };

export interface FuenteDatosPrecios {
  /** `null` cuando el coordinador no tiene una campaña en curso ni por empezar. */
  obtenerPrecios(): Promise<DatosDePrecios | null>;
  /**
   * Guarda juntos los cambios de una ciudad de la campaña: o se aplican todos o ninguno. `campaniaId` es la de los datos que
   * se están viendo (queda atada a la acción en el servidor).
   */
  guardarPrecios(campaniaId: string, ciudadId: string, cambios: CambioDePrecio[]): Promise<ResultadoDeGuardado>;
}

/** Lo que usa la vista: la fuente sin el `campaniaId`, que la acción del servidor ya trae atado. */
export interface AccionesPrecios {
  guardarPrecios(ciudadId: string, cambios: CambioDePrecio[]): Promise<ResultadoDeGuardado>;
}

/** La clave de un producto o una colección. */
export function claveDe(tipo: TipoDeItem, id: string): string {
  return `${tipo}:${id}`;
}
