import { describe, expect, it } from "vitest";

import {
  archivosEnvProhibidos,
  entornoDelBuild,
  hallazgosEnTexto,
  ROBOTS_TXT,
  variablesProhibidas,
  VARIABLES_DEL_BUILD,
} from "./guardia-pages.mjs";

describe("guardia del build de Pages", () => {
  describe("variablesProhibidas", () => {
    it("rechaza las variables de Supabase, del BFF y las credenciales", () => {
      const env = {
        PATH: "/usr/bin",
        SUPABASE_URL: "https://x.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJ",
        SUPABASE_SERVICE_ROLE_KEY: "eyJ",
        BFF_COORDINADORES_URL: "https://bff",
        DB_PASSWORD: "x",
        STRIPE_API_KEY: "x",
      };
      expect(variablesProhibidas(env)).toEqual([
        "BFF_COORDINADORES_URL",
        "DB_PASSWORD",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "STRIPE_API_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_URL",
      ]);
    });

    it("rechaza cualquier NEXT_PUBLIC_ que no sea un flag del panel", () => {
      expect(variablesProhibidas({ NEXT_PUBLIC_ALGO: "1" })).toEqual(["NEXT_PUBLIC_ALGO"]);
    });

    it("tolera el entorno normal de Docker y de Actions, con los flags del panel", () => {
      const env = {
        PATH: "/usr/bin",
        HOME: "/root",
        CI: "true",
        GITHUB_ACTIONS: "true",
        NEXT_PUBLIC_MODO_DEV: "1",
        NEXT_PUBLIC_PESTANA_STOCK: "0",
        NEXT_PUBLIC_PESTANA_CUENTAS: "0",
        NEXT_TELEMETRY_DISABLED: "1",
        NEXT_WATCH_POLL_MS: "1000",
      };
      expect(variablesProhibidas(env)).toEqual([]);
    });
  });

  describe("entornoDelBuild", () => {
    it("deja pasar solo lo permitido y fija el modo del build, pisando lo que traiga el entorno", () => {
      const entorno = entornoDelBuild({
        PATH: "/usr/bin",
        HOME: "/root",
        GITHUB_TOKEN: "ghs_x",
        NEXT_PUBLIC_MODO_DEV: "0",
        NEXT_PUBLIC_PESTANA_STOCK: "0",
        DEPLOY_PAGES: "0",
      });
      expect(entorno).toEqual({ PATH: "/usr/bin", HOME: "/root", ...VARIABLES_DEL_BUILD });
      expect(entorno.DEPLOY_PAGES).toBe("1");
      expect(entorno.NEXT_PUBLIC_MODO_DEV).toBe("1");
      expect(entorno).not.toHaveProperty("GITHUB_TOKEN");
      expect(entorno).not.toHaveProperty("NEXT_PUBLIC_PESTANA_STOCK");
    });
  });

  describe("archivosEnvProhibidos", () => {
    it("encuentra los .env que Next leería y deja pasar los de ejemplo", () => {
      const archivos = ["package.json", ".env", ".env.local", ".env.production", ".env.example", ".gitignore"];
      expect(archivosEnvProhibidos(archivos)).toEqual([".env", ".env.local", ".env.production"]);
    });
  });

  describe("hallazgosEnTexto", () => {
    it("detecta un JWT, una clave sb_, una URL de Supabase y el rol de servicio", () => {
      const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIn0.firmaDeEjemplo123";
      expect(hallazgosEnTexto(`const k="${jwt}"`)).toHaveLength(1);
      expect(hallazgosEnTexto("sb_secret_abcdefgh1234")).toHaveLength(1);
      expect(hallazgosEnTexto("https://abcdefghijkl.supabase.co/rest/v1")).toHaveLength(1);
      expect(hallazgosEnTexto('{"role":"service_role"}')).toHaveLength(1);
    });

    it("no marca el texto normal del panel", () => {
      expect(hallazgosEnTexto("<h1>Zonas · Verano 2026</h1> Diego Rocha $U 84K hace 20 min")).toEqual([]);
    });
  });

  it("el robots.txt bloquea todo", () => {
    expect(ROBOTS_TXT).toBe("User-agent: *\nDisallow: /\n");
  });
});
