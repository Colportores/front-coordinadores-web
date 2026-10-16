import { afterEach, describe, expect, it, vi } from "vitest";

import {
  esperarTrabajoPendiente,
  type FuenteDeTrabajo,
  hayTrabajoPendiente,
  MS_TOPE_ESPERA,
  registrarEnvio,
  registrarFuente,
  trabajoCambio,
} from "@/shell/trabajo-pendiente";

function cerrarPestana(): boolean {
  const evento = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(evento);
  return evento.defaultPrevented;
}

/** Una fuente con una lista de cosas por mandar: `confirmar` las manda y contesta cuando se le dice. */
function fuenteCon(pendientes: { n: number }, confirmar: () => Promise<boolean>): FuenteDeTrabajo {
  return { hayPendiente: () => pendientes.n > 0, confirmar };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("trabajo pendiente de la pestaña", () => {
  it("sin nada registrado no hay trabajo, no frena el cierre de la pestaña y esperar contesta al toque", async () => {
    expect(hayTrabajoPendiente()).toBe(false);
    expect(cerrarPestana()).toBe(false);
    await expect(esperarTrabajoPendiente()).resolves.toBe(true);
  });

  it("una fuente con algo pendiente hace que haya trabajo y que cerrar la pestaña pregunte; al darla de baja o vaciarla, deja de hacerlo", () => {
    const pendientes = { n: 1 };
    const baja = registrarFuente(fuenteCon(pendientes, async () => true));
    expect(hayTrabajoPendiente()).toBe(true);
    expect(cerrarPestana()).toBe(true);

    pendientes.n = 0;
    trabajoCambio();
    expect(hayTrabajoPendiente()).toBe(false);
    expect(cerrarPestana()).toBe(false);

    pendientes.n = 2;
    trabajoCambio();
    expect(cerrarPestana()).toBe(true);
    baja();
    expect(hayTrabajoPendiente()).toBe(false);
    expect(cerrarPestana()).toBe(false);
  });

  it("avisar el cambio muchas veces no suma oyentes de «beforeunload»", () => {
    const agregar = vi.spyOn(window, "addEventListener");
    const quitar = vi.spyOn(window, "removeEventListener");
    const pendientes = { n: 1 };
    const baja = registrarFuente(fuenteCon(pendientes, async () => true));
    trabajoCambio();
    trabajoCambio();
    trabajoCambio();

    expect(agregar.mock.calls.filter(([tipo]) => tipo === "beforeunload")).toHaveLength(1);

    baja();
    trabajoCambio();
    expect(quitar.mock.calls.filter(([tipo]) => tipo === "beforeunload")).toHaveLength(1);
  });

  it("esperar manda lo de cada fuente y devuelve si todo salió bien", async () => {
    const a = { n: 1 };
    const b = { n: 1 };
    const confirmarA = vi.fn(async () => {
      a.n = 0;
      return true;
    });
    const confirmarB = vi.fn(async () => {
      b.n = 0;
      return true;
    });
    registrarFuente(fuenteCon(a, confirmarA));
    registrarFuente(fuenteCon(b, confirmarB));

    await expect(esperarTrabajoPendiente()).resolves.toBe(true);

    expect(confirmarA).toHaveBeenCalledTimes(1);
    expect(confirmarB).toHaveBeenCalledTimes(1);
  });

  it("si una fuente falla, espera igual a las demás y devuelve false", async () => {
    const a = { n: 1 };
    const b = { n: 1 };
    let contestarB: (ok: boolean) => void = () => undefined;
    registrarFuente(fuenteCon(a, async () => false));
    registrarFuente(fuenteCon(b, () => new Promise<boolean>((resolver) => (contestarB = resolver))));

    let resultado: boolean | null = null;
    void esperarTrabajoPendiente().then((ok) => (resultado = ok));
    await Promise.resolve();
    await Promise.resolve();
    expect(resultado).toBeNull();

    contestarB(true);
    await vi.waitFor(() => expect(resultado).toBe(false));
  });

  it("un envío sin contestar cuenta como trabajo aunque ninguna vista lo tenga: sigue frenando el cierre y se espera", async () => {
    let contestar: () => void = () => undefined;
    registrarEnvio(new Promise<boolean>((resolver) => (contestar = () => resolver(true))));
    expect(hayTrabajoPendiente()).toBe(true);
    expect(cerrarPestana()).toBe(true);

    let listo = false;
    void esperarTrabajoPendiente().then(() => (listo = true));
    await Promise.resolve();
    await Promise.resolve();
    expect(listo).toBe(false);

    contestar();
    await vi.waitFor(() => expect(listo).toBe(true));
    expect(hayTrabajoPendiente()).toBe(false);
    expect(cerrarPestana()).toBe(false);
  });

  it("un envío que se cae también deja de contar", async () => {
    let caer: (e: Error) => void = () => undefined;
    registrarEnvio(new Promise<boolean>((_, rechazar) => (caer = rechazar)));
    expect(cerrarPestana()).toBe(true);

    caer(new Error("sin red"));

    await vi.waitFor(() => expect(hayTrabajoPendiente()).toBe(false));
    expect(cerrarPestana()).toBe(false);
  });

  it(`si el servidor no contesta, a los ${MS_TOPE_ESPERA / 1000} s deja salir igual (true)`, async () => {
    vi.useFakeTimers();
    const pendientes = { n: 1 };
    registrarFuente(fuenteCon(pendientes, () => new Promise<boolean>(() => undefined)));
    let resultado: boolean | null = null;
    void esperarTrabajoPendiente().then((ok) => (resultado = ok));

    await vi.advanceTimersByTimeAsync(MS_TOPE_ESPERA - 1);
    expect(resultado).toBeNull();

    await vi.advanceTimersByTimeAsync(1);
    expect(resultado).toBe(true);
  });

  it("si contestan antes, el tope se cancela y no queda ningún temporizador", async () => {
    vi.useFakeTimers();
    const antes = vi.getTimerCount();
    const pendientes = { n: 1 };
    registrarFuente(
      fuenteCon(pendientes, async () => {
        pendientes.n = 0;
        return true;
      }),
    );

    await esperarTrabajoPendiente();

    expect(vi.getTimerCount()).toBe(antes);
  });

  it("lo que se añade mientras se espera también se espera", async () => {
    const pendientes = { n: 1 };
    const rondas: number[] = [];
    registrarFuente(
      fuenteCon(pendientes, async () => {
        rondas.push(pendientes.n);
        // Mientras se espera la primera ronda aparece otra cosa por mandar.
        pendientes.n = rondas.length === 1 ? 1 : 0;
        return true;
      }),
    );

    await expect(esperarTrabajoPendiente()).resolves.toBe(true);

    expect(rondas).toEqual([1, 1]);
  });

  it("una fuente que nunca se vacía no cuelga la espera: se corta tras unas vueltas", async () => {
    const pendientes = { n: 1 };
    const confirmar = vi.fn(async () => true);
    registrarFuente(fuenteCon(pendientes, confirmar));

    await expect(esperarTrabajoPendiente()).resolves.toBe(true);

    expect(confirmar.mock.calls.length).toBeGreaterThan(1);
    expect(confirmar.mock.calls.length).toBeLessThanOrEqual(5);
  });
});
