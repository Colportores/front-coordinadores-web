import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RespuestaDeInicio } from "@/auth/acciones";
import { PantallaDeAcceso, type PropiedadesDeAcceso } from "@/features/acceso/PantallaDeAcceso";
import { TEXTOS_DE_ACCESO as T } from "@/features/acceso/textos";

/**
 * QA del PR #103 (issue #18, vista 38). Los tests con `skip` documentan un hallazgo del QA: el implementador saca el `skip`
 * cuando lo arregla. El resto queda como regresión.
 */

const CORREO = "marta.perez@correo.com";
const CLAVE = "una-clave-larga";

function montar(propiedades: Partial<PropiedadesDeAcceso> = {}) {
  const iniciar = vi.fn<PropiedadesDeAcceso["iniciar"]>(async () => ({ tipo: "ok", destino: "/inicio" }));
  const cerrar = vi.fn<PropiedadesDeAcceso["cerrar"]>(async () => ({ tipo: "cerrada" }));
  const irA = vi.fn();
  const resultado = render(
    <PantallaDeAcceso motivo={null} siguiente="/inicio" iniciar={iniciar} cerrar={cerrar} irA={irA} {...propiedades} />,
  );
  return { ...resultado, iniciar, cerrar, irA };
}

const campoCorreo = () => screen.getByLabelText(T.correo);
const campoClave = () => screen.getByLabelText(T.contrasena);
const boton = () => screen.getByRole("button");

async function escribir(usuario: ReturnType<typeof userEvent.setup>, correo = CORREO, clave = CLAVE) {
  await usuario.type(campoCorreo(), correo);
  await usuario.type(campoClave(), clave);
}

/**
 * Lo que hace el navegador y jsdom no: al apagarse (`disabled`) el campo que tenía el foco, el foco se va al `<body>`. Se
 * simula al empezar el envío (los campos se apagan en ese mismo render). Comprobado con Chromium real.
 */
function perderFocoAlEnviar(): void {
  (document.activeElement as HTMLElement | null)?.blur();
}

