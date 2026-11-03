import type { BecaDeColportor, CarreraDelCatalogo, TipoDeBeca } from "./contrato";

/**
 * Lo que un colportor ya alcanzó de su beca (HU-BEC-002, HU-BEC-006). La beca se alcanza cuando la compra de bonificables a la
 * CES llega al monto de la meta («Beca alcanz.», Cristian 28/10; cierra S67): los libros son otra forma de ver el avance, no
 * deciden el estado. Es lo mismo en el panel y en la fuente simulada:
 * la meta que se alcanza no se quita al cambiar el tipo («Logro beca», decisión de Cristian del 27/10).
 */

const RANGO: Record<TipoDeBeca, number> = { media: 1, completa: 2 };

/** La mayor de dos metas alcanzadas; `null` es ninguna. */
export function mayorLogro(a: TipoDeBeca | null | undefined, b: TipoDeBeca | null | undefined): TipoDeBeca | null {
  const rangoA = a ? RANGO[a] : 0;
  const rangoB = b ? RANGO[b] : 0;
  if (rangoA === 0 && rangoB === 0) return null;
  return rangoA >= rangoB ? (a ?? null) : (b ?? null);
}

/**
 * La meta en compra a la CES (solo productos bonificables) del tipo dado, o `null` si no se puede medir (sin cargar o en 0).
 */
export function metaEnMonto(beca: BecaDeColportor, carrera: CarreraDelCatalogo | undefined, tipo: TipoDeBeca): number | null {
  const delCatalogo = tipo === "media" ? carrera?.metaMedia : carrera?.metaCompleta;
  // Si la carrera ya no está en el catálogo, la meta que se copió al asignar el tipo sigue valiendo para su propio tipo.
  const monto = delCatalogo?.monto ?? (beca.apuntaA === tipo ? beca.meta?.monto : undefined);
  return monto !== undefined && monto > 0 ? monto : null;
}

/**
 * La mayor meta que alcanzó: la que marcó el servidor (`alcanzada`, que sigue aunque el tipo pase a «Sin beca») o la que
 * sale de comparar la compra a la CES de bonificables con el monto de las metas de su carrera, esto último solo si apunta a algún tipo. Sin tipo asignado
 * y sin nada marcado no hay logro: nadie alcanza una beca que nunca se le asignó.
 */
export function logroDeBeca(beca: BecaDeColportor, carreras: readonly CarreraDelCatalogo[]): TipoDeBeca | null {
  if (!beca.carrera) return null;
  let calculado: TipoDeBeca | null = null;
  if (beca.apuntaA !== null) {
    const carrera = carreras.find((c) => c.id === beca.carrera?.id);
    const completa = metaEnMonto(beca, carrera, "completa");
    const media = metaEnMonto(beca, carrera, "media");
    if (completa !== null && beca.avance.monto >= completa) calculado = "completa";
    else if (media !== null && beca.avance.monto >= media) calculado = "media";
  }
  return mayorLogro(beca.alcanzada, calculado);
}
