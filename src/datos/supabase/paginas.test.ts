import { describe, expect, it, vi } from "vitest";

import { ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import { FILAS_POR_PAGINA, llamarRpcPorPaginas } from "@/datos/supabase/paginas";
import { RespuestaInesperada } from "@/datos/supabase/respuesta";

const CAMPANIA = "11111111-1111-4111-8111-111111111111";

const fila = (n: number) => ({ id: n });
const filasDe = (cuantas: number) => Array.from({ length: cuantas }, (_, i) => fila(i));

/** Una base que pagina como la 0196: `p_limite` y `p_desplazamiento` sobre un orden fijo (y sin ellos, el corte de PostgREST en 1000). */
function baseCon(total: number, falla?: { enElDesplazamiento: number; error: Error }) {
  const todas = filasDe(total);
  const llamarRpc = vi.fn<(nombre: string, argumentos: Record<string, unknown>) => Promise<unknown>>(async (_nombre, argumentos) => {
    const limite = (argumentos.p_limite as number | null | undefined) ?? 1000;
    const desde = (argumentos.p_desplazamiento as number | undefined) ?? 0;
    if (falla && desde === falla.enElDesplazamiento) throw falla.error;
    return todas.slice(desde, desde + limite);
  });
  return { cliente: { llamarRpc } as unknown as ClienteRpc, llamarRpc };
}

describe("llamarRpcPorPaginas", () => {
  it("con menos de una página, hace una sola llamada con el límite y el desplazamiento 0", async () => {
    const { cliente, llamarRpc } = baseCon(3);

    expect(await llamarRpcPorPaginas(cliente, "ciudades_de_campania", { p_campania_id: CAMPANIA })).toEqual(filasDe(3));
    expect(llamarRpc).toHaveBeenCalledTimes(1);
    expect(llamarRpc).toHaveBeenCalledWith("ciudades_de_campania", { p_campania_id: CAMPANIA, p_limite: FILAS_POR_PAGINA, p_desplazamiento: 0 });
  });

  it("una lista vacía es una lista vacía", async () => {
    const { cliente, llamarRpc } = baseCon(0);

    expect(await llamarRpcPorPaginas(cliente, "ciudades_de_campania", { p_campania_id: CAMPANIA })).toEqual([]);
    expect(llamarRpc).toHaveBeenCalledTimes(1);
  });

  it("con más de 1000 filas pide la segunda página y arma la lista entera, en orden y sin repetir", async () => {
    const { cliente, llamarRpc } = baseCon(2500);

    const leidas = await llamarRpcPorPaginas(cliente, "historial_de_acompaniamientos", { p_campania_id: CAMPANIA, p_colportor_id: null });

    expect(leidas).toEqual(filasDe(2500));
    expect(llamarRpc.mock.calls.map(([, a]) => a.p_desplazamiento)).toEqual([0, 1000, 2000]);
    for (const [, argumentos] of llamarRpc.mock.calls) {
      expect(argumentos).toMatchObject({ p_campania_id: CAMPANIA, p_colportor_id: null, p_limite: 1000 });
    }
  });

  it("con exactamente 1000 filas pide una página más (puede haber más) y termina con la vacía", async () => {
    const { cliente, llamarRpc } = baseCon(1000);

    expect(await llamarRpcPorPaginas(cliente, "zonas_por_colportor", { p_campania_id: CAMPANIA })).toHaveLength(1000);
    expect(llamarRpc.mock.calls.map(([, a]) => a.p_desplazamiento)).toEqual([0, 1000]);
  });

  it("si falla una página a mitad de camino, la falla sale: nunca una lista parcial", async () => {
    const caida = new ErrorSupabase("Servicio no disponible", 503);
    const { cliente } = baseCon(2500, { enElDesplazamiento: 1000, error: caida });

    await expect(llamarRpcPorPaginas(cliente, "colportores_de_campania", { p_campania_id: CAMPANIA })).rejects.toBe(caida);
  });

  it("una página que no es una lista de filas es una respuesta inesperada, no una lista corta", async () => {
    const llamarRpc = vi.fn(async (_nombre: string, argumentos: Record<string, unknown>) => (argumentos.p_desplazamiento === 0 ? filasDe(1000) : { no: "es una lista" }));

    await expect(llamarRpcPorPaginas({ llamarRpc } as unknown as ClienteRpc, "becas_de_campania", { p_campania_id: CAMPANIA })).rejects.toBeInstanceOf(
      RespuestaInesperada,
    );
  });

  it("una RPC que nunca devuelve una página incompleta no deja la lectura colgada", async () => {
    const llamarRpc = vi.fn(async () => filasDe(1000));

    await expect(llamarRpcPorPaginas({ llamarRpc } as unknown as ClienteRpc, "becas_de_campania", { p_campania_id: CAMPANIA })).rejects.toBeInstanceOf(
      RespuestaInesperada,
    );
    expect(llamarRpc).toHaveBeenCalledTimes(200);
  });
});
