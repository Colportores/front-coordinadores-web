import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  esperarTrabajoPendiente,
  esperarYSalir,
  estaEsperando,
  type FuenteDeTrabajo,
  fueAbandonado,
  hayQueEsperar,
  hayTrabajoPendiente,
  MS_TOPE_ESPERA,
  registrarEnvio,
  registrarFuente,
  reiniciarTrabajoPendiente,
  trabajoCambio,
  ubicacionActual,
  useEsperandoTrabajo,
} from "@/shell/trabajo-pendiente";

function cerrarPestana(): boolean {
  const evento = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(evento);
  return evento.defaultPrevented;
}

/** Una fuente con una lista de cosas por mandar: `confirmar` las manda y contesta cuando se le dice. */
function fuenteCon(pendientes: { n: number }, confirmar: () => Promise<boolean>): FuenteDeTrabajo {
  return { hayPorMandar: () => pendientes.n > 0, confirmar };
}

/** Deja correr las promesas que quedaron listas, sin mover el reloj. */
async function dejarCorrer() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
});

describe("trabajo pendiente de la pestaña", () => {
  it("sin nada registrado no hay trabajo, no frena el cierre de la pestaña y esperar contesta al toque, sin mostrar espera", async () => {
    expect(hayTrabajoPendiente()).toBe(false);
    expect(hayQueEsperar()).toBe(false);
    expect(cerrarPestana()).toBe(false);

    const espera = esperarTrabajoPendiente();

    expect(estaEsperando()).toBe(false);
    await expect(espera).resolves.toBe("listo");
  });

  it("una fuente con algo por mandar hace que haya trabajo y que cerrar la pestaña pregunte; al darla de baja o vaciarla, deja de hacerlo", () => {
    const pendientes = { n: 1 };
    const baja = registrarFuente(fuenteCon(pendientes, async () => true));
    expect(hayTrabajoPendiente()).toBe(true);
    expect(hayQueEsperar()).toBe(true);
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

  it("esperar manda lo de cada fuente y devuelve «listo» si todo salió bien", async () => {
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

    await expect(esperarTrabajoPendiente()).resolves.toBe("listo");

    expect(confirmarA).toHaveBeenCalledTimes(1);
    expect(confirmarB).toHaveBeenCalledTimes(1);
  });

  it("si una fuente falla, espera igual a las demás y devuelve «fallo»", async () => {
    const a = { n: 1 };
    const b = { n: 1 };
    let contestarB: (ok: boolean) => void = () => undefined;
    registrarFuente(fuenteCon(a, async () => false));
    registrarFuente(fuenteCon(b, () => new Promise<boolean>((resolver) => (contestarB = resolver))));

    let resultado: string | null = null;
    void esperarTrabajoPendiente().then((salida) => (resultado = salida));
    await dejarCorrer();
    expect(resultado).toBeNull();

    contestarB(true);
    await vi.waitFor(() => expect(resultado).toBe("fallo"));
  });

  it("un envío sin contestar cuenta como trabajo aunque ninguna vista lo tenga: sigue frenando el cierre y se espera", async () => {
    let contestar: () => void = () => undefined;
    registrarEnvio(new Promise<boolean>((resolver) => (contestar = () => resolver(true))));
    expect(hayTrabajoPendiente()).toBe(true);
    expect(hayQueEsperar()).toBe(true);
    expect(cerrarPestana()).toBe(true);

    let listo = false;
    void esperarTrabajoPendiente().then(() => (listo = true));
    await dejarCorrer();
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

  it("el tope de espera es de 10 s", () => {
    expect(MS_TOPE_ESPERA).toBe(10_000);
  });

  it("si el servidor no contesta, a los 10 s justos deja salir igual («listo») y no antes", async () => {
    vi.useFakeTimers();
    const pendientes = { n: 1 };
    registrarFuente(fuenteCon(pendientes, () => new Promise<boolean>(() => undefined)));
    let resultado: string | null = null;
    void esperarTrabajoPendiente().then((salida) => (resultado = salida));

    await vi.advanceTimersByTimeAsync(9_999);
    expect(resultado).toBeNull();
    expect(estaEsperando()).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    expect(resultado).toBe("listo");
    expect(estaEsperando()).toBe(false);
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

    await expect(esperarTrabajoPendiente()).resolves.toBe("listo");

    expect(rondas).toEqual([1, 1]);
  });

  it("una fuente que nunca se vacía no cuelga la espera: se corta a las 5 vueltas, ni una más ni una menos", async () => {
    const pendientes = { n: 1 };
    const confirmar = vi.fn(async () => true);
    registrarFuente(fuenteCon(pendientes, confirmar));

    await expect(esperarTrabajoPendiente()).resolves.toBe("listo");

    expect(confirmar).toHaveBeenCalledTimes(5);
  });
});

describe("una sola espera a la vez, con su estado", () => {
  it("mientras una espera está en marcha, otra se ignora («ocupado») sin mandar nada de nuevo; al terminar, se puede otra", async () => {
    const pendientes = { n: 1 };
    let contestar: () => void = () => undefined;
    const confirmar = vi.fn(
      () =>
        new Promise<boolean>((resolver) => {
          contestar = () => {
            pendientes.n = 0;
            resolver(true);
          };
        }),
    );
    registrarFuente(fuenteCon(pendientes, confirmar));

    const primera = esperarTrabajoPendiente();
    await dejarCorrer();
    expect(estaEsperando()).toBe(true);
    await expect(esperarTrabajoPendiente()).resolves.toBe("ocupado");
    expect(confirmar).toHaveBeenCalledTimes(1);

    contestar();
    await expect(primera).resolves.toBe("listo");
    expect(estaEsperando()).toBe(false);

    pendientes.n = 1;
    const segunda = esperarTrabajoPendiente();
    await dejarCorrer();
    expect(confirmar).toHaveBeenCalledTimes(2);
    contestar();
    await expect(segunda).resolves.toBe("listo");
  });

  it("el estado de espera se apaga también cuando algo falla", async () => {
    const pendientes = { n: 1 };
    registrarFuente(fuenteCon(pendientes, async () => false));

    await expect(esperarTrabajoPendiente()).resolves.toBe("fallo");

    expect(estaEsperando()).toBe(false);
  });

  it("quien mira el estado (el menú) se entera de cuándo empieza y cuándo termina, venga de donde venga la espera", async () => {
    const pendientes = { n: 1 };
    let contestar: () => void = () => undefined;
    registrarFuente(
      fuenteCon(
        pendientes,
        () =>
          new Promise<boolean>((resolver) => {
            contestar = () => {
              pendientes.n = 0;
              resolver(true);
            };
          }),
      ),
    );
    const { result } = renderHook(() => useEsperandoTrabajo());
    expect(result.current).toBe(false);

    const espera = esperarTrabajoPendiente();
    await vi.waitFor(() => expect(result.current).toBe(true));

    contestar();
    await espera;
    await vi.waitFor(() => expect(result.current).toBe(false));
  });

  it("un reinicio (solo de los tests) deja sin efecto a las esperas que quedaron colgadas: no apagan la espera siguiente", async () => {
    vi.useFakeTimers();
    registrarFuente(fuenteCon({ n: 1 }, () => new Promise<boolean>(() => undefined)));
    void esperarTrabajoPendiente();
    await vi.advanceTimersByTimeAsync(5_000);

    reiniciarTrabajoPendiente();
    registrarFuente(fuenteCon({ n: 1 }, () => new Promise<boolean>(() => undefined)));
    void esperarTrabajoPendiente();
    expect(estaEsperando()).toBe(true);

    await vi.advanceTimersByTimeAsync(5_000); // vence el tope de la espera vieja
    expect(estaEsperando()).toBe(true);

    await vi.advanceTimersByTimeAsync(5_000); // vence el de la nueva
    expect(estaEsperando()).toBe(false);
  });

  it("ni abandonan los envíos de después del reinicio cuando vence su tope", async () => {
    vi.useFakeTimers();
    registrarFuente(fuenteCon({ n: 1 }, () => new Promise<boolean>(() => undefined)));
    void esperarTrabajoPendiente();
    await vi.advanceTimersByTimeAsync(5_000);

    reiniciarTrabajoPendiente();
    const nuevo = new Promise<boolean>(() => undefined);
    registrarEnvio(nuevo);
    await vi.advanceTimersByTimeAsync(5_000); // vence el tope de la espera vieja

    expect(fueAbandonado(nuevo)).toBe(false);
    expect(hayQueEsperar()).toBe(true);
  });
});

describe("la espera que ya venció", () => {
  it("no sigue mandando lo que se anota después, cuando el servidor por fin contesta", async () => {
    vi.useFakeTimers();
    let destrabar: () => void = () => undefined;
    const vieja = { n: 1 };
    registrarFuente(
      fuenteCon(
        vieja,
        () =>
          new Promise<boolean>((resolver) => {
            destrabar = () => {
              vieja.n = 0;
              resolver(true);
            };
          }),
      ),
    );
    let salida: string | null = null;
    void esperarTrabajoPendiente().then((s) => (salida = s));
    await vi.advanceTimersByTimeAsync(MS_TOPE_ESPERA);
    expect(salida).toBe("listo"); // el menú ya dejó salir

    // Se vuelve a la vista y se añade a alguien: esa cuenta tiene su «Deshacer» completo.
    const nueva = { n: 1 };
    const confirmarNueva = vi.fn(async () => {
      nueva.n = 0;
      return true;
    });
    registrarFuente(fuenteCon(nueva, confirmarNueva));

    destrabar(); // el servidor contesta tarde
    await vi.advanceTimersByTimeAsync(0);

    expect(confirmarNueva).not.toHaveBeenCalled();
  });

  it("deja de esperar los envíos colgados: ninguna espera nueva los espera, pero siguen frenando el cierre de la pestaña", async () => {
    vi.useFakeTimers();
    let contestar: () => void = () => undefined;
    const colgado = new Promise<boolean>((resolver) => (contestar = () => resolver(true)));
    registrarEnvio(colgado);
    let salida: string | null = null;
    void esperarTrabajoPendiente().then((s) => (salida = s));
    await vi.advanceTimersByTimeAsync(MS_TOPE_ESPERA);
    expect(salida).toBe("listo");

    expect(fueAbandonado(colgado)).toBe(true);
    expect(hayQueEsperar()).toBe(false);
    expect(hayTrabajoPendiente()).toBe(true);
    expect(cerrarPestana()).toBe(true);
    // Otra espera no tiene nada que esperar: contesta al toque, sin volver a mostrar «guardando» ni a gastar 10 s.
    await expect(esperarTrabajoPendiente()).resolves.toBe("listo");
    expect(estaEsperando()).toBe(false);

    contestar();
    await vi.advanceTimersByTimeAsync(0);
    expect(hayTrabajoPendiente()).toBe(false);
    expect(fueAbandonado(colgado)).toBe(false);
    expect(cerrarPestana()).toBe(false);
  });

  it("un envío nuevo después del tope sí se espera, aunque haya uno colgado de antes", async () => {
    vi.useFakeTimers();
    registrarEnvio(new Promise<boolean>(() => undefined));
    void esperarTrabajoPendiente();
    await vi.advanceTimersByTimeAsync(MS_TOPE_ESPERA);

    let contestar: () => void = () => undefined;
    registrarEnvio(new Promise<boolean>((resolver) => (contestar = () => resolver(true))));
    expect(hayQueEsperar()).toBe(true);
    let salida: string | null = null;
    void esperarTrabajoPendiente().then((s) => (salida = s));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(salida).toBeNull();

    contestar();
    await vi.advanceTimersByTimeAsync(0);
    expect(salida).toBe("listo");
  });
});

describe("esperar y salir (no navegar si la persona ya se fue por su cuenta)", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "navigation");
    window.history.replaceState(null, "", "/");
  });

  function instalarNavegacion(clave: string | undefined) {
    const navegacion = { currentEntry: clave === undefined ? null : { key: clave } };
    Object.defineProperty(window, "navigation", { configurable: true, value: navegacion });
    return navegacion;
  }

  it("la ubicación es la clave de la entrada del historial si hay Navigation API, y si no, la ruta", () => {
    window.history.replaceState(null, "", "/equipo/anadir");
    expect(ubicacionActual()).toBe("ruta:/equipo/anadir");

    const navegacion = instalarNavegacion("clave-1");
    expect(ubicacionActual()).toBe("entrada:clave-1");

    navegacion.currentEntry = { key: "clave-2" };
    expect(ubicacionActual()).not.toBe("entrada:clave-1");

    // Sin entrada actual (o sin clave de texto) cae a la ruta.
    navegacion.currentEntry = null;
    expect(ubicacionActual()).toBe("ruta:/equipo/anadir");
  });

  it("sin nada que esperar, va ya", async () => {
    const irA = vi.fn();

    await expect(esperarYSalir(irA)).resolves.toBe("listo");

    expect(irA).toHaveBeenCalledTimes(1);
  });

  it("con trabajo, va recién cuando todo salió bien", async () => {
    const pendientes = { n: 1 };
    let contestar: (ok: boolean) => void = () => undefined;
    registrarFuente(
      fuenteCon(
        pendientes,
        () =>
          new Promise<boolean>((resolver) => {
            contestar = (ok) => {
              pendientes.n = 0;
              resolver(ok);
            };
          }),
      ),
    );
    const irA = vi.fn();
    const salida = esperarYSalir(irA);
    await dejarCorrer();
    expect(irA).not.toHaveBeenCalled();

    contestar(true);

    await expect(salida).resolves.toBe("listo");
    expect(irA).toHaveBeenCalledTimes(1);
  });

  it("si algo falla, no va y avisa «fallo»", async () => {
    const pendientes = { n: 1 };
    registrarFuente(fuenteCon(pendientes, async () => false));
    const irA = vi.fn();

    await expect(esperarYSalir(irA)).resolves.toBe("fallo");

    expect(irA).not.toHaveBeenCalled();
  });

  it("si ya había otra espera, no va y avisa «ocupado»", async () => {
    const pendientes = { n: 1 };
    registrarFuente(fuenteCon(pendientes, () => new Promise<boolean>(() => undefined)));
    vi.useFakeTimers();
    const primera = vi.fn();
    const segunda = vi.fn();
    void esperarYSalir(primera);

    await expect(esperarYSalir(segunda)).resolves.toBe("ocupado");

    expect(segunda).not.toHaveBeenCalled();
    expect(primera).not.toHaveBeenCalled();
  });

  it("si mientras espera la persona cambia de entrada del historial, no va (y la espera termina)", async () => {
    const navegacion = instalarNavegacion("clave-1");
    const pendientes = { n: 1 };
    let contestar: (ok: boolean) => void = () => undefined;
    registrarFuente(
      fuenteCon(
        pendientes,
        () =>
          new Promise<boolean>((resolver) => {
            contestar = (ok) => {
              pendientes.n = 0;
              resolver(ok);
            };
          }),
      ),
    );
    const irA = vi.fn();
    const salida = esperarYSalir(irA);
    await dejarCorrer();
    expect(estaEsperando()).toBe(true);

    navegacion.currentEntry = { key: "clave-2" };
    contestar(true);

    await expect(salida).resolves.toBe("listo");
    expect(irA).not.toHaveBeenCalled();
    expect(estaEsperando()).toBe(false);
  });

  it("sin Navigation API, si cambia la ruta mientras espera, tampoco va", async () => {
    window.history.replaceState(null, "", "/equipo/anadir");
    const pendientes = { n: 1 };
    let contestar: (ok: boolean) => void = () => undefined;
    registrarFuente(
      fuenteCon(
        pendientes,
        () =>
          new Promise<boolean>((resolver) => {
            contestar = (ok) => {
              pendientes.n = 0;
              resolver(ok);
            };
          }),
      ),
    );
    const irA = vi.fn();
    const salida = esperarYSalir(irA);
    await dejarCorrer();

    window.history.pushState(null, "", "/reportes");
    contestar(true);

    await salida;
    expect(irA).not.toHaveBeenCalled();
  });

  it("si vence el tope y la persona sigue donde estaba, va igual", async () => {
    vi.useFakeTimers();
    registrarEnvio(new Promise<boolean>(() => undefined));
    const irA = vi.fn();
    void esperarYSalir(irA);

    await vi.advanceTimersByTimeAsync(MS_TOPE_ESPERA);

    expect(irA).toHaveBeenCalledTimes(1);
  });

  it("si vence el tope pero ya se había ido por su cuenta, no va", async () => {
    vi.useFakeTimers();
    const navegacion = instalarNavegacion("clave-1");
    registrarEnvio(new Promise<boolean>(() => undefined));
    const irA = vi.fn();
    void esperarYSalir(irA);

    navegacion.currentEntry = { key: "clave-2" };
    await vi.advanceTimersByTimeAsync(MS_TOPE_ESPERA);

    expect(irA).not.toHaveBeenCalled();
  });
});
