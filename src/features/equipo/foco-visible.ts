/**
 * ¿El foco de ese elemento es de teclado o de lector (el navegador lo marca como `:focus-visible`)? Un clic del mouse
 * que lleva el foco por código no lo es: ahí la persona no necesita más tiempo para llegar al botón. Si el navegador no
 * entiende el selector (muy viejo), se da por sí: ante la duda, el plazo espera (WCAG 2.2.1).
 */
export function tieneFocoVisible(elemento: Element): boolean {
  try {
    return elemento.matches(":focus-visible");
  } catch {
    return true;
  }
}
