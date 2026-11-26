import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { abrirEnlace, cerrarOtrasSesiones, guardarContrasena, pedirEnlace } from "@/auth/recuperacion";

/** Un cliente con solo lo que usa la recuperación; cada test cambia lo que contesta cada método. */
function clienteFalso() {
  const auth = {
    resetPasswordForEmail: vi.fn(async (): Promise<{ error: unknown }> => ({ error: null })),
    exchangeCodeForSession: vi.fn(
      async (): Promise<{ data: unknown; error: unknown }> => ({
        data: { session: { user: { id: "u-1", email: "marta@correo.com" } } },
        error: null,
      }),
    ),
    verifyOtp: vi.fn(
      async (): Promise<{ data: unknown; error: unknown }> => ({
        data: { session: { user: { id: "u-1", email: "marta@correo.com" } } },
        error: null,
      }),
    ),
    updateUser: vi.fn(async (): Promise<{ error: unknown }> => ({ error: null })),
    signOut: vi.fn(async (): Promise<{ error: unknown }> => ({ error: null })),
    getSession: vi.fn(async (): Promise<{ data: { session: unknown } }> => ({ data: { session: { user: { id: "u-1" } } } })),
  };
  return { supabase: { auth } as unknown as SupabaseClient, auth };
}

const errorApi = (estado: number, codigo: string) => new AuthApiError("mensaje de prueba", estado, codigo as never);

afterEach(() => {
  vi.useRealTimers();
});

describe("pedirEnlace", () => {
  it("pide el correo con la dirección de «Nueva contraseña» y dice enviado", async () => {
    const { supabase, auth } = clienteFalso();
    expect(await pedirEnlace(supabase, "marta@correo.com", "https://panel.test/acceso/nueva-contrasena")).toEqual({ tipo: "enviado" });
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("marta@correo.com", { redirectTo: "https://panel.test/acceso/nueva-contrasena" });
  });

  it.each([
    ["el límite de correos", errorApi(429, "over_email_send_rate_limit")],
    ["el límite de pedidos", errorApi(429, "over_request_rate_limit")],
    ["una dirección que no recibe correos", errorApi(400, "email_address_invalid")],
    ["una dirección no autorizada", errorApi(400, "email_address_not_authorized")],
    ["un 429 sin código", errorApi(429, "")],
  ])("%s se enmascara como un envío (no revela si hay cuenta)", async (_nombre, error) => {
    const { supabase, auth } = clienteFalso();
    auth.resetPasswordForEmail.mockResolvedValue({ error });
    expect(await pedirEnlace(supabase, "marta@correo.com", "https://panel.test/x")).toEqual({ tipo: "enviado" });
  });

  it.each([
    ["sin red", new AuthRetryableFetchError("fetch failed", 0)],
    ["un 500", errorApi(500, "unexpected_failure")],
    ["un 400 desconocido", errorApi(400, "algo_raro")],
  ])("%s es «no disponible»", async (_nombre, error) => {
    const { supabase, auth } = clienteFalso();
    auth.resetPasswordForEmail.mockResolvedValue({ error });
    expect(await pedirEnlace(supabase, "marta@correo.com", "https://panel.test/x")).toEqual({ tipo: "no-disponible" });
  });

  it("si el SDK tira, es «no disponible»; si no contesta en el tope, también", async () => {
    const { supabase, auth } = clienteFalso();
    auth.resetPasswordForEmail.mockRejectedValue(new Error("boom"));
    expect(await pedirEnlace(supabase, "a@b.co", "https://panel.test/x")).toEqual({ tipo: "no-disponible" });

    vi.useFakeTimers();
    auth.resetPasswordForEmail.mockReturnValue(new Promise(() => {}));
    const pedido = pedirEnlace(supabase, "a@b.co", "https://panel.test/x", 5000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await pedido).toEqual({ tipo: "no-disponible" });
  });
});

describe("abrirEnlace", () => {
  it("canjea el código y devuelve la cuenta", async () => {
    const { supabase, auth } = clienteFalso();
    expect(await abrirEnlace(supabase, "codigo-1")).toEqual({ tipo: "ok", correo: "marta@correo.com", usuarioId: "u-1" });
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("codigo-1");
  });

  it.each([
    ["vencido", errorApi(403, "otp_expired")],
    ["un código que no existe", errorApi(404, "flow_state_not_found")],
  ])("un enlace %s es una sola respuesta: no válido", async (_nombre, error) => {
    const { supabase, auth } = clienteFalso();
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error });
    expect(await abrirEnlace(supabase, "x")).toEqual({ tipo: "no-valido" });
  });

  it("un `?code=` sin el verificador PKCE (otro navegador) es no válido y lo marca, para que la pantalla lo diga", async () => {
    const { supabase, auth } = clienteFalso();
    const error = Object.assign(new Error("PKCE code verifier not found in storage"), { name: "AuthPKCECodeVerifierMissingError", status: 400 });
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error });
    expect(await abrirEnlace(supabase, "x")).toEqual({ tipo: "no-valido", sinVerificador: true });
  });

  it("#217: el código de un solo uso se verifica con verifyOtp como recovery, sin verificador, y vencido es no válido (sin la marca)", async () => {
    const { supabase, auth } = clienteFalso();
    expect(await abrirEnlace(supabase, "hash-1", undefined, "un-solo-uso")).toEqual({ tipo: "ok", correo: "marta@correo.com", usuarioId: "u-1" });
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "hash-1", type: "recovery" });
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    auth.verifyOtp.mockResolvedValue({ data: { session: null }, error: errorApi(403, "otp_expired") });
    expect(await abrirEnlace(supabase, "hash-1", undefined, "un-solo-uso")).toEqual({ tipo: "no-valido" });
    auth.verifyOtp.mockResolvedValue({ data: { session: null }, error: errorApi(503, "unexpected_failure") });
    expect(await abrirEnlace(supabase, "hash-1", undefined, "un-solo-uso")).toEqual({ tipo: "no-disponible" });
  });

  it("sin red, con el servicio caído o limitado no se dice que el enlace venció", async () => {
    const { supabase, auth } = clienteFalso();
    for (const error of [new AuthRetryableFetchError("fetch failed", 0), errorApi(503, "unexpected_failure"), errorApi(429, "over_request_rate_limit")]) {
      auth.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error });
      expect(await abrirEnlace(supabase, "x")).toEqual({ tipo: "no-disponible" });
    }
    auth.exchangeCodeForSession.mockRejectedValue(new Error("boom"));
    expect(await abrirEnlace(supabase, "x")).toEqual({ tipo: "no-disponible" });
  });

  it("una respuesta sin sesión o sin correo no sirve", async () => {
    const { supabase, auth } = clienteFalso();
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: null });
    expect(await abrirEnlace(supabase, "x")).toEqual({ tipo: "no-valido" });
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: { user: { id: "u" } } }, error: null });
    expect(await abrirEnlace(supabase, "x")).toEqual({ tipo: "no-valido" });
  });
});

