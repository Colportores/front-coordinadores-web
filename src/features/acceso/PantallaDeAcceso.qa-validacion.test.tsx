import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PantallaDeAcceso, type PropiedadesDeAcceso } from "@/features/acceso/PantallaDeAcceso";
import { TEXTOS_DE_ACCESO as T } from "@/features/acceso/textos";

/**
 * QA del PR #178 (issue #177): la validación del correo y de la contraseña del login, con sus avisos en los campos.
 * Los tests con `skip` documentan un hallazgo: el implementador saca el `skip` cuando lo arregla.
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
const avisos = () => screen.queryAllByRole("alert");

beforeEach(() => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("QA #177 · cuándo sale el aviso", () => {
  it("mientras se escribe por primera vez no sale: solo al salir del campo con algo escrito", async () => {
    montar();
    const usuario = userEvent.setup();
    await usuario.type(campoCorreo(), "marta@");
    expect(avisos()).toHaveLength(0);
    await usuario.tab();
    expect(screen.getByRole("alert")).toHaveTextContent(T.correoIncompleto);
  });

  it("el campo vacío no avisa al salir de él (Entrar apagado y el pie dicen qué falta)", async () => {
    montar();
    const usuario = userEvent.setup();
    await usuario.click(campoCorreo());
    await usuario.tab();
    await usuario.tab();
    expect(avisos()).toHaveLength(0);
    expect(screen.getByText(T.pieVacio)).toBeInTheDocument();
  });

  it("un correo de solo espacios o invisibles tampoco avisa", async () => {
    montar();
    const usuario = userEvent.setup();
    await usuario.type(campoCorreo(), "   ​ ");
    await usuario.tab();
    expect(avisos()).toHaveLength(0);
    expect(campoCorreo()).not.toHaveAttribute("aria-invalid");
  });

  it("el aviso se va solo al corregir el correo, sin salir del campo", async () => {
    montar();
    const usuario = userEvent.setup();
    await usuario.type(campoCorreo(), "marta@correo");
    await usuario.tab();
    expect(avisos()).toHaveLength(1);
    await usuario.click(campoCorreo());
    await usuario.type(campoCorreo(), ".com");
    expect(avisos()).toHaveLength(0);
    expect(campoCorreo()).not.toHaveAttribute("aria-invalid");
    expect(campoCorreo()).not.toHaveAttribute("aria-describedby");
  });

  it("vaciar el campo apaga el aviso y la primera letra nueva no lo trae de vuelta", async () => {
    montar();
    const usuario = userEvent.setup();
    await usuario.type(campoCorreo(), "lucía@correo.com");
    await usuario.tab();
    expect(screen.getByRole("alert")).toHaveTextContent(T.correoConCaracterQueNoVa);
    await usuario.clear(campoCorreo());
    expect(avisos()).toHaveLength(0);
    await usuario.type(campoCorreo(), "l");
    expect(avisos()).toHaveLength(0);
  });

  it("la contraseña corta avisa al salir del campo y el aviso dice cuántos caracteres hacen falta", async () => {
    montar();
    const usuario = userEvent.setup();
    await usuario.type(campoCorreo(), CORREO);
    await usuario.type(campoClave(), "abc1234");
    await usuario.tab();
    expect(screen.getByRole("alert")).toHaveTextContent("Revisá la contraseña: tiene que tener al menos 8 caracteres.");
    expect(campoClave()).toHaveAttribute("aria-invalid", "true");
    await usuario.type(campoClave(), "5");
    expect(avisos()).toHaveLength(0);
  });
});

describe("QA #177 · los textos de los avisos", () => {
  it("cada caso muestra su texto, sin repetir lo que se escribió", async () => {
    montar();
    const usuario = userEvent.setup();
    await usuario.type(campoCorreo(), "lucía.secreta@correo.com");
    await usuario.type(campoClave(), "corta");
    await usuario.tab();
    await usuario.click(campoClave());
    await usuario.tab();
    const alertas = avisos().map((aviso) => aviso.textContent);
    expect(alertas).toEqual([
      "Revisá el correo: no puede llevar tildes, ñ, espacios ni comas.",
      "Revisá la contraseña: tiene que tener al menos 8 caracteres.",
    ]);
    expect(document.body.textContent).not.toContain("secreta");
    // Nada de lo escrito en la contraseña viaja a un atributo visible.
    expect(document.body.innerHTML).not.toContain("corta<");
  });

  it("el correo mal armado dice qué pasa y qué hacer (un ejemplo del formato)", async () => {
    montar();
    const usuario = userEvent.setup();
    await usuario.type(campoCorreo(), "12345678");
    await usuario.tab();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "El correo no es válido. Revisá que esté completo, como nombre@correo.com.",
    );
  });
});

describe("QA #177 · con datos inválidos no se manda nada y el foco va al primer campo a revisar", () => {
  it("Enter desde la contraseña con el correo inválido: no se envía, los dos avisos salen y el foco va al correo", async () => {
    const { iniciar } = montar();
    const usuario = userEvent.setup();
    await usuario.type(campoCorreo(), "marta@correo");
    await usuario.type(campoClave(), "corta");
    await usuario.keyboard("{Enter}");
    expect(iniciar).not.toHaveBeenCalled();
    expect(avisos()).toHaveLength(2);
    expect(campoCorreo()).toHaveFocus();
    expect(campoCorreo()).toHaveAttribute("aria-invalid", "true");
    expect(campoClave()).toHaveAttribute("aria-invalid", "true");
  });

  it("clic en «Entrar» con el correo válido y la contraseña corta: el foco va a la contraseña", async () => {
    const { iniciar } = montar();
    const usuario = userEvent.setup();
    await usuario.type(campoCorreo(), CORREO);
    await usuario.type(campoClave(), "corta");
    await usuario.click(boton());
    expect(iniciar).not.toHaveBeenCalled();
    expect(campoClave()).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent(T.contrasenaCorta);
  });

  it("lo tipeado no se pierde después del aviso, y al corregir el siguiente Enter manda lo corregido una sola vez", async () => {
    const { iniciar, irA } = montar();
    const usuario = userEvent.setup();
    await usuario.type(campoCorreo(), "marta@correo");
    await usuario.type(campoClave(), CLAVE);
    await usuario.keyboard("{Enter}");
    expect(campoCorreo()).toHaveValue("marta@correo");
    expect(campoClave()).toHaveValue(CLAVE);
    await usuario.type(campoCorreo(), ".com{Enter}");
    await waitFor(() => expect(irA).toHaveBeenCalledWith("/inicio"));
    expect(iniciar).toHaveBeenCalledTimes(1);
    expect(iniciar).toHaveBeenCalledWith("marta@correo.com", CLAVE, "/inicio");
  });

  it("corregido el correo, el segundo Enter lleva el foco a la contraseña si sigue corta", async () => {
    const { iniciar } = montar();
    const usuario = userEvent.setup();
    await usuario.type(campoCorreo(), "marta@correo");
    await usuario.type(campoClave(), "corta");
    await usuario.keyboard("{Enter}");
    await usuario.type(campoCorreo(), ".com");
    await usuario.keyboard("{Enter}");
    expect(iniciar).not.toHaveBeenCalled();
    expect(campoClave()).toHaveFocus();
    expect(avisos()).toHaveLength(1);
  });

  it("el aviso es anunciable: role=alert, y aria-describedby apunta a un elemento con el texto", async () => {
    montar();
    const usuario = userEvent.setup();
    await usuario.type(campoCorreo(), "marta@correo");
    await usuario.type(campoClave(), "corta");
    await usuario.keyboard("{Enter}");
    for (const campo of [campoCorreo(), campoClave()]) {
      const id = campo.getAttribute("aria-describedby");
      expect(id).toBeTruthy();
      const descripcion = document.getElementById(id as string);
      expect(descripcion).toHaveAttribute("role", "alert");
      expect(descripcion?.textContent?.length).toBeGreaterThan(10);
    }
  });

  it("offline: «Entrar» sigue apagado y Enter no manda nada, con o sin aviso", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { iniciar } = montar();
    const usuario = userEvent.setup();
    await usuario.type(campoCorreo(), CORREO);
    await usuario.type(campoClave(), CLAVE);
    expect(boton()).toHaveAttribute("aria-disabled", "true");
    await usuario.keyboard("{Enter}");
    expect(iniciar).not.toHaveBeenCalled();
    expect(screen.getByText(T.sinConexion)).toBeInTheDocument();
  });
});

describe("QA #177 · el aviso de credenciales del intento anterior", () => {
  it("con un aviso de formato a la vista, «no son correctos» se calla; al reintentar con datos válidos se vuelve a mandar", async () => {
    const iniciar = vi
      .fn<PropiedadesDeAcceso["iniciar"]>()
      .mockResolvedValueOnce({ tipo: "credenciales-invalidas" })
      .mockResolvedValueOnce({ tipo: "ok", destino: "/inicio" });
    const { irA } = montar({ iniciar });
    const usuario = userEvent.setup();
    await usuario.type(campoCorreo(), CORREO);
    await usuario.type(campoClave(), CLAVE);
    await usuario.keyboard("{Enter}");
    expect(await screen.findByText(T.credenciales)).toBeInTheDocument();
    // El correo queda mal armado: el aviso de credenciales ya no habla de lo que está escrito.
    await usuario.click(campoCorreo());
    await usuario.type(campoCorreo(), "{Backspace}{Backspace}{Backspace}{Backspace}");
    await usuario.keyboard("{Enter}");
    expect(screen.queryByText(T.credenciales)).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(T.correoIncompleto);
    await usuario.type(campoCorreo(), ".com{Enter}");
    await waitFor(() => expect(irA).toHaveBeenCalled());
    expect(iniciar).toHaveBeenCalledTimes(2);
  });
});

describe("QA #177 · datos límite, pegados y especiales", () => {
  it("un correo pegado con espacios, mayúsculas e invisibles se manda normalizado y no avisa", async () => {
    const { iniciar } = montar();
    const usuario = userEvent.setup();
    await usuario.click(campoCorreo());
    await usuario.paste("​  Marta.Perez@Correo.COM ‏\n");
    await usuario.type(campoClave(), `${CLAVE}{Enter}`);
    await waitFor(() => expect(iniciar).toHaveBeenCalledTimes(1));
    expect(iniciar).toHaveBeenCalledWith(CORREO, CLAVE, "/inicio");
    expect(avisos()).toHaveLength(0);
  });

  it("un correo pegado de 5000 caracteres sin arroba avisa «no es válido» sin desbordar ni repetir el texto", async () => {
    const { iniciar } = montar();
    const usuario = userEvent.setup();
    await usuario.click(campoCorreo());
    await usuario.paste("a".repeat(5000));
    await usuario.type(campoClave(), `${CLAVE}{Enter}`);
    expect(iniciar).not.toHaveBeenCalled();
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent(T.correoIncompleto);
    expect(alerta.textContent?.length).toBeLessThan(120);
  });

  it("la contraseña con emoji se cuenta por visibles: 7 emoji no entran y 8 sí", async () => {
    const { iniciar } = montar();
    const usuario = userEvent.setup();
    await usuario.type(campoCorreo(), CORREO);
    await usuario.click(campoClave());
    await usuario.paste("😀".repeat(7));
    await usuario.keyboard("{Enter}");
    expect(iniciar).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(T.contrasenaCorta);
    await usuario.paste("🙂");
    await waitFor(() => expect(avisos()).toHaveLength(0));
    await usuario.keyboard("{Enter}");
    await waitFor(() => expect(iniciar).toHaveBeenCalledTimes(1));
    expect(iniciar.mock.calls[0]?.[1]).toBe("😀".repeat(7) + "🙂");
  });

  it("una contraseña de 8 espacios (el login solo mira el largo) llega al servidor, que la contesta", async () => {
    const { iniciar } = montar();
    const usuario = userEvent.setup();
    await usuario.type(campoCorreo(), CORREO);
    await usuario.click(campoClave());
    await usuario.paste(" ".repeat(8));
    await usuario.keyboard("{Enter}");
    await waitFor(() => expect(iniciar).toHaveBeenCalledTimes(1));
    expect(iniciar.mock.calls[0]?.[1]).toBe(" ".repeat(8));
  });

  it("cédula, con coma o con espacio en medio: nunca se manda", async () => {
    const { iniciar } = montar();
    const usuario = userEvent.setup();
    for (const mal of ["1.234.567-8", "marta perez@correo.com", "marta,perez@correo.com", "marta@correo.com otro"]) {
      await usuario.clear(campoCorreo());
      await usuario.type(campoCorreo(), mal);
      await usuario.type(campoClave(), `${CLAVE}{Enter}`);
      expect(avisos().length).toBeGreaterThan(0);
      await usuario.clear(campoClave());
    }
    expect(iniciar).not.toHaveBeenCalled();
  });
});

describe("QA #177 · acciones superpuestas y fallas a mitad de camino", () => {
  it("Enter seguido de un clic mientras el primero sigue en curso manda una sola vez", async () => {
    let terminar: () => void = () => undefined;
    const iniciar = vi.fn<PropiedadesDeAcceso["iniciar"]>(
      () => new Promise((resolver) => (terminar = () => resolver({ tipo: "credenciales-invalidas" }))),
    );
    montar({ iniciar });
    const usuario = userEvent.setup();
    await usuario.type(campoCorreo(), CORREO);
    await usuario.type(campoClave(), CLAVE);
    await usuario.keyboard("{Enter}");
    await usuario.click(boton());
    await usuario.click(boton());
    expect(iniciar).toHaveBeenCalledTimes(1);
    expect(boton()).toHaveTextContent(T.entrando);
    terminar();
    await screen.findByText(T.credenciales);
    expect(boton()).toHaveTextContent(T.entrar);
  });

  it("la acción falla tras un aviso de formato corregido: el botón vuelve a habilitarse y lo tipeado sigue", async () => {
    const iniciar = vi.fn<PropiedadesDeAcceso["iniciar"]>(async () => {
      throw new Error("red");
    });
    montar({ iniciar });
    const usuario = userEvent.setup();
    await usuario.type(campoCorreo(), "marta@correo");
    await usuario.type(campoClave(), CLAVE);
    await usuario.keyboard("{Enter}");
    await usuario.type(campoCorreo(), ".com{Enter}");
    expect(await screen.findByText(T.noDisponible)).toBeInTheDocument();
    expect(boton()).not.toHaveAttribute("aria-disabled");
    expect(campoCorreo()).toHaveValue("marta@correo.com");
    expect(campoClave()).toHaveValue(CLAVE);
    expect(campoCorreo()).toHaveFocus();
  });

  it("«Entrar con otra cuenta» deja los campos limpios y sin avisos viejos", async () => {
    const iniciar = vi.fn<PropiedadesDeAcceso["iniciar"]>(async () => ({ tipo: "sin-acceso" }));
    montar({ iniciar });
    const usuario = userEvent.setup();
    await usuario.type(campoCorreo(), "marta@correo");
    await usuario.type(campoClave(), "corta");
    await usuario.tab();
    await usuario.clear(campoCorreo());
    await usuario.type(campoCorreo(), CORREO);
    await usuario.clear(campoClave());
    await usuario.type(campoClave(), `${CLAVE}{Enter}`);
    await screen.findByText(T.tituloSinAcceso);
    await usuario.click(boton());
    await waitFor(() => expect(screen.getByText(T.tituloFormulario)).toBeInTheDocument());
    expect(campoCorreo()).toHaveValue("");
    await usuario.type(campoCorreo(), "x");
    expect(avisos()).toHaveLength(0);
    expect(campoCorreo()).not.toHaveAttribute("aria-invalid");
  });

  it("volver a montar la pantalla (reentrada) empieza sin avisos", async () => {
    const primera = montar();
    const usuario = userEvent.setup();
    await usuario.type(campoCorreo(), "marta@correo");
    await usuario.tab();
    expect(avisos()).toHaveLength(1);
    primera.unmount();
    montar();
    expect(avisos()).toHaveLength(0);
    expect(within(document.body).getByLabelText(T.correo)).toHaveValue("");
  });
});

describe("QA #177 · los estados que ya existían no cambian", () => {
  it("sesión vencida con el correo guardado: la contraseña corta avisa, el correo precargado no", async () => {
    sessionStorage.setItem("panel-ultimo-correo", CORREO);
    const { iniciar } = montar({ motivo: "vencida" });
    const usuario = userEvent.setup();
    expect(screen.getByRole("status")).toHaveTextContent(T.sesionVencida);
    await usuario.type(campoClave(), "corta{Enter}");
    expect(iniciar).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(T.contrasenaCorta);
    sessionStorage.clear();
  });

  it("servicio no disponible de la guarda: «Reintentar» sin nada escrito sigue recargando", async () => {
    const { irA, iniciar } = montar({ motivo: "no-disponible" });
    const usuario = userEvent.setup();
    await usuario.click(boton());
    expect(irA).toHaveBeenCalledWith("/inicio");
    expect(iniciar).not.toHaveBeenCalled();
    expect(screen.getAllByText(T.noDisponible)).toHaveLength(1);
  });
});

function luminancia(hex: string): number {
  const canal = (inicio: number) => {
    const c = Number.parseInt(hex.slice(inicio, inicio + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}

function razon(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return ((claro ?? 0) + 0.05) / ((oscuro ?? 0) + 0.05);
}

describe("QA #177 · contraste del borde de los campos (WCAG 1.4.11, preexistente de la vista 38)", () => {
  it.skip("QA #177 (menor): el borde de un campo sin error (--grafico-neutro) contra la superficie llega a 3:1", () => {
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    const token = (nombre: string) => new RegExp(String.raw`--${nombre}:\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1] ?? "";
    expect(razon(token("grafico-neutro"), token("superficie"))).toBeGreaterThanOrEqual(3);
  });

  it("el texto del aviso de error (--peligro) llega a 4,5:1 sobre la superficie y sobre el fondo de la pantalla", () => {
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    const token = (nombre: string) => new RegExp(String.raw`--${nombre}:\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1] ?? "";
    expect(razon(token("peligro"), token("superficie"))).toBeGreaterThanOrEqual(4.5);
    expect(razon(token("peligro"), token("fondo"))).toBeGreaterThanOrEqual(4.5);
  });
});
