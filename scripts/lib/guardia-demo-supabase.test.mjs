import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  archivosEnvProhibidos,
  AVISO_DEMO_TEXTO,
  CUENTA_DEMO,
  entornoDelBuild,
  esClaveAnonima,
  hallazgosEnArchivoDeTexto,
  hallazgosEnTexto,
  problemasDelEntorno,
  readmeDelArtefacto,
  ROBOTS_TXT,
  URL_PROYECTO_DEV,
  VARIABLES_DEL_BUILD,
} from "./guardia-demo-supabase.mjs";

// vitest corre desde la raíz del repo.
const leer = (ruta) => readFileSync(join(process.cwd(), ruta), "utf8");

const jwt = (carga) => {
  const parte = (objeto) => Buffer.from(JSON.stringify(objeto)).toString("base64url");
  return `${parte({ alg: "HS256", typ: "JWT" })}.${parte(carga)}.firmaDePrueba1234567890`;
};
const JWT_ANON = jwt({ iss: "supabase", ref: "ohdsavwpasfpapbyutrv", role: "anon" });
const JWT_SERVICIO = jwt({ iss: "supabase", ref: "ohdsavwpasfpapbyutrv", role: "service_role" });
const PUBLISHABLE = "sb_publishable_AbCdEfGhIjKlMnOpQrSt";

const entornoValido = { PATH: "/usr/bin", NEXT_PUBLIC_SUPABASE_URL: URL_PROYECTO_DEV, NEXT_PUBLIC_SUPABASE_ANON_KEY: PUBLISHABLE };

