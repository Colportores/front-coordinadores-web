import { describe, expect, it, vi } from "vitest";

import { fuenteDeSesion } from "@/datos/supabase/fuente-de-sesion";
import type { ClienteRpc } from "@/datos/supabase/cliente";

const sesion = vi.hoisted(() => ({ clientes: [] as unknown[], falla: false }));

vi.mock("@/auth/supabase-servidor", () => ({
  clienteRpcDeSesion: vi.fn(async () => {
    if (sesion.falla) throw new Error("sin configuración");
    const cliente = { llamarRpc: vi.fn(async (nombre: string) => `respuesta de ${nombre}`) };
    sesion.clientes.push(cliente);
    return cliente;
  }),
}));

interface Fuente {
  pedir(nombre: string): Promise<string>;
  sumar(a: number, b: number): Promise<number>;
}

const crear = (cliente: ClienteRpc): Fuente => ({
  pedir: (nombre) => cliente.llamarRpc<string>(nombre, {}),
  sumar: async (a, b) => a + b,
});

describe("fuenteDeSesion", () => {
  it("en cada llamada arma la fuente con el cliente de la sesión de ese pedido", async () => {
    sesion.clientes.length = 0;
    const fuente = fuenteDeSesion(crear);

    expect(await fuente.pedir("mi_perfil")).toBe("respuesta de mi_perfil");
    expect(await fuente.sumar(2, 3)).toBe(5);
    expect(await fuente.pedir("otra")).toBe("respuesta de otra");

    // Un cliente por llamada: la sesión es del pedido, no del módulo.
    expect(sesion.clientes).toHaveLength(3);
  });

  it("no es una promesa ni un iterable: await sobre la fachada devuelve la fachada", async () => {
    const fuente = fuenteDeSesion(crear);
    expect(await Promise.resolve(fuente)).toBe(fuente);
    expect((fuente as unknown as { then?: unknown }).then).toBeUndefined();
  });

  it("si no se puede armar el cliente, la llamada falla (y no devuelve datos de ejemplo)", async () => {
    sesion.falla = true;
    try {
      await expect(fuenteDeSesion(crear).pedir("x")).rejects.toThrow("sin configuración");
    } finally {
      sesion.falla = false;
    }
  });

  it("un método que la fuente no tiene es un error claro", async () => {
    const fuente = fuenteDeSesion(crear) as unknown as { noExiste(): Promise<void> };
    await expect(fuente.noExiste()).rejects.toThrow(/noExiste/);
  });
});
