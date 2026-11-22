import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TEXTOS_DE_NUEVA_CONTRASENA as T } from "@/features/acceso/textos-recuperacion";

import NuevaContrasenaPagina from "./page";

const navegacion = vi.hoisted(() => ({
  redirect: vi.fn((ruta: string) => {
    throw new Error(`REDIRECT:${ruta}`);
  }),
}));
vi.mock("next/navigation", () => ({ redirect: navegacion.redirect }));
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
}));
vi.mock("@/auth/acciones-recuperacion", () => acciones);
const servidor = vi.hoisted(() => ({ enCurso: null as { id: string; correo: string } | null }));
vi.mock("@/auth/recuperacion-servidor", () => ({ recuperacionEnCurso: vi.fn(async () => servidor.enCurso) }));

const consulta = (valores: Record<string, string | string[] | undefined>) =>
  ({ params: Promise.resolve({}), searchParams: Promise.resolve(valores) }) as unknown as PageProps<"/acceso/nueva-contrasena">;

function prenderLogin() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_prueba");
}

afterEach(() => {
  navegacion.redirect.mockClear();
  acciones.abrirEnlaceAccion.mockClear();
  servidor.enCurso = null;
});

describe("/acceso/nueva-contrasena (vista 40B)", () => {
  it("con el código del enlace lo canjea y muestra «Nueva contraseña»", async () => {
    prenderLogin();
    render(await NuevaContrasenaPagina(consulta({ code: "c-del-correo" })));
    expect(await screen.findByText(T.para("marta@correo.com"))).toBeVisible();
    expect(acciones.abrirEnlaceAccion).toHaveBeenCalledWith("c-del-correo");
  });

  it("sin código ni recuperación en curso: «Enlace no válido»", async () => {
    prenderLogin();
    render(await NuevaContrasenaPagina(consulta({})));
    expect(screen.getByRole("heading", { level: 1, name: T.tituloNoValido })).toBeVisible();
    expect(acciones.abrirEnlaceAccion).not.toHaveBeenCalled();
  });

  it("sin código pero con la recuperación en curso (se recargó): sigue en «Nueva contraseña» sin canjear nada", async () => {
    prenderLogin();
    servidor.enCurso = { id: "u-1", correo: "marta@correo.com" };
    render(await NuevaContrasenaPagina(consulta({})));
    expect(screen.getByText(T.para("marta@correo.com"))).toBeVisible();
    expect(screen.getByLabelText(T.nueva)).toBeVisible();
    expect(acciones.abrirEnlaceAccion).not.toHaveBeenCalled();
  });

  it("un `?error=` de Supabase (enlace vencido) es «Enlace no válido», aunque haya recuperación en curso o código", async () => {
    prenderLogin();
    servidor.enCurso = { id: "u-1", correo: "marta@correo.com" };
    render(await NuevaContrasenaPagina(consulta({ error: "access_denied", error_code: "otp_expired", code: "x" })));
    expect(screen.getByRole("heading", { level: 1, name: T.tituloNoValido })).toBeVisible();
  });

  it("un código vacío, repetido en la URL o larguísimo no se canjea", async () => {
    prenderLogin();
    const { unmount } = render(await NuevaContrasenaPagina(consulta({ code: "" })));
    expect(screen.getByRole("heading", { level: 1, name: T.tituloNoValido })).toBeVisible();
    unmount();
    render(await NuevaContrasenaPagina(consulta({ code: "x".repeat(2000) })));
    expect(screen.getByRole("heading", { level: 1, name: T.tituloNoValido })).toBeVisible();
    expect(acciones.abrirEnlaceAccion).not.toHaveBeenCalled();
  });

  it("sin variables de Supabase vuelve al inicio", async () => {
    await expect(NuevaContrasenaPagina(consulta({ code: "c" }))).rejects.toThrow("REDIRECT:/inicio");
  });

  it("en el sitio de prueba explica que no hay inicio de sesión, sin formulario", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
    prenderLogin();
    render(await NuevaContrasenaPagina(consulta({ code: "c" })));
    expect(screen.getByText("El sitio de prueba no tiene inicio de sesión.")).toBeVisible();
    expect(screen.queryByLabelText(T.nueva)).toBeNull();
  });
});