beforeEach(() => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("QA #18 · el foco después de un error (Enter desde la contraseña)", () => {
  it("credenciales incorrectas: el foco vuelve al correo (control, ya funciona)", async () => {
    const iniciar = vi.fn<PropiedadesDeAcceso["iniciar"]>(async () => {
      perderFocoAlEnviar();
      return { tipo: "credenciales-invalidas" };
    });
    montar({ iniciar });
    const usuario = userEvent.setup();
    await escribir(usuario);
    await usuario.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByText(T.credenciales)).toBeInTheDocument());
    expect(campoCorreo()).toHaveFocus();
  });

  it("QA #18: servicio no disponible: el foco no se pierde en el <body> (Chromium: document.activeElement = BODY)", async () => {
    const iniciar = vi.fn<PropiedadesDeAcceso["iniciar"]>(async () => {
      perderFocoAlEnviar();
      return { tipo: "no-disponible" };
    });
    montar({ iniciar });
    const usuario = userEvent.setup();
    await escribir(usuario);
    await usuario.keyboard("{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(T.noDisponible);
    expect(document.activeElement).not.toBe(document.body);
  });

  it("QA #18: la acción no llega al servidor: el foco no se pierde en el <body> (Chromium: BODY)", async () => {
    const iniciar = vi.fn<PropiedadesDeAcceso["iniciar"]>(async () => {
      perderFocoAlEnviar();
      throw new Error("sin red");
    });
    montar({ iniciar });
    const usuario = userEvent.setup();
    await escribir(usuario);
    await usuario.keyboard("{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(T.noDisponible);
    expect(document.activeElement).not.toBe(document.body);
  });
});

describe("QA #18 · «Reintentar» tras un servicio caído de la guarda, con algo escrito a medias", () => {
  it.skip("QA #18 (menor): con solo el correo escrito, «Reintentar» no recarga la pantalla ni pierde lo tipeado", async () => {
    const { irA } = montar({ motivo: "no-disponible", siguiente: "/equipo" });
    const usuario = userEvent.setup();
    await usuario.type(campoCorreo(), CORREO);
    await usuario.click(boton());
    expect(irA).not.toHaveBeenCalled();
    expect(campoCorreo()).toHaveValue(CORREO);
  });
});

describe("QA #18 · validación de las entradas", () => {
  it("un correo de solo espacios no habilita «Entrar» y Enter no manda nada", async () => {
    const { iniciar } = montar();
    const usuario = userEvent.setup();
    await usuario.type(campoCorreo(), "     ");
    await usuario.type(campoClave(), CLAVE);
    expect(boton()).toHaveAttribute("aria-disabled", "true");
    await usuario.keyboard("{Enter}");
    await usuario.click(boton());
    expect(iniciar).not.toHaveBeenCalled();
    expect(screen.getByText(T.pieVacio)).toBeInTheDocument();
  });

  it("solo la contraseña, o solo el correo: Enter desde cualquier campo no manda nada", async () => {
    const { iniciar } = montar();
    const usuario = userEvent.setup();
    await usuario.type(campoClave(), CLAVE);
    await usuario.keyboard("{Enter}");
    await usuario.clear(campoClave());
    await usuario.type(campoCorreo(), CORREO);
    await usuario.keyboard("{Enter}");
    expect(iniciar).not.toHaveBeenCalled();
  });

  it("el correo con espacios en los bordes y acentos se manda sin ellos (el campo `type=email` los recorta) y sin tocar el resto", async () => {
    const { iniciar } = montar();
    const usuario = userEvent.setup();
    await usuario.type(campoCorreo(), "  María.Pérez+panel@Correo.com  ");
    await usuario.type(campoClave(), "x");
    await usuario.keyboard("{Enter}");
    await waitFor(() => expect(iniciar).toHaveBeenCalledTimes(1));
    expect(iniciar.mock.calls[0][0]).toBe("María.Pérez+panel@Correo.com");
  });

  it("emoji, comillas y símbolos en la contraseña se mandan sin tocar; el campo no la muestra", async () => {
    const { iniciar } = montar();
    const usuario = userEvent.setup();
    const rara = "pä$$ 'w0rd' 🔑😀 <b>&amp;</b> fin";
    await usuario.type(campoCorreo(), CORREO);
    await usuario.type(campoClave(), rara);
    expect(campoClave()).toHaveAttribute("type", "password");
    await usuario.keyboard("{Enter}");
    await waitFor(() => expect(iniciar).toHaveBeenCalledTimes(1));
    expect(iniciar.mock.calls[0][1]).toBe(rara);
  });

  it("un correo pegado de 5000 caracteres queda en 254 (el tope del campo); la contraseña pegada no se corta", async () => {
    montar();
    const usuario = userEvent.setup();
    await usuario.click(campoCorreo());
    await usuario.paste("a".repeat(5000) + "@correo.com");
    expect((campoCorreo() as HTMLInputElement).value.length).toBe(254);
    await usuario.click(campoClave());
    await usuario.paste("p".repeat(5000));
    expect((campoClave() as HTMLInputElement).value.length).toBe(5000);
  });

  it("los campos avisan al administrador de contraseñas y el correo es de tipo email", () => {
    montar();
    expect(campoCorreo()).toHaveAttribute("autocomplete", "username");
    expect(campoClave()).toHaveAttribute("autocomplete", "current-password");
    expect(campoCorreo()).toHaveAttribute("type", "email");
  });
});

describe("QA #18 · acciones superpuestas y reentrada", () => {
  it("«Entrar con otra cuenta» apretado dos veces cierra una sola sesión", async () => {
    let soltar!: () => void;
    const cerrar = vi.fn<PropiedadesDeAcceso["cerrar"]>(
      () => new Promise((resolver) => (soltar = () => resolver({ tipo: "cerrada" }))),
    );
    montar({ motivo: "sin-acceso", correoSinAcceso: CORREO, cerrar });
    const usuario = userEvent.setup();
    await usuario.click(boton());
    await usuario.click(boton());
    expect(cerrar).toHaveBeenCalledTimes(1);
    await act(async () => soltar());
    expect(await screen.findByLabelText(T.correo)).toBeInTheDocument();
  });

  it("falla y reintento: tras «no disponible» el segundo envío entra y manda lo mismo", async () => {
    const iniciar = vi
      .fn<PropiedadesDeAcceso["iniciar"]>()
      .mockRejectedValueOnce(new Error("corte"))
      .mockResolvedValueOnce({ tipo: "ok", destino: "/equipo" } satisfies RespuestaDeInicio);
    const { irA } = montar({ iniciar, siguiente: "/equipo" });
    const usuario = userEvent.setup();
    await escribir(usuario);
    await usuario.click(boton());
    expect(await screen.findByRole("alert")).toHaveTextContent(T.noDisponible);
    expect(campoCorreo()).toHaveValue(CORREO);
    expect(campoClave()).toHaveValue(CLAVE);
    await usuario.click(boton());
    await waitFor(() => expect(irA).toHaveBeenCalledWith("/equipo"));
    expect(iniciar).toHaveBeenNthCalledWith(2, CORREO, CLAVE, "/equipo");
  });

  it("dos errores de credenciales seguidos: el aviso no se duplica", async () => {
    const iniciar = vi
      .fn<PropiedadesDeAcceso["iniciar"]>()
      .mockResolvedValueOnce({ tipo: "credenciales-invalidas" })
      .mockResolvedValueOnce({ tipo: "credenciales-invalidas" });
    montar({ iniciar });
    const usuario = userEvent.setup();
    await escribir(usuario);
    await usuario.click(boton());
    await screen.findByText(T.credenciales);
    await usuario.type(campoClave(), "x");
    await usuario.click(boton());
    await waitFor(() => expect(iniciar).toHaveBeenCalledTimes(2));
    expect(await screen.findAllByRole("alert")).toHaveLength(1);
    expect(screen.getAllByText(T.credenciales)).toHaveLength(1);
  });
});

describe("QA #18 · los estados y sus avisos", () => {
  it("vencida, cerrada, no disponible y sin conexión muestran un solo aviso, con el rol que corresponde", () => {
    const casos: [PropiedadesDeAcceso["motivo"], string, "status" | "alert"][] = [
      ["vencida", T.sesionVencida, "status"],
      ["cerrada", T.sesionCerrada, "status"],
      ["no-disponible", T.noDisponible, "alert"],
    ];
    for (const [motivo, texto, rol] of casos) {
      const { unmount } = montar({ motivo });
      expect(screen.getAllByRole(rol)).toHaveLength(1);
      expect(screen.getByRole(rol)).toHaveTextContent(texto);
      expect(screen.queryAllByRole(rol === "alert" ? "status" : "alert")).toHaveLength(0);
      unmount();
    }
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    montar();
    expect(screen.getByRole("status")).toHaveTextContent(T.sinConexion);
  });

  it("«Entrando…» se anuncia en una región viva y el botón queda apagado sin quitarle el foco", async () => {
    let soltar!: (r: RespuestaDeInicio) => void;
    const iniciar = vi.fn<PropiedadesDeAcceso["iniciar"]>(() => new Promise((resolver) => (soltar = resolver)));
    montar({ iniciar });
    const usuario = userEvent.setup();
    await escribir(usuario);
    await usuario.click(boton());
    expect(boton()).toHaveAttribute("aria-disabled", "true");
    expect(boton()).toHaveFocus();
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent(T.entrando);
    await act(async () => soltar({ tipo: "credenciales-invalidas" }));
  });
});

describe("QA #18 · privacidad", () => {
  it("el correo y la contraseña no salen a la consola ni a las advertencias al fallar", async () => {
    const espias = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const iniciar = vi
      .fn<PropiedadesDeAcceso["iniciar"]>()
      .mockRejectedValueOnce(new Error("corte"))
      .mockResolvedValueOnce({ tipo: "credenciales-invalidas" });
    montar({ iniciar });
    const usuario = userEvent.setup();
    await escribir(usuario);
    await usuario.click(boton());
    await screen.findByRole("alert");
    await usuario.click(boton());
    await screen.findByText(T.credenciales);
    const salida = JSON.stringify(espias.flatMap((e) => e.mock.calls));
    expect(salida).not.toContain(CLAVE);
    expect(salida).not.toContain(CORREO);
  });

  it("la contraseña no queda en el HTML de la pantalla tras «sin acceso»", async () => {
    const iniciar = vi.fn<PropiedadesDeAcceso["iniciar"]>(async () => ({ tipo: "sin-acceso" }));
    const { container } = montar({ iniciar });
    const usuario = userEvent.setup();
    await escribir(usuario);
    await usuario.click(boton());
    await screen.findByRole("heading", { name: T.tituloSinAcceso });
    expect(container.innerHTML).not.toContain(CLAVE);
  });
});
