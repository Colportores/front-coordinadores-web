import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TEXTOS_DE_NUEVA_CONTRASENA as T } from "@/features/acceso/textos-recuperacion";

import NuevaContrasenaPagina from "./page";

/** QA de #217: más formas raras de la URL del enlace (`token_hash` repetido, `type` en mayúsculas, `error=` del servicio). */

vi.mock("next/navigation", () => ({
  redirect: (ruta: string) => {
    throw new Error(`REDIRECT:${ruta}`);
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: React.ComponentProps<"a">) => (
    <a href={href} {...resto}>
      {children}
    </a>
  ),
}));
const acciones = vi.hoisted(() => ({
  abrirEnlaceAccion: vi.fn(async () => ({ tipo: "ok", correo: "marta@correo.com" })),
  guardarContrasenaAccion: vi.fn(),
  cerrarOtrasSesionesAccion: vi.fn(),
}));
vi.mock("@/auth/acciones-recuperacion", () => acciones);
vi.mock("@/auth/recuperacion-servidor", () => ({ recuperacionEnCurso: vi.fn(async () => null) }));

const consulta = (valores: Record<string, string | string[] | undefined>) =>
  ({ params: Promise.resolve({}), searchParams: Promise.resolve(valores) }) as unknown as PageProps<"/acceso/nueva-contrasena">;

afterEach(() => {
  acciones.abrirEnlaceAccion.mockClear();
  vi.unstubAllEnvs();
});

function prenderLogin() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_prueba");
}

describe("QA #217 · /acceso/nueva-contrasena con `token_hash`", () => {
  it("con `error=` del servicio (enlace vencido que Supabase ya marcó) no canjea aunque traiga `token_hash` y `type`", async () => {
    prenderLogin();
    render(await NuevaContrasenaPagina(consulta({ error: "access_denied", token_hash: "h", type: "recovery" })));
    expect(screen.getByRole("heading", { level: 1, name: T.tituloNoValido })).toBeVisible();
    expect(acciones.abrirEnlaceAccion).not.toHaveBeenCalled();
  });

  it("`token_hash` repetido canjea el primero; `type` en mayúsculas o repetido con otro primero no vale", async () => {
    prenderLogin();
    render(await NuevaContrasenaPagina(consulta({ token_hash: ["primero", "segundo"], type: ["recovery", "signup"] })));
    expect(await screen.findByText(T.para("marta@correo.com"))).toBeVisible();
    expect(acciones.abrirEnlaceAccion).toHaveBeenCalledWith("primero", "un-solo-uso");
  });

  it.each([{ type: "RECOVERY" }, { type: ["signup", "recovery"] }, { type: "recovery " }])("`type` %j no es de esta pantalla: «Enlace no válido» sin canjear", async (extra) => {
    prenderLogin();
    render(await NuevaContrasenaPagina(consulta({ token_hash: "h", ...extra })));
    expect(screen.getByRole("heading", { level: 1, name: T.tituloNoValido })).toBeVisible();
    expect(acciones.abrirEnlaceAccion).not.toHaveBeenCalled();
  });

  it("un `token_hash` con espacios o caracteres especiales llega tal cual al canje (no se recorta ni se reescribe)", async () => {
    prenderLogin();
    const raro = "a b%2Fc+d=é😀";
    render(await NuevaContrasenaPagina(consulta({ token_hash: raro, type: "recovery" })));
    await screen.findByText(T.para("marta@correo.com"));
    expect(acciones.abrirEnlaceAccion).toHaveBeenCalledWith(raro, "un-solo-uso");
  });
});
