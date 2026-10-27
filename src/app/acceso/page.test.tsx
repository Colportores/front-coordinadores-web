import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TEXTOS_DE_ACCESO as T, textoSinAcceso } from "@/features/acceso/textos";

import AccesoPagina from "./page";

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
vi.mock("@/auth/acciones", () => ({
  iniciarSesionAccion: vi.fn(),
  cerrarSesionAccion: vi.fn(),
}));
const correo = vi.hoisted(() => ({ valor: "otra@correo.com" as string | null }));
vi.mock("@/auth/correo-de-sesion", () => ({ correoDeLaSesion: vi.fn(async () => correo.valor) }));

const consulta = (valores: Record<string, string | string[] | undefined>) =>
  ({ params: Promise.resolve({}), searchParams: Promise.resolve(valores) }) as unknown as PageProps<"/acceso">;

function prenderLogin() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_prueba");
}

afterEach(() => {
  navegacion.redirect.mockClear();
  correo.valor = "otra@correo.com";
});

describe("/acceso (vista 38)", () => {
  it("con login muestra la pantalla de acceso", async () => {
    prenderLogin();
    render(await AccesoPagina(consulta({})));
    expect(screen.getByRole("heading", { level: 1, name: T.tituloFormulario })).toBeVisible();
    expect(screen.getByRole("button")).toHaveTextContent(T.entrar);
  });

  it("el motivo de la guarda elige el artboard", async () => {
    prenderLogin();
    const { unmount } = render(await AccesoPagina(consulta({ motivo: "vencida" })));
    expect(screen.getByRole("status")).toHaveTextContent(T.sesionVencida);
    unmount();

    render(await AccesoPagina(consulta({ motivo: "sin-acceso" })));
    expect(screen.getByRole("alert")).toHaveTextContent(textoSinAcceso("otra@correo.com"));
  });

  it("un motivo inventado o repetido se ignora", async () => {
    prenderLogin();
    render(await AccesoPagina(consulta({ motivo: ["x", "cerrada"] })));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("sin acceso y sin poder saber la cuenta: no inventa el correo", async () => {
    prenderLogin();
    correo.valor = null;
    render(await AccesoPagina(consulta({ motivo: "sin-acceso" })));
    expect(screen.getByRole("alert")).toHaveTextContent(textoSinAcceso(null));
  });

  it("sin variables de Supabase el panel no tiene login: vuelve al inicio", async () => {
    await expect(AccesoPagina(consulta({}))).rejects.toThrow("REDIRECT:/inicio");
  });

  it("con las variables mal puestas muestra la pantalla (no hay redirección) para decir «no disponible»", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://un-host-cualquiera.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_prueba");
    render(await AccesoPagina(consulta({ motivo: "no-disponible" })));
    expect(screen.getByRole("alert")).toHaveTextContent(T.noDisponible);
  });

  it("en el sitio de prueba explica que no hay inicio de sesión, sin formulario", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_PAGES", "1");
    prenderLogin();
    render(await AccesoPagina(consulta({})));
    expect(screen.getByText("El sitio de prueba no tiene inicio de sesión.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Ir a Inicio" })).toHaveAttribute("href", "/inicio");
    expect(screen.queryByLabelText(T.correo)).toBeNull();
  });
});
