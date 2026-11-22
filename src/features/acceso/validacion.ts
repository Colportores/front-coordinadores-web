/**
 * La validación de los campos del login del panel (issue #177), antes de mandar nada al servidor. Es la misma regla que el
 * login del celular (HU-AUTH-003, que remite a HU-AUTH-001), para que el panel no rechace un correo que el servidor acepta ni
 * mande uno que el servidor rechazaría igual:
 *
 * - **Correo** (regla «Formato del correo» de HU-AUTH-001, la del `ValidadorEmail` del celular): antes de la `@`, letras sin
 *   tilde, números y ``.!#$%&'*+/=?^_`{|}~-``; después, etiquetas separadas por punto, de letras, números y guion (sin empezar
 *   ni terminar en guion, de hasta 63 caracteres); una sola `@`, un punto en el dominio, una terminación de 2 o más caracteres
 *   y 254 caracteres como máximo. Se valida ya normalizado (`normalizarCorreo`).
 * - **Contraseña**: el largo mínimo de la política vigente (Supuesto S1 de HU-AUTH, confirmado: 8 caracteres visibles, un
 *   emoji vale 1; es también el `minimum_password_length = 8` de `backend-supabase/supabase/config.toml`). El login solo mira
 *   el largo: la mayúscula y el número los exige el registro, y acá una contraseña más corta que el mínimo no puede ser la de
 *   ninguna cuenta.
 */

/** El largo mínimo de una contraseña en todo el sistema: HU-AUTH, Supuesto S1 (confirmado) y `minimum_password_length`. */
export const LARGO_MINIMO_CONTRASENA = 8;

/** El tope del correo (RFC 5321), el mismo del campo y del servidor. */
export const LARGO_MAXIMO_CORREO = 254;

/**
 * Los caracteres de formato de Unicode (categoría Cf): el espacio de ancho cero, las marcas de dirección, el guion blando, el
 * `U+FEFF`… Se cuelan al pegar un correo desde WhatsApp o Gmail y la persona no los ve.
 */
const INVISIBLES = /\p{Cf}/gu;

/** Todo lo que puede aparecer en una dirección: lo de antes de la `@`, la `@` y lo de después. */
const CARACTERES_DE_UN_CORREO = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~@-]*$/;

/** Una etiqueta del dominio (HTML5): letras o números en las puntas, guiones solo adentro, hasta 63 caracteres. */
const ETIQUETA = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

/**
 * El correo como se valida y se manda: sin los caracteres invisibles, sin espacios alrededor y en minúsculas (el servidor lo
 * guarda así). Si lo único que había eran espacios o invisibles, queda vacío.
 */
export function normalizarCorreo(correo: string): string {
  return correo.replace(INVISIBLES, "").trim().toLowerCase();
}

export type ProblemaDeCorreo =
  /** Lleva un carácter que el servidor no acepta en ningún lugar: tilde, ñ, espacio, coma, comillas, emoji… */
  | "caracter-no-permitido"
  /** Los caracteres van, pero la dirección está incompleta o mal armada: falta la `@`, el dominio o la terminación, hay un `..`. */
  | "incompleto";

/** Qué le pasa a `correo` (ya normalizado y no vacío), o `null` si pasa. */
export function problemaDeCorreo(correo: string): ProblemaDeCorreo | null {
  if (!CARACTERES_DE_UN_CORREO.test(correo)) return "caracter-no-permitido";
  if (correo.length > LARGO_MAXIMO_CORREO) return "incompleto";

  const arroba = correo.indexOf("@");
  if (arroba <= 0 || arroba !== correo.lastIndexOf("@")) return "incompleto";

  // Un punto en el dominio, etiquetas bien armadas (una vacía es un `..` o un punto de más) y una terminación de 2 o más.
  const etiquetas = correo.slice(arroba + 1).split(".");
  if (etiquetas.length < 2 || !etiquetas.every((etiqueta) => ETIQUETA.test(etiqueta))) return "incompleto";
  if ((etiquetas[etiquetas.length - 1] ?? "").length < 2) return "incompleto";

  return null;
}

/** Los caracteres que la persona ve: un emoji o una letra con tilde valen 1, se escriban como se escriban. */
export function largoVisible(texto: string): number {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(texto)).length;
  }
  // Sin `Intl.Segmenter` (navegadores viejos): por puntos de código, que es lo más cercano.
  return Array.from(texto).length;
}

/** Si la contraseña no llega al largo mínimo. No dice nada de si es la correcta. */
export function contrasenaCorta(contrasena: string): boolean {
  // Con 8 unidades o más todavía puede haber menos de 8 visibles (un emoji ocupa 2 o más); con menos, seguro que no llega.
  return contrasena.length < LARGO_MINIMO_CONTRASENA || largoVisible(contrasena) < LARGO_MINIMO_CONTRASENA;
}
