import { describe, expect, it, vi } from "vitest";

import { quitarMarcaDeRecuperacion } from "@/auth/recuperacion-servidor";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: () => {
      throw new Error("Cookies can only be modified in a Server Action or Route Handler.");
    },
  }),
}));

describe("quitarMarcaDeRecuperacion", () => {
  it("en un componente de servidor (cookies de solo lectura) no rompe: la marca vence sola", async () => {
    await expect(quitarMarcaDeRecuperacion()).resolves.toBeUndefined();
  });
});
