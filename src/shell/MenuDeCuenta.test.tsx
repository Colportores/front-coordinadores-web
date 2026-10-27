import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResultadoCierre } from "@/auth/acceso";
import { MenuDeCuenta, TEXTO_CAMBIOS_SIN_GUARDAR, TEXTO_CERRANDO, TEXTO_NO_SE_PUDO_CERRAR } from "@/shell/MenuDeCuenta";
import { registrarFuente, reiniciarTrabajoPendiente } from "@/shell/trabajo-pendiente";

/** El menú del avatar con «Cerrar sesión» (vista 38, artboard 07 es adonde lleva). */

function diferida<T>() {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>((res) => {
    resolver = res;
  });
  return { promesa, resolver };
}

function montar(cerrarSesion: () => Promise<ResultadoCierre> = vi.fn(async () => ({ tipo: "cerrada" as const }))) {
  const irA = vi.fn();
  const resultado = render(<MenuDeCuenta nombre="Marta Pérez" iniciales="MP" cerrarSesion={cerrarSesion} irA={irA} />);
  return { ...resultado, irA, cerrarSesion };
}

async function abrir(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.click(screen.getByRole("button", { name: "Cuenta: Marta Pérez" }));
  return screen.findByRole("menuitem", { name: /Cerrar sesión|Cerrando/ });
}

beforeEach(() => {
  reiniciarTrabajoPendiente();
});

afterEach(() => {
  reiniciarTrabajoPendiente();
});

describe("MenuDeCuenta", () => {
  it("el avatar abre el menú con el nombre y «Cerrar sesión»", async () => {
    montar();
    const usuario = userEvent.setup();
    const item = await abrir(usuario);
    expect(item).toHaveTextContent("Cerrar sesión");
    expect(screen.getByText("Marta Pérez")).toBeVisible();
  });

  it("cierra la sesión y vuelve a la pantalla de acceso con el aviso «Cerraste sesión.», sin confirmar", async () => {
    const { irA, cerrarSesion } = montar();
    const usuario = userEvent.setup();
    await usuario.click(await abrir(usuario));
    await waitFor(() => expect(irA).toHaveBeenCalledWith("/acceso?motivo=cerrada"));
    expect(cerrarSesion).toHaveBeenCalledTimes(1);
  });

  it("si el servidor no pudo avisar pero borró la sesión, igual se sale", async () => {
    const { irA } = montar(vi.fn(async () => ({ tipo: "cerrada-sin-revocar" as const })));
    const usuario = userEvent.setup();
    await usuario.click(await abrir(usuario));
    await waitFor(() => expect(irA).toHaveBeenCalledWith("/acceso?motivo=cerrada"));
  });

  it("doble clic: se cierra una sola vez y el ítem dice «Cerrando sesión…»", async () => {
    const respuesta = diferida<ResultadoCierre>();
    const { irA, cerrarSesion } = montar(vi.fn(() => respuesta.promesa));
    const usuario = userEvent.setup();
    const item = await abrir(usuario);

    await usuario.click(item);
    await usuario.click(screen.getByRole("menuitem", { name: TEXTO_CERRANDO }));
    await usuario.keyboard("{Enter}");

    expect(cerrarSesion).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("menuitem", { name: TEXTO_CERRANDO })).toHaveAttribute("aria-disabled", "true");
    // Escape no cierra el menú mientras se cierra la sesión.
    await usuario.keyboard("{Escape}");
    expect(screen.getByRole("menuitem", { name: TEXTO_CERRANDO })).toBeVisible();

    await act(async () => respuesta.resolver({ tipo: "cerrada" }));
    expect(irA).toHaveBeenCalledTimes(1);
  });

  it("si la acción se cae (sin red): avisa, no deja el ítem trabado y se puede reintentar", async () => {
    const cerrarSesion = vi.fn<() => Promise<ResultadoCierre>>().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce({ tipo: "cerrada" });
    const { irA } = montar(cerrarSesion);
    const usuario = userEvent.setup();

    await usuario.click(await abrir(usuario));

    expect(await screen.findByRole("alert")).toHaveTextContent(TEXTO_NO_SE_PUDO_CERRAR);
    expect(irA).not.toHaveBeenCalled();
    // El menú se cerró para que el aviso se vea; al abrirlo de nuevo el ítem está disponible y el aviso viejo se va.
    const item = await abrir(usuario);
    expect(item).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByText(TEXTO_NO_SE_PUDO_CERRAR)).toBeNull();

    await usuario.click(item);
    await waitFor(() => expect(irA).toHaveBeenCalledWith("/acceso?motivo=cerrada"));
    expect(cerrarSesion).toHaveBeenCalledTimes(2);
  });

  it("con una inscripción que no salió, no cierra la sesión: se queda y lo dice (nunca se pierde una persona sin aviso)", async () => {
    const quitar = registrarFuente({ hayPorMandar: () => true, confirmar: async () => false });
    const { irA, cerrarSesion } = montar();
    const usuario = userEvent.setup();

    await usuario.click(await abrir(usuario));

    expect(await screen.findByRole("alert")).toHaveTextContent(TEXTO_CAMBIOS_SIN_GUARDAR);
    expect(cerrarSesion).not.toHaveBeenCalled();
    expect(irA).not.toHaveBeenCalled();
    quitar();
  });

  it("con una inscripción pendiente que sale bien, primero la manda y después cierra", async () => {
    const orden: string[] = [];
    let pendiente = true;
    const quitar = registrarFuente({
      hayPorMandar: () => pendiente,
      confirmar: async () => {
        orden.push("enviar");
        pendiente = false;
        return true;
      },
    });
    const cerrarSesion = vi.fn(async () => {
      orden.push("cerrar");
      return { tipo: "cerrada" as const };
    });
    const { irA } = montar(cerrarSesion);
    const usuario = userEvent.setup();

    await usuario.click(await abrir(usuario));

    await waitFor(() => expect(irA).toHaveBeenCalled());
    expect(orden).toEqual(["enviar", "cerrar"]);
    quitar();
  });

  it("volver a abrir el menú después de una falla borra el aviso viejo", async () => {
    montar(vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    const usuario = userEvent.setup();
    await usuario.click(await abrir(usuario));
    await screen.findByText(TEXTO_NO_SE_PUDO_CERRAR);

    await waitFor(() => expect(screen.queryByRole("menuitem")).toBeNull());
    await abrir(usuario);

    expect(screen.queryByText(TEXTO_NO_SE_PUDO_CERRAR)).toBeNull();
  });

  it("un nombre larguísimo no rompe el menú y el avatar se anuncia con el nombre", async () => {
    const largo = "María de los Ángeles Fernández-Rodríguez de la Torre ".repeat(3).trim();
    render(<MenuDeCuenta nombre={largo} iniciales="MA" cerrarSesion={vi.fn()} irA={vi.fn()} />);
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: `Cuenta: ${largo}` }));
    expect((await screen.findByText(largo)).className).toContain("break-words");
  });

  it("accesibilidad: sin violaciones A/AA con el menú abierto", async () => {
    montar();
    const usuario = userEvent.setup();
    await abrir(usuario);
    const resultado = await axe.run(document.body, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    expect(resultado.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});
