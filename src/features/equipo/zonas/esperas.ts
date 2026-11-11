/**
 * Cuánto espera el panel antes de calcular una zona por esquinas (#182).
 *
 * `bordeMs`: desde la última esquina marcada o quitada hasta que se pide el borde por las calles (y, con la forma
 * cerrada, la vista previa). Mientras el coordinador sigue marcando esquinas, el cálculo no arranca: se hace uno solo,
 * con todas. Es un objeto y no una constante para que los tests no tengan que esperar (ver `vitest.setup.ts`).
 */
export const ESPERAS = { bordeMs: 900 };
