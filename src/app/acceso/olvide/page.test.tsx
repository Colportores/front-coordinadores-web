import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TEXTOS_DE_OLVIDE as T } from "@/features/acceso/textos-recuperacion";

import OlvidePagina from "./page";

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
vi.mock("@/auth/acciones-recuperacion", () => ({ pedirEnlaceAccion: vi.fn() }));

function prenderLogin() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_prueba");
}

afterEach(() => {
  navegacion.redirect.mockClear();
});

describe("/acceso/olvide (vista 40A)", () => {
  it("con login muestra «Olvidé mi contraseña»", async () => {
    prenderLogin();
    render(await OlvidePagina());
    expect(screen.getByRole("heading", { level: 1, name: T.titulo })).toBeVisible();
    expect(screen.getByLabelText(T.correo)).toBeVisible();
  });

  it("sin variables de Supabase no hay cuentas que recuperar: vuelve al inicio", async () => {
    await expect(OlvidePagina()).rejects.toThrow("REDIRECT:/inicio");
  });

  it("con las variables mal puestas muestra la pantalla (la acción dirá «no disponible»)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://un-host-cualquiera.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_prueba");
    render(await OlvidePagina());
    expect(screen.getByRole("heading", { level: 1, name: T.titulo })).toBeVisible();
  });

  it("en el sitio de prueba explica que no hay inicio de sesión, sin formulario", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
    prenderLogin();
    render(await OlvidePagina());
    expect(screen.getByText("El sitio de prueba no tiene inicio de sesión.")).toBeVisible();
    expect(screen.queryByLabelText(T.correo)).toBeNull();
  });
});
