import {
  cifraDeDias,
  porCobrarDe,
  serieDeColportor,
  serieSuma,
  tendenciaDe,
  tendenciaEnPuntos,
  type Agregar,
  type Cifra,
  type DiasDeColportor,
  type Medida,
  type MedidaMostrada,
  type Tendencia,
} from "./calculo";

/**
 * Las cifras de la vista 32 (HU-REP-001 y HU-REP-002): cuáles son, cómo se llaman en la tabla y en las tarjetas, y
 * cómo se juntan los días de uno o de varios colportores en la cifra de un período.
 */

/**
 * El % por cobrar es V2: depende de los cobros y de Cuentas (HU-COB-005 y HU-CTA-005) y se conecta después del 20/11
 * (plan-sprints §5). Hasta entonces la tarjeta y la columna no se muestran. Al conectarlo, cambiar esta línea.
 */
export const MOSTRAR_POR_COBRAR = false;

export interface DefinicionDeCifra {
  clave: MedidaMostrada;
  /** Encabezado de la columna de la tabla. */
  columna: string;
  /** Nombre en la tarjeta (en mayúsculas) y en la frase que describe el gráfico; `null` si no tiene tarjeta (el monto va con las ventas). */
  tarjeta: { etiqueta: string; nombre: string } | null;
  /** Cómo se nombra en la descripción de la tabla. */
  nombre: string;
}

const TODAS_LAS_CIFRAS: DefinicionDeCifra[] = [
  { clave: "horas", columna: "HORAS", tarjeta: { etiqueta: "HORAS", nombre: "Horas" }, nombre: "horas" },
  { clave: "presentaciones", columna: "PRESENTACIONES", tarjeta: { etiqueta: "PRESENTACIONES", nombre: "Presentaciones" }, nombre: "presentaciones" },
  { clave: "ventas", columna: "VENTAS", tarjeta: { etiqueta: "VENTAS", nombre: "Ventas" }, nombre: "ventas" },
  { clave: "monto", columna: "MONTO", tarjeta: null, nombre: "monto" },
  { clave: "porCobrar", columna: "% POR COBRAR", tarjeta: { etiqueta: "% POR COBRAR", nombre: "% por cobrar" }, nombre: "% por cobrar" },
];

/** Las cifras que la vista muestra, en el orden del diseño. */
export function cifrasVisibles(porCobrar: boolean): DefinicionDeCifra[] {
  return TODAS_LAS_CIFRAS.filter((c) => c.clave !== "porCobrar" || porCobrar);
}

/** «horas», «horas y presentaciones», «horas, presentaciones y ventas». */
export function listarNombres(cifras: DefinicionDeCifra[]): string {
  const nombres = cifras.map((c) => c.nombre);
  if (nombres.length <= 1) return nombres.join("");
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/** Cómo se junta la cifra de un conjunto de días, para cada cifra que se muestra. */
export type Agregadores = Record<MedidaMostrada, Agregar>;

/** Los agregadores de un colportor, o de varios juntos (la suma de lo que cada uno tenga en cada día). */
export function agregadoresDe(colportores: DiasDeColportor[]): Agregadores {
  const suma = (medida: Medida): Agregar => {
    const serie = serieSuma(colportores.map((c) => serieDeColportor(c, medida)));
    return (dias) => cifraDeDias(serie, dias);
  };
  const monto = suma("monto");
  const cobrado = suma("cobrado");
  return {
    horas: suma("horas"),
    presentaciones: suma("presentaciones"),
    ventas: suma("ventas"),
    monto,
    // No es una suma de días: se calcula con el monto y lo cobrado de todo el período.
    porCobrar: (dias) => porCobrarDe(monto(dias), cobrado(dias)),
  };
}

/** Tendencia de una cifra contra el período anterior: en porcentaje, salvo el % por cobrar, que se dice en puntos. */
export function tendenciaDeCifra(clave: MedidaMostrada, actual: Cifra, base: Cifra | null): Tendencia | null {
  return clave === "porCobrar" ? tendenciaEnPuntos(actual, base) : tendenciaDe(actual, base);
}
