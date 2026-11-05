import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { crearFetchDeAuth, TOPE_PEDIDO_AUTH_MS } from "@/datos/supabase/fetch-auth";

const BASE = "https://proyecto.supabase.co";

function crear(base: typeof fetch, haySesionGuardada: () => Promise<boolean> = async () => true) {
  return crearFetchDeAuth(base, { haySesionGuardada });
}

/** Un `fetch` que respeta la señal de aborto, como el del navegador. */
const fetchQueRespetaLaSenal = () =>
  vi.fn(
    (_entrada: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, rechazar) => {
        init?.signal?.addEventListener("abort", () => rechazar(init.signal?.reason));
      }),
  );

/** Lo que dio el pedido: la respuesta, o el error con el que se rechazó. */
const resultadoDe = (pedido: Promise<Response>) =>
  pedido.then(
    (respuesta) => respuesta,
    (error: unknown) => error,
  );

describe("crearFetchDeAuth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("pedidos que no son de Auth", () => {
    it("pasan tal cual, sin tope ni señal agregada", async () => {
      const base = vi.fn(async () => new Response("[]"));
      const init = { method: "POST", body: "{}" };

      await crear(base as unknown as typeof fetch)(`${BASE}/rest/v1/rpc/tiene_rol`, init);

      expect(base).toHaveBeenCalledWith(`${BASE}/rest/v1/rpc/tiene_rol`, init);
    });

    it("una RPC lenta no se corta a los 5 s", async () => {
      const lenta = new Promise<Response>((resolver) => setTimeout(() => resolver(new Response("[]")), 20_000));
      const pedido = crear((async () => lenta) as typeof fetch)(`${BASE}/rest/v1/rpc/buscar_candidatos`);

      await vi.advanceTimersByTimeAsync(20_000);

      expect((await pedido).status).toBe(200);
    });
  });

  describe("tope de los pedidos a Auth", () => {
    it(`un pedido que no contesta se rechaza a los ${TOPE_PEDIDO_AUTH_MS / 1000} s como una caída de red y se aborta`, async () => {
      const base = fetchQueRespetaLaSenal();
      const resultado = resultadoDe(crear(base)(`${BASE}/auth/v1/logout?scope=local`, { method: "POST" }));

      await vi.advanceTimersByTimeAsync(TOPE_PEDIDO_AUTH_MS - 1);
      expect(base.mock.calls[0][1]?.signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      expect(await resultado).toMatchObject({ name: "TimeoutError" });
      expect(base.mock.calls[0][1]?.signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("un fetch que no atiende la señal igual se corta", async () => {
      const resultado = resultadoDe(
        crear((() => new Promise(() => {})) as typeof fetch)(`${BASE}/auth/v1/token?grant_type=password`),
      );

      await vi.advanceTimersByTimeAsync(TOPE_PEDIDO_AUTH_MS);

      expect(await resultado).toMatchObject({ name: "TimeoutError" });
    });

    it("si contesta a tiempo devuelve la respuesta y no deja ningún temporizador", async () => {
      const respuesta = new Response("{}", { status: 400 });

      const devuelta = await crear((async () => respuesta) as typeof fetch)(`${BASE}/auth/v1/token?grant_type=password`);

      expect(devuelta).toBe(respuesta);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("respeta la señal de quien pide: si la aborta, el pedido se aborta", async () => {
      const base = fetchQueRespetaLaSenal();
      const quienPide = new AbortController();
      const resultado = resultadoDe(crear(base)(`${BASE}/auth/v1/user`, { signal: quienPide.signal }));

      quienPide.abort(new DOMException("cancelado", "AbortError"));

      expect(await resultado).toMatchObject({ name: "AbortError" });
      expect(vi.getTimerCount()).toBe(0);
    });

    it("si la señal de quien pide ya venía abortada, ni espera", async () => {
      const quienPide = new AbortController();
      quienPide.abort(new DOMException("cancelado", "AbortError"));

      const resultado = await resultadoDe(
        crear(fetchQueRespetaLaSenal())(`${BASE}/auth/v1/user`, { signal: quienPide.signal }),
      );

      expect(resultado).toMatchObject({ name: "AbortError" });
    });
  });

  describe("renovar el token", () => {
    const renovacion = `${BASE}/auth/v1/token?grant_type=refresh_token`;

    it("un 429 no pasa como respuesta: se hace pasar por una caída de red para que el SDK conserve la sesión", async () => {
      const base = vi.fn(
        async () => new Response(JSON.stringify({ error_code: "over_request_rate_limit" }), { status: 429 }),
      );

      await expect(crear(base as unknown as typeof fetch)(renovacion, { method: "POST" })).rejects.toBeInstanceOf(TypeError);
    });

    it("el 429 de un inicio de sesión sí pasa como respuesta (es «demasiados intentos»)", async () => {
      const devuelta = await crear((async () => new Response("{}", { status: 429 })) as typeof fetch)(
        `${BASE}/auth/v1/token?grant_type=password`,
      );

      expect(devuelta.status).toBe(429);
    });

    it("un rechazo del token (400) pasa como respuesta: esa sí es una sesión que ya no sirve", async () => {
      const devuelta = await crear((async () => new Response("{}", { status: 400 })) as typeof fetch)(renovacion);

      expect(devuelta.status).toBe(400);
    });

    it("si la sesión ya no está guardada no manda la renovación", async () => {
      const base = vi.fn(async () => new Response("{}"));

      await expect(crear(base as unknown as typeof fetch, async () => false)(renovacion)).rejects.toBeInstanceOf(TypeError);

      expect(base).not.toHaveBeenCalled();
    });

    it("sin sesión guardada, los demás pedidos a Auth (iniciar sesión) salen igual", async () => {
      const base = vi.fn(async () => new Response("{}"));

      await crear(base as unknown as typeof fetch, async () => false)(`${BASE}/auth/v1/token?grant_type=password`);

      expect(base).toHaveBeenCalledTimes(1);
    });
  });
});