describe("guardarContrasena", () => {
  it("cambia la contraseña y cierra todas las sesiones de la cuenta", async () => {
    const { supabase, auth } = clienteFalso();
    expect(await guardarContrasena(supabase, "Nueva-clave-1")).toEqual({ tipo: "ok" });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "Nueva-clave-1" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
    // Y la de este navegador se borra igual (cookie).
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("una contraseña que no cumple las reglas no sale del servidor", async () => {
    const { supabase, auth } = clienteFalso();
    for (const mala of ["corta1A", "sin-mayuscula-1", "SinNumeroAqui", ""]) {
      expect(await guardarContrasena(supabase, mala), mala).toEqual({ tipo: "contrasena-debil" });
    }
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    ["la misma de antes", errorApi(422, "same_password"), "misma-contrasena"],
    ["la política del servidor", errorApi(422, "weak_password"), "contrasena-debil"],
    ["sin sesión de recuperación", new AuthSessionMissingError(), "sin-sesion"],
    ["un 401", errorApi(401, "bad_jwt"), "sin-sesion"],
    ["el servicio caído", errorApi(500, "unexpected_failure"), "no-disponible"],
    ["sin red", new AuthRetryableFetchError("fetch failed", 0), "no-disponible"],
  ])("%s", async (_nombre, error, esperado) => {
    const { supabase, auth } = clienteFalso();
    auth.updateUser.mockResolvedValue({ error });
    expect(await guardarContrasena(supabase, "Nueva-clave-1")).toEqual({ tipo: esperado });
    // Sin cambio no se cierra nada.
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it.each([
    ["devuelve { error } (red o 5xx: signOut no lanza)", () => Promise.resolve({ error: errorApi(500, "unexpected_failure") })],
    ["devuelve { error } de red", () => Promise.resolve({ error: new AuthRetryableFetchError("fetch failed", 0) })],
    ["lanza", () => Promise.reject(new Error("sin red"))],
    ["no contesta a tiempo", () => new Promise<{ error: unknown }>(() => {})],
  ])("si el cierre global %s, la contraseña ya cambió pero NO es ok: «ok-sin-revocar» y la sesión de este navegador se conserva", async (_nombre, signOut) => {
    const { supabase, auth } = clienteFalso();
    auth.signOut.mockImplementation(signOut);
    expect(await guardarContrasena(supabase, "Nueva-clave-1", 20)).toEqual({ tipo: "ok-sin-revocar" });
    expect(auth.signOut).not.toHaveBeenCalledWith({ scope: "local" });
  });

  it("si el servicio tira al cambiar, es «no disponible»", async () => {
    const { supabase, auth } = clienteFalso();
    auth.updateUser.mockRejectedValue(new Error("boom"));
    expect(await guardarContrasena(supabase, "Nueva-clave-1")).toEqual({ tipo: "no-disponible" });
  });
});

describe("cerrarOtrasSesiones", () => {
  it("reintenta el cierre global sin tocar la contraseña y borra la sesión de este navegador", async () => {
    const { supabase, auth } = clienteFalso();
    expect(await cerrarOtrasSesiones(supabase)).toEqual({ tipo: "ok" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    ["{ error }", () => Promise.resolve({ error: errorApi(503, "unexpected_failure") })],
    ["un throw", () => Promise.reject(new Error("sin red"))],
  ])("si el cierre global vuelve a fallar con %s, sigue «ok-sin-revocar» y la sesión se conserva", async (_nombre, signOut) => {
    const { supabase, auth } = clienteFalso();
    auth.signOut.mockImplementation(signOut);
    expect(await cerrarOtrasSesiones(supabase)).toEqual({ tipo: "ok-sin-revocar" });
    expect(auth.signOut).not.toHaveBeenCalledWith({ scope: "local" });
  });

  it("sin sesión en este navegador no se puede afirmar el cierre", async () => {
    const { supabase, auth } = clienteFalso();
    auth.getSession.mockResolvedValue({ data: { session: null } });
    expect(await cerrarOtrasSesiones(supabase)).toEqual({ tipo: "ok-sin-revocar" });
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});