describe("guardia del artefacto de demo con Supabase dev", () => {
  describe("esClaveAnonima", () => {
    it("acepta la clave publishable y el JWT con rol anon", () => {
      expect(esClaveAnonima(PUBLISHABLE)).toBe(true);
      expect(esClaveAnonima(JWT_ANON)).toBe(true);
    });

    it("rechaza la clave secreta, el JWT de servicio y lo que no es una clave", () => {
      expect(esClaveAnonima("sb_secret_AbCdEfGhIjKlMnOp")).toBe(false);
      expect(esClaveAnonima(JWT_SERVICIO)).toBe(false);
      expect(esClaveAnonima("eyJmalo.eyJmalo.x")).toBe(false);
      expect(esClaveAnonima("")).toBe(false);
      expect(esClaveAnonima(undefined)).toBe(false);
    });
  });

  describe("problemasDelEntorno", () => {
    it("con la URL del proyecto dev y una clave anónima no hay problemas", () => {
      expect(problemasDelEntorno(entornoValido)).toEqual([]);
      expect(problemasDelEntorno({ ...entornoValido, NEXT_PUBLIC_SUPABASE_URL: `${URL_PROYECTO_DEV}/`, NEXT_PUBLIC_SUPABASE_ANON_KEY: JWT_ANON })).toEqual([]);
    });

    it("pide las dos variables", () => {
      expect(problemasDelEntorno({ PATH: "/usr/bin" })).toEqual([
        expect.stringContaining("falta NEXT_PUBLIC_SUPABASE_URL"),
        expect.stringContaining("falta NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      ]);
    });

    it("rechaza la URL de otro proyecto, también la local", () => {
      for (const url of ["https://otroproyecto.supabase.co", "http://127.0.0.1:54321"]) {
        expect(problemasDelEntorno({ ...entornoValido, NEXT_PUBLIC_SUPABASE_URL: url })).toEqual([expect.stringContaining("no es la del proyecto de desarrollo")]);
      }
    });

    it("rechaza una clave de servicio sin repetirla en el mensaje", () => {
      for (const clave of [JWT_SERVICIO, "sb_secret_AbCdEfGhIjKlMnOp"]) {
        const problemas = problemasDelEntorno({ ...entornoValido, NEXT_PUBLIC_SUPABASE_ANON_KEY: clave });
        expect(problemas).toEqual([expect.stringContaining("no es una clave anónima")]);
        expect(problemas.join(" ")).not.toContain(clave);
      }
    });

    it("rechaza las demás variables de credenciales, del BFF o del puente de desarrollo", () => {
      const env = {
        ...entornoValido,
        SUPABASE_SERVICE_ROLE_KEY: "x",
        SUPABASE_COORDINADOR_PASSWORD: "x",
        SUPABASE_URL: "x",
        BFF_COORDINADORES_URL: "x",
        NEXT_PUBLIC_OTRA: "x",
        NEXT_PUBLIC_MODO_DEV: "1",
      };
      const [problema] = problemasDelEntorno(env);
      expect(problema).toBe(
        "el entorno trae variables que este build no admite: BFF_COORDINADORES_URL, NEXT_PUBLIC_OTRA, SUPABASE_COORDINADOR_PASSWORD, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL",
      );
    });
  });

  describe("entornoDelBuild", () => {
    it("lleva lo permitido, la conexión pública y lo que fija el build; nada más", () => {
      const env = entornoDelBuild({ ...entornoValido, NEXT_PUBLIC_SUPABASE_URL: `${URL_PROYECTO_DEV}/`, GITHUB_TOKEN: "x", HOME: "/root", NEXT_PUBLIC_MODO_DEV: "1" });
      expect(env).toEqual({
        PATH: "/usr/bin",
        HOME: "/root",
        NEXT_PUBLIC_SUPABASE_URL: URL_PROYECTO_DEV,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: PUBLISHABLE,
        ...VARIABLES_DEL_BUILD,
      });
    });

    it("fija el modo conectado: aviso y servidor autónomo prendidos, modo dev apagado y sin caer a datos simulados", () => {
      expect(VARIABLES_DEL_BUILD).toMatchObject({ NEXT_PUBLIC_DEMO_SUPABASE_DEV: "1", NEXT_PUBLIC_MODO_DEV: "0", PANEL_EXIGIR_SUPABASE: "1" });
      expect(VARIABLES_DEL_BUILD).not.toHaveProperty("DEPLOY_PAGES");
      expect(VARIABLES_DEL_BUILD).not.toHaveProperty("PANEL_DATOS_SIMULADOS");
    });
  });

  it("archivosEnvProhibidos deja pasar los de ejemplo", () => {
    expect(archivosEnvProhibidos([".env", ".env.local", ".env.example", "README.md"])).toEqual([".env", ".env.local"]);
  });

  describe("hallazgosEnTexto", () => {
    it("deja pasar la URL del proyecto dev y la clave anónima, que el navegador necesita", () => {
      expect(hallazgosEnTexto(`createClient("${URL_PROYECTO_DEV}", "${JWT_ANON}"); "${PUBLISHABLE}"`)).toEqual([]);
      expect(hallazgosEnTexto('hostname.endsWith(".supabase.co") // el servicio de service_role')).toEqual([]);
    });

    it("rechaza un JWT de servicio, una clave secreta y la URL de otro proyecto", () => {
      expect(hallazgosEnTexto(`k="${JWT_SERVICIO}"`)).toEqual([expect.stringContaining("JWT que no es de la clave anónima")]);
      expect(hallazgosEnTexto("k=sb_secret_AbCdEfGhIjKlMnOp")).toEqual([expect.stringContaining("sb_secret_")]);
      expect(hallazgosEnTexto("https://otroproyecto.supabase.co/rest/v1")).toEqual([expect.stringContaining("no es el de desarrollo")]);
    });

    it("rechaza el nombre de la variable de la clave de servicio", () => {
      expect(hallazgosEnTexto("SUPABASE_SERVICE_ROLE_KEY=x")).toEqual([expect.stringContaining("clave de servicio")]);
    });
  });

  describe("hallazgosEnArchivoDeTexto (README y demás archivos que no son el código compilado)", () => {
    // Valores ficticios: la contraseña real de la cuenta demo no está en el repo, tampoco en los tests.
    it.each([
      "Contraseña: Ficticia-123",
      "contraseña = Ficticia123",
      "Contrasena:Ficticia123",
      "password: Ficticia123",
      'PASSWORD="Ficticia123"',
      "- Contraseña: `Ficticia123`",
    ])("rechaza una contraseña escrita: %s", (texto) => {
      expect(hallazgosEnArchivoDeTexto(`Cuenta demo
${texto}
`)).toEqual([expect.stringContaining("contraseña escrita")]);
    });

    it("sigue rechazando las claves", () => {
      expect(hallazgosEnArchivoDeTexto(`k=${JWT_SERVICIO}`)).toEqual([expect.stringContaining("JWT que no es de la clave anónima")]);
    });

    it("deja pasar el texto que manda a pedir la contraseña, sin ningún valor", () => {
      expect(hallazgosEnArchivoDeTexto("La contraseña de la cuenta demo te la da Cristian.")).toEqual([]);
      expect(hallazgosEnArchivoDeTexto("Correo: coordinador.demo@example.com")).toEqual([]);
    });
  });

  describe("README del artefacto", () => {
    const readme = readmeDelArtefacto({ commit: "abc123", fecha: "2026-10-28T00:00:00.000Z" });

    it("dice cómo servirlo, que necesita Node y el correo de la cuenta demo, y manda a pedir la contraseña", () => {
      expect(readme).toContain(AVISO_DEMO_TEXTO);
      expect(readme).toContain("node server.js");
      expect(readme).toContain("localhost:3000");
      expect(readme).toContain(CUENTA_DEMO.correo);
      expect(readme).toContain("La contraseña de la cuenta demo te la da Cristian");
      expect(readme).toContain("abc123");
    });

    it("no lleva claves, ni la URL de otro proyecto, ni ninguna contraseña", () => {
      expect(hallazgosEnArchivoDeTexto(readme)).toEqual([]);
      expect(CUENTA_DEMO).not.toHaveProperty("contrasena");
    });
  });

  it("robots.txt bloquea todo", () => {
    expect(ROBOTS_TXT).toBe("User-agent: *\nDisallow: /\n");
  });

  it("el texto del aviso es el que está en el componente del panel", () => {
    const componente = leer("src/shell/AvisoVersionDePrueba.tsx");
    expect(componente).toContain(AVISO_DEMO_TEXTO);
  });
});

describe("el workflow del artefacto", () => {
  const workflow = leer(".github/workflows/demo-supabase-dev.yml");
  const ci = leer(".github/workflows/ci.yml");
  const pages = leer(".github/workflows/deploy-pages.yml");
  const staging = leer(".github/workflows/staging.yml");
  const produccion = leer(".github/workflows/production.yml");

  it("corre solo en develop o staging, a mano o desde staging.yml, y no publica en Pages ni en ningún hosting", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("workflow_call:");
    // Ya no corre en cada push a develop: el CI de develop no compila (los builds de despliegue van por staging.yml).
    expect(workflow).not.toMatch(/^\s*push:/m);
    expect(workflow).toContain("if: github.ref == 'refs/heads/develop' || github.ref == 'refs/heads/staging'");
    expect(workflow).not.toMatch(/deploy-pages|upload-pages-artifact|configure-pages|pages: write|id-token/);
    expect(staging).toContain("uses: ./.github/workflows/demo-supabase-dev.yml");
  });

  it("producción nunca compila con el proyecto dev ni sin Supabase", () => {
    expect(produccion).toContain("SUPABASE_REF_DEV: ohdsavwpasfpapbyutrv");
    expect(produccion).toContain('PANEL_EXIGIR_SUPABASE: "1"');
    expect(produccion).toContain("if: github.ref == 'refs/heads/production'");
  });

  it("sube el artefacto panel-supabase-dev por 7 días, con la carpeta oculta .next", () => {
    expect(workflow).toContain("name: panel-supabase-dev");
    expect(workflow).toContain("retention-days: 7");
    expect(workflow).toContain("include-hidden-files: true");
  });

  it("solo usa las variables públicas del repo, nunca secrets", () => {
    expect(workflow).toContain("vars.SUPABASE_URL");
    expect(workflow).toContain("vars.SUPABASE_ANON_KEY");
    expect(workflow).not.toContain("secrets.");
  });

  it("el CI de los PR y el sitio de Pages siguen sin variables de Supabase", () => {
    for (const texto of [ci, pages]) {
      expect(texto).not.toMatch(/vars\.|secrets\./);
      expect(texto).not.toContain("SUPABASE");
    }
  });
});
