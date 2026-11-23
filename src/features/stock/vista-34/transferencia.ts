import type { DatosDeStock, TransferenciaPedida } from "@/datos/stock/contrato";
import { mensajeSinConexion } from "@/lib/mensajes";
import { conPuntosDeMiles } from "@/lib/texto";

/**
 * «Pedir transferencia de materiales» (vista 34, HU-STK-005; antes «Pedir prestado», decisión de Cristian del 28/10): lo que
 * valida el formulario antes de mandarlo y los textos. Todo puro. Lo que pide la base (`pedir_transferencia_de_stock`, 0139): dos
 * colportores distintos y una lista de productos con su cantidad (entera, mayor que cero), sin repetir producto. No hay texto
 * libre («motivo» no existe) y la base no mira el stock de quien da: lo mira al autorizar, con el de ese momento.
 *
 * El formulario no está dibujado en el canvas (la 42B solo dibuja el botón): lo resolvió el implementador con los componentes
 * de la 34 y de la 35 (precedente de Cristian del 10/11, #132). Ver el archivo de pendientes de la entrega.
 */

export const TITULO_DE_TRANSFERENCIA = "Pedir transferencia de materiales";
export const TEXTO_DE_TRANSFERENCIA =
  "Armás la transferencia entre dos colportores de la campaña. Queda por autorizar en Pedidos y transferencias: hasta que la autorices no se mueve ni el stock ni la deuda.";
export const TEXTO_SIN_CON_QUIEN_TRANSFERIR =
  "Para armar una transferencia hacen falta al menos dos colportores en la campaña y productos en el catálogo. Cuando los haya, podés pedirla desde acá.";
/** El mismo texto de la convención (§10) que cuando la red falla al enviar, más lo que pasa con lo cargado. */
export const TEXTO_TRANSFERENCIA_SIN_CONEXION = `${mensajeSinConexion("pedir la transferencia")} Lo que cargaste queda acá.`;
export const MAXIMO_POR_LINEA = 99_999;

/** Una fila del formulario: el producto elegido (vacío = sin elegir) y la cantidad como la escribió quien arma. */
export interface LineaDelFormulario {
  clave: number;
  productoId: string;
  cantidad: string;
}

export interface FormularioDeTransferencia {
  origenId: string;
  destinoId: string;
  lineas: LineaDelFormulario[];
}

export interface ErroresDelFormulario {
  origen: string | null;
  destino: string | null;
  /** Por la `clave` de cada línea. */
  lineas: Record<number, { producto: string | null; cantidad: string | null }>;
  /** Sin ninguna línea con algo cargado. */
  sinLineas: string | null;
}

export interface ValidacionDeTransferencia {
  errores: ErroresDelFormulario;
  hayErrores: boolean;
  /** Lo que se manda; `null` mientras haya errores. */
  pedido: TransferenciaPedida | null;
}

export const lineaVacia = (clave: number): LineaDelFormulario => ({ clave, productoId: "", cantidad: "" });

/** La cantidad escrita como entero mayor que cero, o `null` si no lo es (vacía, con decimales, negativa, con letras). */
export function cantidadEntera(texto: string): number | null {
  const limpio = texto.trim();
  if (!/^\d+$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function validarTransferencia(f: FormularioDeTransferencia): ValidacionDeTransferencia {
  const errores: ErroresDelFormulario = { origen: null, destino: null, lineas: {}, sinLineas: null };
  if (f.origenId === "") errores.origen = "Elegí quién da los libros.";
  if (f.destinoId === "") errores.destino = "Elegí quién los recibe.";
  else if (f.destinoId === f.origenId) errores.destino = "Tiene que ser otra persona: quien da y quien recibe no pueden ser la misma.";

  const cargadas = f.lineas.filter((l) => l.productoId !== "" || l.cantidad.trim() !== "");
  if (cargadas.length === 0) errores.sinLineas = "Sumá al menos un producto con su cantidad.";
  const vistos = new Set<string>();
  for (const l of cargadas) {
    const e = { producto: null as string | null, cantidad: null as string | null };
    if (l.productoId === "") e.producto = "Elegí el producto.";
    else if (vistos.has(l.productoId)) e.producto = "Ese producto ya está en la lista: sumale la cantidad a la otra fila.";
    else vistos.add(l.productoId);
    const n = cantidadEntera(l.cantidad);
    if (n === null) e.cantidad = "Poné una cantidad entera mayor que cero.";
    else if (n > MAXIMO_POR_LINEA) e.cantidad = `Es mucho: el máximo por producto es ${conPuntosDeMiles(String(MAXIMO_POR_LINEA))}.`;
    if (e.producto !== null || e.cantidad !== null) errores.lineas[l.clave] = e;
  }

  const hayErrores = errores.origen !== null || errores.destino !== null || errores.sinLineas !== null || Object.keys(errores.lineas).length > 0;
  return {
    errores,
    hayErrores,
    pedido: hayErrores
      ? null
      : {
          origenId: f.origenId,
          destinoId: f.destinoId,
          lineas: cargadas.map((l) => ({ productoId: l.productoId, cantidad: cantidadEntera(l.cantidad) as number })),
        },
  };
}

/** Cuánto tiene quien da de un producto (sumando por si el catálogo lo repite); `null` si todavía no eligió a alguno de los dos. */
export function cuantoTiene(datos: DatosDeStock, colportorId: string, productoId: string): number | null {
  if (colportorId === "" || productoId === "") return null;
  const colportor = datos.colportores.find((c) => c.id === colportorId);
  if (!colportor) return null;
  return colportor.existencias.filter((e) => e.productoId === productoId).reduce((suma, e) => suma + (Number.isFinite(e.tiene) && e.tiene > 0 ? Math.floor(e.tiene) : 0), 0);
}

export const textoDeLoQueTiene = (nombre: string, tiene: number) => `${nombre} tiene ${conPuntosDeMiles(String(tiene))}.`;

export const textoDePasaLoQueTiene = (nombre: string, tiene: number) =>
  `${nombre} tiene ${conPuntosDeMiles(String(tiene))}, menos de lo que pedís. Podés pedirla igual: al autorizarla se revisa el stock de ese momento.`;

/** El aviso con el que queda la vista después de armarla: qué quedó hecho y qué falta. */
export function textoDeTransferenciaArmada(numero: string, origen: string, destino: string, unidades: number): string {
  return `Armaste la transferencia ${numero}: ${origen} le da ${unidades === 1 ? "1 unidad" : `${conPuntosDeMiles(String(unidades))} unidades`} a ${destino}. Queda por autorizar en Pedidos y transferencias.`;
}
