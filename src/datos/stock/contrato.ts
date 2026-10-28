/**
 * Contrato de datos de la pestaña Stock (vista 34, HU-STK-010): el stock de la campaña por ciudad, producto por producto,
 * y lo que tiene cada colportor. Es lo que después implementa la RPC de lectura (backend-supabase#101, V2: se conecta
 * después del 20/11); hasta entonces lo cumple la fuente simulada.
 *
 * Qué trae y qué no:
 * - Cantidades, nunca plata ni datos de clientes: la deuda, lo depositado y el dinero en mano son de Cuentas (HU-CTA-005).
 * - El stock de una ciudad es la suma del de los colportores de esa ciudad, la de su zona asignada (S69). El colportor sin
 *   zona no tiene ciudad (`ciudadId: null`): la vista lo agrupa aparte, como «Sin ciudad».
 * - Las alertas («Agotado en la ciudad», «Faltan N para entregar») no viajan: salen de estas cantidades, que es lo que
 *   dibuja el canvas. Sin umbral y sin stock mínimo sugerido (S47).
 * - Pedidos a la casa editora y transferencias son de la vista 35 (HU-STK-001/003/005), no de esta.
 */

export type TipoDeProducto = "LIBRO" | "REVISTA" | "MATERIAL" | "MISIONERO";

export interface CiudadDeStock {
  id: string;
  nombre: string;
  /** `null` cuando la ciudad no tiene departamento cargado. */
  departamento: string | null;
}

export interface ProductoDeStock {
  id: string;
  nombre: string;
  /** Los jugos y los alimentos son «Material»; las revistas, «Revistas» (decisión C4 del 21/10). */
  tipo: TipoDeProducto;
  /** Aclaración de catálogo que se muestra debajo del nombre (p. ej. «tipo a confirmar»). */
  nota: string | null;
}

/** Lo que tiene un colportor de un producto. Un producto que no figura vale cero en todo. */
export interface ExistenciaDeStock {
  productoId: string;
  /** Unidades que tiene en mano. */
  tiene: number;
  /** Vendidas y todavía no entregadas. */
  porEntregar: number;
  /** Entregadas. No se les resta lo devuelto: la devolución va aparte, en `devueltos`. */
  entregados: number;
  /** Devueltas al stock (devolución de una venta, HU-VEN-004). Columna «Devueltos», aparte de `entregados` (decisión de Cristian, 27/10, «Devol. stock»). */
  devueltos: number;
  /**
   * Entregadas y no pagadas, en unidades (no en plata). Llega del servidor ya proporcional al saldo y redondeado hacia
   * arriba (una venta de 3 libros cobrada a la mitad cuenta 2; sin saldo, 0; decisión de Cristian, 27/10, «Por cobrar»):
   * el panel muestra el número tal cual, no recalcula nada.
   */
  porCobrar: number;
}

export interface ColportorDeStock {
  id: string;
  nombre: string;
  /** `null` si no tiene zona asignada. */
  ciudadId: string | null;
  /**
   * Cuándo el servidor recibió el último dato de su teléfono (marca de tiempo ISO; `ultimo_dato_at` de la RPC): la vista
   * la muestra como «Sincronizó el 22/10 a las 18:30» para que nadie tome por de hoy una cifra vieja (decisión de Cristian
   * del 25/10, «Fecha stock»). `null` = todavía no llegó ninguno.
   */
  ultimoDatoAt: string | null;
  existencias: ExistenciaDeStock[];
}

export interface DatosDeStock {
  campaniaId: string;
  ciudades: CiudadDeStock[];
  /** El catálogo de la campaña, en el orden en que se muestra dentro de cada tipo. */
  productos: ProductoDeStock[];
  colportores: ColportorDeStock[];
}

export interface FuenteDatosStock {
  /** `null` cuando el coordinador no tiene una campaña en curso ni por empezar. */
  obtenerStock(): Promise<DatosDeStock | null>;
}
