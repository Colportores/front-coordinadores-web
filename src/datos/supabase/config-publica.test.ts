import { describe, expect, it, vi } from "vitest";

import {
  configPublicaSupabase,
  esClaveDeServicio,
  leerConfigPublicaSupabase,
  verificarEntornoDeProduccion,
  verificarEntornoSupabase,
} from "@/datos/supabase/config-publica";

const COMPLETO = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_x",
};

/** Un JWT con la carga dada (la firma no importa: solo se lee el rol). */
function jwt(carga: object): string {
  const base64url = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url(carga)}.firma-de-prueba`;
}

describe("leerConfigPublicaSupabase", () => {
  it("devuelve la URL y la clave cuando están las dos", () => {
    expect(leerConfigPublicaSupabase(COMPLETO)).toEqual({ url: "https://abc.supabase.co", anonKey: "sb_publishable_x" });
  });

  it("limpia espacios y la barra final de la URL", () => {
    const config = leerConfigPublicaSupabase({ ...COMPLETO, NEXT_PUBLIC_SUPABASE_URL: "  https://abc.supabase.co//  " });

    expect(config?.url).toBe("https://abc.supabase.co");
  });

  it.each(["http://127.0.0.1:54321", "http://localhost:54321", "http://[::1]:54321"])(
    "acepta el Supabase local por http: %s",
    (url) => {
      expect(leerConfigPublicaSupabase({ ...COMPLETO, NEXT_PUBLIC_SUPABASE_URL: url })?.url).toBe(url);
    },
  );

  it.each([
    "http://abc.supabase.co",
    "http://proyecto.supabase.co:80",
    "http://192.168.1.20:54321",
    "http://localhost.evil.com",
    "http://127.0.0.1.evil.com",
    "http://localhost@evil.com",
  ])("http a un host que no es local se rechaza, porque el correo y la contraseña saldrían en claro: %s", (url) => {
    expect(leerConfigPublicaSupabase({ ...COMPLETO, NEXT_PUBLIC_SUPABASE_URL: url })).toBeNull();
  });

  it("https vale para cualquier host", () => {
    expect(leerConfigPublicaSupabase({ ...COMPLETO, NEXT_PUBLIC_SUPABASE_URL: "https://localhost:8443" })?.url).toBe(
      "https://localhost:8443",
    );
  });

  it.each(Object.keys(COMPLETO))("queda en null si falta %s", (variable) => {
    expect(leerConfigPublicaSupabase({ ...COMPLETO, [variable]: undefined })).toBeNull();
    expect(leerConfigPublicaSupabase({ ...COMPLETO, [variable]: "  " })).toBeNull();
  });

  it.each(["abc.supabase.co", "javascript:alert(1)", "ftp://abc.supabase.co", "no es una url"])(
    "queda en null si la URL no es http(s): «%s»",
    (url) => {
      expect(leerConfigPublicaSupabase({ ...COMPLETO, NEXT_PUBLIC_SUPABASE_URL: url })).toBeNull();
    },
  );

  it("acepta una clave anónima en JWT (formato anterior de Supabase)", () => {
    const anonKey = jwt({ iss: "supabase", ref: "abc", role: "anon" });

    expect(leerConfigPublicaSupabase({ ...COMPLETO, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey })?.anonKey).toBe(anonKey);
  });

  it("rechaza una clave secreta: con NEXT_PUBLIC_ iría al navegador de todos", () => {
    expect(leerConfigPublicaSupabase({ ...COMPLETO, NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_secret_abcdefgh" })).toBeNull();
  });

  it("rechaza un JWT con el rol de servicio, que se saltea la RLS", () => {
    const clave = jwt({ iss: "supabase", ref: "abc", role: "service_role" });

    expect(leerConfigPublicaSupabase({ ...COMPLETO, NEXT_PUBLIC_SUPABASE_ANON_KEY: clave })).toBeNull();
  });
});

describe("configPublicaSupabase", () => {
  it("lee las variables NEXT_PUBLIC_ del entorno del build", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_x");

    expect(configPublicaSupabase()).toEqual({ url: "https://abc.supabase.co", anonKey: "sb_publishable_x" });
  });

  it("queda en null sin variables", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", undefined);

    expect(configPublicaSupabase()).toBeNull();
  });
});

describe("verificarEntornoSupabase (el chequeo del build)", () => {
  it("no hace nada sin variables, con la clave publishable o con una anon", () => {
    expect(() => verificarEntornoSupabase({})).not.toThrow();
    expect(() => verificarEntornoSupabase(COMPLETO)).not.toThrow();
    expect(() => verificarEntornoSupabase({ NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ role: "anon" }) })).not.toThrow();
  });

  it.each([
    ["una clave secreta", "sb_secret_abcdefgh1234"],
    ["un JWT con el rol de servicio", jwt({ iss: "supabase", role: "service_role" })],
  ])("frena con %s, dice qué variable es y no escribe la clave", (_nombre, clave) => {
    let mensaje = "";
    try {
      verificarEntornoSupabase({ ...COMPLETO, NEXT_PUBLIC_SUPABASE_ANON_KEY: ` ${clave} ` });
    } catch (error) {
      mensaje = (error as Error).message;
    }

    expect(mensaje).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(mensaje).not.toContain(clave);
    expect(mensaje).not.toContain("abcdefgh1234");
  });

  it("esClaveDeServicio no confunde una clave anon ni algo que no es un JWT", () => {
    expect(esClaveDeServicio(jwt({ role: "anon" }))).toBe(false);
    expect(esClaveDeServicio("a.b.c")).toBe(false);
    expect(esClaveDeServicio("sb_publishable_x")).toBe(false);
  });

  describe("next.config.ts lo llama antes de que Next incruste las variables en el navegador", () => {
    it("con una clave de servicio el arranque falla", async () => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_secret_abcdefgh1234");
      vi.resetModules();

      await expect(import("../../../next.config")).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    });

    it("con una clave publishable carga la configuración", async () => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_x");
      vi.resetModules();

      expect((await import("../../../next.config")).default).toBeTypeOf("object");
    });
  });
});

describe("verificarEntornoDeProduccion (el build de producción exige Supabase, #101)", () => {
  const ARMADO = { PANEL_EXIGIR_SUPABASE: "1" };

  function mensajeDe(env: Record<string, string | undefined>): string {
    try {
      verificarEntornoDeProduccion(env);
    } catch (error) {
      return (error as Error).message;
    }
    return "";
  }

  it("sin PANEL_EXIGIR_SUPABASE no hace nada, tampoco sin variables: hasta diciembre el build queda como estaba", () => {
    expect(() => verificarEntornoDeProduccion({})).not.toThrow();
    expect(() => verificarEntornoDeProduccion({ PANEL_EXIGIR_SUPABASE: "0" })).not.toThrow();
    expect(() => verificarEntornoDeProduccion({ PANEL_EXIGIR_SUPABASE: "" })).not.toThrow();
  });

  it("armado y con la URL y la clave publicable, el build sigue", () => {
    expect(() => verificarEntornoDeProduccion({ ...ARMADO, ...COMPLETO })).not.toThrow();
  });

  it.each(["1", "true", "si", "on", " TRUE "])("armado con %j y sin variables, el build falla y dice cuáles faltan", (valor) => {
    const mensaje = mensajeDe({ PANEL_EXIGIR_SUPABASE: valor });

    expect(mensaje).toContain("NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(mensaje).toContain("PANEL_DATOS_SIMULADOS=1");
  });

  it("dice cuál de las dos falta", () => {
    expect(mensajeDe({ ...ARMADO, NEXT_PUBLIC_SUPABASE_URL: COMPLETO.NEXT_PUBLIC_SUPABASE_URL })).toContain(
      "falta NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
    expect(mensajeDe({ ...ARMADO, NEXT_PUBLIC_SUPABASE_ANON_KEY: COMPLETO.NEXT_PUBLIC_SUPABASE_ANON_KEY })).toContain(
      "falta NEXT_PUBLIC_SUPABASE_URL",
    );
  });

  it("variables que no sirven (URL http:// ajena a localhost) también frenan, sin escribir la clave", () => {
    const mensaje = mensajeDe({ ...ARMADO, NEXT_PUBLIC_SUPABASE_URL: "http://otro-host.com", NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_secretito" });

    expect(mensaje).toContain("no es una URL https:// válida");
    expect(mensaje).not.toContain("secretito");
    expect(mensaje).not.toContain("otro-host");
  });

  it("el modo simulado explícito (PANEL_DATOS_SIMULADOS) o el build de Pages dejan pasar sin variables", () => {
    expect(() => verificarEntornoDeProduccion({ ...ARMADO, PANEL_DATOS_SIMULADOS: "1" })).not.toThrow();
    expect(() => verificarEntornoDeProduccion({ ...ARMADO, DEPLOY_PAGES: "1" })).not.toThrow();
  });

  it("PANEL_DATOS_SIMULADOS apagado no es un permiso", () => {
    expect(mensajeDe({ ...ARMADO, PANEL_DATOS_SIMULADOS: "0" })).not.toBe("");
  });
});
