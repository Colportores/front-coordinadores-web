import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RespuestaDeApertura } from "@/auth/acciones-recuperacion";
import { PantallaNuevaContrasena, type PropiedadesDeNuevaContrasena } from "@/features/acceso/PantallaNuevaContrasena";
import { TEXTOS_DE_NUEVA_CONTRASENA as T } from "@/features/acceso/textos-recuperacion";

/**
 * QA de #217 (el enlace del correo abre en cualquier navegador, canvas 40B·06): reintentos, doble montaje y los dos textos de
 * «Enlace no válido» (el del canvas y el de un `?code=` viejo sin verificador).
 */

const CORREO = "marta.perez@correo.com";

function montar(abrir: PropiedadesDeNuevaContrasena["abrir"], inicial: PropiedadesDeNuevaContrasena["inicial"], estricto = false) {
  const guardar = vi.fn<PropiedadesDeNuevaContrasena["guardar"]>(async () => ({ tipo: "ok" }));
  const cerrarOtras = vi.fn<PropiedadesDeNuevaContrasena["cerrarOtras"]>(async () => ({ tipo: "ok" }));
  const pantalla = <PantallaNuevaContrasena inicial={inicial} abrir={abrir} guardar={guardar} cerrarOtras={cerrarOtras} />;
  return render(estricto ? <StrictMode>{pantalla}</StrictMode> : pantalla);
}

beforeEach(() => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("QA #217 · enlace de un solo uso (40B)", () => {
  it("40B·06: con el enlace de un solo uso vencido dice el texto del canvas y ofrece «Solicitar un enlace nuevo»", async () => {
    const abrir = vi.fn(async (): Promise<RespuestaDeApertura> => ({ tipo: "no-valido" }));
    montar(abrir, { paso: "abrir", codigo: "h-vencido", tipo: "un-solo-uso" });
    expect(await screen.findByRole("heading", { level: 1, name: "Enlace no válido" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Este enlace ya no sirve: venció o ya se usó. Solicitá uno nuevo.");
    expect(screen.getByRole("link", { name: "Solicitar un enlace nuevo" })).toBeVisible();
    expect(screen.queryByText(/navegador donde lo pediste/)).not.toBeInTheDocument();
    expect(abrir).toHaveBeenCalledWith("h-vencido", "un-solo-uso");
  });

  it("un `?code=` viejo sin verificador sí dice el texto del navegador, y un código de un solo uso nunca", async () => {
    const abrir = vi.fn(async (): Promise<RespuestaDeApertura> => ({ tipo: "no-valido", sinVerificador: true }));
    montar(abrir, { paso: "abrir", codigo: "c-viejo" });
    expect(await screen.findByRole("alert")).toHaveTextContent("Abrilo en el navegador donde lo pediste");
    expect(abrir).toHaveBeenCalledWith("c-viejo");
  });

  it("falla de red al abrir: «Reintentar» canjea de nuevo con el mismo tipo y, si abre, muestra «Nueva contraseña»", async () => {
    const usuario = userEvent.setup();
    let intento = 0;
    const abrir = vi.fn(async (): Promise<RespuestaDeApertura> => (++intento === 1 ? { tipo: "no-disponible" } : { tipo: "ok", correo: CORREO }));
    montar(abrir, { paso: "abrir", codigo: "h-1", tipo: "un-solo-uso" });
    const reintentar = await screen.findByRole("button", { name: /Reintentar/ });
    await usuario.click(reintentar);
    expect(await screen.findByText(T.para(CORREO))).toBeVisible();
    expect(abrir).toHaveBeenCalledTimes(2);
    expect(abrir.mock.calls[1]).toEqual(["h-1", "un-solo-uso"]);
  });

  it("doble toque en «Reintentar» no canjea el código dos veces a la vez", async () => {
    const usuario = userEvent.setup();
    let intento = 0;
    let soltar!: () => void;
    const abrir = vi.fn(async (): Promise<RespuestaDeApertura> => {
      if (++intento === 1) return { tipo: "no-disponible" };
      await new Promise<void>((r) => (soltar = r));
      return { tipo: "ok", correo: CORREO };
    });
    montar(abrir, { paso: "abrir", codigo: "h-2", tipo: "un-solo-uso" });
    const reintentar = await screen.findByRole("button", { name: /Reintentar/ });
    await usuario.dblClick(reintentar);
    soltar();
    expect(await screen.findByText(T.para(CORREO))).toBeVisible();
    expect(abrir).toHaveBeenCalledTimes(2);
  });

  it("el doble montaje de React (desarrollo) canjea el código de un solo uso una sola vez", async () => {
    const abrir = vi.fn(async (): Promise<RespuestaDeApertura> => ({ tipo: "ok", correo: CORREO }));
    montar(abrir, { paso: "abrir", codigo: "h-3", tipo: "un-solo-uso" }, true);
    expect(await screen.findByText(T.para(CORREO))).toBeVisible();
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it("40B·06 mientras canjea: dice qué pasa (no un spinner mudo) y el foco acaba en el título cuando falla", async () => {
    let soltar!: (r: RespuestaDeApertura) => void;
    const abrir = vi.fn(() => new Promise<RespuestaDeApertura>((r) => (soltar = r)));
    montar(abrir, { paso: "abrir", codigo: "h-4", tipo: "un-solo-uso" });
    expect(screen.getByRole("status")).toHaveTextContent(T.verificando);
    soltar({ tipo: "no-valido" });
    const titulo = await screen.findByRole("heading", { level: 1, name: "Enlace no válido" });
    expect(document.activeElement).toBe(titulo);
  });
});
