import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";

import { causaDe, ErrorSupabase } from "@/datos/supabase/cliente";
import { borrarSesionGuardada, crearClienteRpc, crearSupabase } from "@/datos/supabase/sdk";
import {
  crearSupabasePrueba,
  CLAVE_PRUEBA,
  errorDePostgrest,
  json,
  respuestaDeSesion,
  URL_PRUEBA,
} from "@/test/supabase";

const entrar = (supabase: ReturnType<typeof crearSupabasePrueba>["supabase"]) =>
  supabase.auth.signInWithPassword({ email: "coordinador@example.com", password: "clave" });

describe("crearClienteRpc", () => {
  it("llama a la función por POST con los argumentos y el JWT del coordinador", async () => {
    const { supabase, llamadas } = crearSupabasePrueba((l) =>
      l.ruta === "/auth/v1/token" ? respuestaDeSesion({ token: "token-coordinador" }) : json([{ usuario_id: "u1" }]),
    );
    await entrar(supabase);

    const filas = await crearClienteRpc(supabase).llamarRpc<{ usuario_id: string }[]>("colportores_de_campania", {
      p_campania_id: "c1",
    });

    expect(filas).toEqual([{ usuario_id: "u1" }]);
    const rpc = llamadas.find((l) => l.ruta === "/rest/v1/rpc/colportores_de_campania");
    expect(rpc).toMatchObject({ metodo: "POST", token: "token-coordinador", cuerpo: { p_campania_id: "c1" } });
  });

  it("sin sesión llama con la clave anónima, que la RLS no deja pasar de lo público", async () => {
    const { supabase, llamadas } = crearSupabasePrueba(() => json([]));

    await crearClienteRpc(supabase).llamarRpc("colportores_de_campania", { p_campania_id: "c1" });

    expect(llamadas[0].token).toBe(CLAVE_PRUEBA);
  });

  it("un rechazo de la regla sale como ErrorSupabase con el estado y el código de la RPC", async () => {
    const { supabase } = crearSupabasePrueba(() => errorDePostgrest(400, "CI004", "la persona ya está inscripta"));

    const error = await crearClienteRpc(supabase)
      .llamarRpc("inscribir_colportor", { p_campania: "c1", p_usuario: "u1" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErrorSupabase);
    expect(error).toMatchObject({ estado: 400, codigo: "CI004", message: "la persona ya está inscripta" });
    expect(causaDe(error)).toBe("rechazo");
  });

  it("un JWT que la base no acepta es una sesión vencida", async () => {
    const { supabase } = crearSupabasePrueba(() => errorDePostgrest(401, "PGRST301", "JWT expired"));

    const error = await crearClienteRpc(supabase)
      .llamarRpc("colportores_de_campania", { p_campania_id: "c1" })
      .catch((e: unknown) => e);

    expect(causaDe(error)).toBe("sesion-vencida");
  });

  it("sin red o con Supabase caído no es una sesión vencida", async () => {
    const sinRed = crearSupabasePrueba(() => {
      throw new TypeError("fetch failed");
    });
    const caido = crearSupabasePrueba(() => json({ message: "servicio no disponible" }, 503));

    const errorSinRed = await crearClienteRpc(sinRed.supabase).llamarRpc("mis_zonas", {}).catch((e: unknown) => e);
    const errorCaido = await crearClienteRpc(caido.supabase).llamarRpc("mis_zonas", {}).catch((e: unknown) => e);

    expect(errorSinRed).toMatchObject({ estado: 0 });
    expect(causaDe(errorSinRed)).toBe("no-disponible");
    expect(causaDe(errorCaido)).toBe("no-disponible");
  });

  it("un 401 del gateway por una clave anónima mal cargada no es una sesión vencida", async () => {
    const { supabase } = crearSupabasePrueba(() => json({ message: "Invalid API key" }, 401));

    const error = await crearClienteRpc(supabase).llamarRpc("mis_zonas", {}).catch((e: unknown) => e);

    expect(causaDe(error)).toBe("no-disponible");
  });
});

/** Un cliente de `crearSupabase` que contesta siempre con una sesión nueva, con las opciones dadas. */
const crearConSesion = (auth: NonNullable<Parameters<typeof crearSupabase>[1]>["auth"] = {}) =>
  crearSupabase(
    { url: URL_PRUEBA, anonKey: CLAVE_PRUEBA },
    { auth: { autoRefreshToken: false, ...auth }, global: { fetch: (async () => respuestaDeSesion()) as typeof fetch } },
  );

describe("borrarSesionGuardada", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("borra la sesión y el verificador de código del almacén del cliente, sin llamar a la red", async () => {
    const { supabase, almacen, llamadas } = crearSupabasePrueba((l) =>
      l.ruta === "/auth/v1/token" ? respuestaDeSesion() : json([]),
    );
    await entrar(supabase);
    const clave = [...almacen.keys()][0];
    almacen.set(`${clave}-code-verifier`, "verificador");
    expect(almacen.size).toBe(2);
    const llamadasAntes = llamadas.length;

    await borrarSesionGuardada(supabase);

    expect(almacen.size).toBe(0);
    expect(llamadas).toHaveLength(llamadasAntes);
    expect((await supabase.auth.getSession()).data.session).toBeNull();
  });

  it("sin `storage` ni `storageKey` usa el `localStorage` del navegador y la clave de siempre del SDK", async () => {
    const supabase = crearConSesion();
    await entrar(supabase);
    expect(localStorage.getItem("sb-proyecto-auth-token")).not.toBeNull();

    await borrarSesionGuardada(supabase);

    expect(localStorage.getItem("sb-proyecto-auth-token")).toBeNull();
  });

  it("si el navegador no deja usar el `localStorage`, la sesión queda en memoria y también se puede borrar", async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("bloqueado", "SecurityError");
      },
    });
    try {
      const supabase = crearConSesion();
      await entrar(supabase);
      expect((await supabase.auth.getSession()).data.session).not.toBeNull();

      await borrarSesionGuardada(supabase);

      expect((await supabase.auth.getSession()).data.session).toBeNull();
    } finally {
      if (original) Object.defineProperty(globalThis, "localStorage", original);
    }
  });

  it("respeta el almacén y la clave que le da quien crea el cliente (cookies, por ejemplo)", async () => {
    const guardado = new Map<string, string>();
    const supabase = crearConSesion({
      storageKey: "sb-mia",
      storage: {
        getItem: async (k) => guardado.get(k) ?? null,
        setItem: async (k, v) => void guardado.set(k, v),
        removeItem: async (k) => void guardado.delete(k),
      },
    });
    await entrar(supabase);
    expect([...guardado.keys()]).toEqual(["sb-mia"]);

    await borrarSesionGuardada(supabase);

    expect(guardado.size).toBe(0);
  });

  it("un almacén que falla al borrar no tira el cierre", async () => {
    const supabase = crearConSesion({
      storage: { getItem: () => null, setItem: () => undefined, removeItem: () => Promise.reject(new Error("almacén roto")) },
    });

    await expect(borrarSesionGuardada(supabase)).resolves.toBeUndefined();
  });

  it("un cliente que no creó `crearSupabase` no se toca", async () => {
    await expect(borrarSesionGuardada(createClient(URL_PRUEBA, CLAVE_PRUEBA))).resolves.toBeUndefined();
  });
});
