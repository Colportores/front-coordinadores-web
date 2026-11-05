import { vi } from "vitest";

/**
 * Fija TODOS los flags del panel para un test (los no indicados quedan sin
 * definir), así el resultado no depende del entorno donde corre.
 */
export function fijarFlags({ modoDev, stock, cuentas }: { modoDev: boolean; stock?: boolean; cuentas?: boolean }) {
  const valor = (v: boolean | undefined) => (v === undefined ? undefined : v ? "1" : "0");
  vi.stubEnv("NEXT_PUBLIC_MODO_DEV", valor(modoDev));
  vi.stubEnv("NEXT_PUBLIC_PESTANA_STOCK", valor(stock));
  vi.stubEnv("NEXT_PUBLIC_PESTANA_CUENTAS", valor(cuentas));
}
