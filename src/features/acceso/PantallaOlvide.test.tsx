import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RespuestaDelPedido } from "@/auth/acciones-recuperacion";
import { PantallaOlvide, type PropiedadesDeOlvide } from "@/features/acceso/PantallaOlvide";
import { guardarCorreoAPedir, guardarUltimoEnvio } from "@/features/acceso/recuperacion-almacen";
import { TEXTOS_DE_ACCESO } from "@/features/acceso/textos";
import { TEXTOS_DE_OLVIDE as T } from "@/features/acceso/textos-recuperacion";

/** axe en jsdom no mide contraste (no hay layout). */
async function violaciones(raiz: Element) {
  const r = await axe.run(raiz, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

function diferida<T>() {
  let resolver!: (valor: T) => void;
  let rechazar!: (error: unknown) => void;
  const promesa = new Promise<T>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

const CORREO = "marta.perez@correo.com";

function montar(propiedades: Partial<PropiedadesDeOlvide> = {}) {
  const pedir = vi.fn<PropiedadesDeOlvide["pedir"]>(async () => ({ tipo: "enviado" }));
  const resultado = render(<PantallaOlvide pedir={pedir} {...propiedades} />);
  return { ...resultado, pedir };
}

const campo = () => screen.getByLabelText(T.correo);
/** El botón principal: es el único `button` de la pantalla. */
const boton = () => screen.getByRole("button");

function sinRed(valor: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(!valor);
  act(() => {
    window.dispatchEvent(new Event(valor ? "offline" : "online"));
  });
}

beforeEach(() => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(() => {
  window.sessionStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("40A · 01 pedir el enlace", () => {
  it("el título, el texto, el correo y el botón del canvas, y un enlace de vuelta al login", () => {
    montar();
    expect(screen.getByRole("heading", { level: 1, name: T.titulo })).toBeVisible();
    expect(screen.getByText(T.texto)).toBeVisible();
    expect(campo()).toHaveValue("");
    expect(boton()).toHaveTextContent(T.enviar);
    expect(screen.getByRole("link", { name: T.volverAlLogin })).toHaveAttribute("href", "/acceso");
  });

  it("llega con el correo que ya estaba escrito en el login", () => {
    guardarCorreoAPedir(CORREO);
    montar();
    expect(campo()).toHaveValue(CORREO);
    expect(boton()).not.toHaveAttribute("aria-disabled");
  });

  it("manda el correo normalizado, muestra la respuesta neutra y guarda la hora del pedido", async () => {
    const { pedir } = montar();
    const usuario = userEvent.setup();
    await usuario.type(campo(), `  ${CORREO.toUpperCase()} `);
    await usuario.click(boton());

    expect(pedir).toHaveBeenCalledOnce();
    expect(pedir).toHaveBeenCalledWith(CORREO);
    // 05: no dice si el correo tiene cuenta.
    expect(screen.getByRole("heading", { level: 1, name: T.tituloEnviado })).toHaveFocus();
    expect(screen.getByText(T.textoEnviado(CORREO))).toBeVisible();
    expect(screen.queryByLabelText(T.correo)).toBeNull();
    expect(window.localStorage.getItem("panel-recuperacion-ultimo-envio")).not.toBeNull();
  });

  it("#217: el texto de «Revisá tu correo» vale para toda cuenta: «Si <correo> tiene una cuenta, …», sin decir de qué rol", async () => {
    montar();
    const usuario = userEvent.setup();
    await usuario.type(campo(), CORREO);
    await usuario.click(boton());
    const texto = screen.getByText(/^Si .* tiene una cuenta, te mandamos un enlace para elegir una contraseña nueva\./);
    expect(texto).toHaveTextContent(`Si ${CORREO} tiene una cuenta, te mandamos un enlace para elegir una contraseña nueva. Si no lo encontrás, mirá la carpeta de spam.`);
    expect(texto).not.toHaveTextContent(/coordinador/);
  });
});

describe("40A · 02 correo vacío", () => {
  it("«Enviar enlace» apagado y un clic o Enter no hacen nada", async () => {
    const { pedir } = montar();
    expect(boton()).toHaveAttribute("aria-disabled", "true");
    const usuario = userEvent.setup();
    await usuario.click(boton());
    await usuario.type(campo(), "{Enter}");
    expect(pedir).not.toHaveBeenCalled();
  });

  it("si lo único escrito son espacios o invisibles, sigue vacío", async () => {
    montar();
    const usuario = userEvent.setup();
    await usuario.type(campo(), "   ​");
    expect(boton()).toHaveAttribute("aria-disabled", "true");
  });
});

describe("40A · 03 correo incompleto", () => {
  it("el aviso sale al salir del campo, con el texto del canvas, y no se manda nada", async () => {
    const { pedir } = montar();
    const usuario = userEvent.setup();
    await usuario.type(campo(), "marta.perez@correo");
    expect(screen.queryByRole("alert")).toBeNull();
    await usuario.tab();
    expect(screen.getByRole("alert")).toHaveTextContent(T.correoIncompleto);
    expect(campo()).toHaveAttribute("aria-invalid", "true");
    expect(campo()).toHaveAccessibleDescription(T.correoIncompleto);

    await usuario.click(boton());
    expect(pedir).not.toHaveBeenCalled();
    expect(campo()).toHaveFocus();
  });

  it("al querer enviar sin haber salido del campo, el aviso sale y el foco vuelve al campo", async () => {
    const { pedir } = montar();
    const usuario = userEvent.setup();
    await usuario.type(campo(), "marta.perez@correo{Enter}");
    expect(pedir).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(T.correoIncompleto);
    expect(campo()).toHaveFocus();
  });

  it("con tildes, ñ o comas el aviso es el de siempre del panel", async () => {
    montar();
    const usuario = userEvent.setup();
    await usuario.type(campo(), "lucía@correo.com");
    await usuario.tab();
    expect(screen.getByRole("alert")).toHaveTextContent(TEXTOS_DE_ACCESO.correoConCaracterQueNoVa);
  });

  it("al corregirlo, el aviso se va y se puede enviar", async () => {
    const { pedir } = montar();
    const usuario = userEvent.setup();
    await usuario.type(campo(), "marta.perez@correo");
    await usuario.tab();
    await usuario.type(campo(), ".com");
    expect(screen.queryByRole("alert")).toBeNull();
    await usuario.click(boton());
    expect(pedir).toHaveBeenCalledWith("marta.perez@correo.com");
  });

  it("si el servidor dice que el correo no sirve, el aviso sale en el campo", async () => {
    const { pedir } = montar();
    pedir.mockResolvedValue({ tipo: "correo-invalido" });
    const usuario = userEvent.setup();
    await usuario.type(campo(), CORREO);
    await usuario.click(boton());
    expect(screen.getByRole("alert")).toHaveTextContent(T.correoIncompleto);
    expect(boton()).not.toHaveAttribute("aria-disabled");
  });
});

describe("40A · 04 enviando", () => {
  it("campo y botón apagados hasta la respuesta, y un doble toque o Enter manda una sola vez", async () => {
    const respuesta = diferida<RespuestaDelPedido>();
    const pedir = vi.fn(() => respuesta.promesa);
    montar({ pedir });
    const usuario = userEvent.setup();
    await usuario.type(campo(), CORREO);
    await usuario.click(boton());
    expect(boton()).toHaveTextContent(T.enviando);
    expect(boton()).toHaveAttribute("aria-disabled", "true");
    expect(campo()).toBeDisabled();
    await usuario.click(boton());
    fireEvent.submit(boton().closest("form")!);
    expect(pedir).toHaveBeenCalledOnce();

    await act(async () => respuesta.resolver({ tipo: "enviado" }));
    expect(screen.getByRole("heading", { level: 1, name: T.tituloEnviado })).toBeVisible();
  });
});

describe("40A · 05 enviado y el reenvío", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("«Reenviar en N s» baja cada segundo, apagado, y a los 60 s sirve de nuevo", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const { pedir } = montar();
    fireEvent.change(campo(), { target: { value: CORREO } });
    await act(async () => fireEvent.click(boton()));
    expect(boton()).toHaveTextContent(T.reenviarEn(60));
    expect(boton()).toHaveAttribute("aria-disabled", "true");

    await act(async () => vi.advanceTimersByTime(6000));
    expect(boton()).toHaveTextContent(T.reenviarEn(54));
    // Apagado: un clic no manda.
    await act(async () => fireEvent.click(boton()));
    expect(pedir).toHaveBeenCalledOnce();

    await act(async () => vi.advanceTimersByTime(54_000));
    expect(boton()).toHaveTextContent(T.reenviar);
    expect(boton()).not.toHaveAttribute("aria-disabled");

    await act(async () => fireEvent.click(boton()));
    expect(pedir).toHaveBeenCalledTimes(2);
    expect(pedir).toHaveBeenLastCalledWith(CORREO);
    // Vuelve a contar y el lector oye que salió.
    expect(boton()).toHaveTextContent(T.reenviarEn(60));
    expect(screen.getByText(T.reenviado)).toBeInTheDocument();
  });

  it("si el reenvío falla, el botón vuelve a habilitarse con «Reintentar» y nada queda trabado", async () => {
    vi.useFakeTimers();
    const { pedir } = montar();
    fireEvent.change(campo(), { target: { value: CORREO } });
    await act(async () => fireEvent.click(boton()));
    await act(async () => vi.advanceTimersByTime(60_000));

    pedir.mockRejectedValueOnce(new Error("se cortó"));
    await act(async () => fireEvent.click(boton()));
    expect(screen.getByRole("alert")).toHaveTextContent(T.noDisponible);
    expect(boton()).toHaveTextContent(T.reintentar);
    expect(boton()).not.toHaveAttribute("aria-disabled");

    await act(async () => fireEvent.click(boton()));
    expect(pedir).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("40A · 06 espera vigente al volver", () => {
  it("el botón apagado y «Podés pedir otro enlace en N s.», sin llamar al servidor", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-22T12:00:00Z"), shouldAdvanceTime: false });
    guardarUltimoEnvio(Date.now() - 22_000);
    const { pedir } = montar();
    expect(screen.getByText(T.espera(38))).toBeVisible();
    expect(boton()).toHaveAttribute("aria-disabled", "true");
    expect(boton()).toHaveTextContent(T.enviar);

    // El formulario sigue editable.
    fireEvent.change(campo(), { target: { value: CORREO } });
    await act(async () => fireEvent.click(boton()));
    expect(pedir).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTime(38_000));
    expect(screen.queryByText(/Podés pedir otro enlace/)).toBeNull();
    expect(boton()).not.toHaveAttribute("aria-disabled");
  });

  it("una hora guardada en el futuro (reloj atrasado) espera 60 s como máximo", () => {
    vi.useFakeTimers({ now: new Date("2026-11-22T12:00:00Z"), shouldAdvanceTime: false });
    guardarUltimoEnvio(Date.now() + 3 * 3600_000);
    montar();
    expect(screen.getByText(T.espera(60))).toBeVisible();
  });

  it("volver a la pantalla (desmontar y montar) mantiene la espera", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-22T12:00:00Z"), shouldAdvanceTime: false });
    const primera = montar();
    fireEvent.change(campo(), { target: { value: CORREO } });
    await act(async () => fireEvent.click(boton()));
    primera.unmount();

    await act(async () => vi.advanceTimersByTime(20_000));
    montar();
    expect(screen.getByText(T.espera(40))).toBeVisible();
  });
});

describe("40A · 07 sin conexión y 08 no disponible", () => {
  it("sin conexión: el cartel punteado, el botón apagado y no se manda nada", async () => {
    const { pedir } = montar();
    const usuario = userEvent.setup();
    await usuario.type(campo(), CORREO);
    sinRed(true);
    expect(screen.getByRole("status")).toHaveTextContent(T.sinConexion);
    expect(boton()).toHaveAttribute("aria-disabled", "true");
    await usuario.click(boton());
    expect(pedir).not.toHaveBeenCalled();

    sinRed(false);
    expect(screen.queryByRole("status")).toBeNull();
    await usuario.click(boton());
    expect(pedir).toHaveBeenCalledOnce();
  });

  it("servicio no disponible: el aviso, «Reintentar», lo escrito queda y no se guarda ninguna espera", async () => {
    const { pedir } = montar();
    pedir.mockResolvedValueOnce({ tipo: "no-disponible" });
    const usuario = userEvent.setup();
    await usuario.type(campo(), CORREO);
    await usuario.click(boton());

    expect(screen.getByRole("alert")).toHaveTextContent(T.noDisponible);
    expect(boton()).toHaveTextContent(T.reintentar);
    expect(boton()).not.toHaveAttribute("aria-disabled");
    expect(campo()).toHaveValue(CORREO);
    expect(campo()).toHaveFocus();
    expect(window.localStorage.getItem("panel-recuperacion-ultimo-envio")).toBeNull();

    await usuario.click(boton());
    expect(pedir).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("heading", { level: 1, name: T.tituloEnviado })).toBeVisible();
  });

  it("la acción que tira a mitad de camino deja el botón habilitado", async () => {
    const { pedir } = montar();
    pedir.mockRejectedValueOnce(new Error("se cortó"));
    const usuario = userEvent.setup();
    await usuario.type(campo(), CORREO);
    await usuario.click(boton());
    expect(screen.getByRole("alert")).toHaveTextContent(T.noDisponible);
    expect(boton()).not.toHaveAttribute("aria-disabled");
    expect(campo()).toBeEnabled();
  });
});

describe("40A · datos límite", () => {
  it("un correo larguísimo se corta en la caja, no la desborda", async () => {
    const largo = `${"x".repeat(60)}@${"y".repeat(60)}.com`;
    montar();
    fireEvent.change(campo(), { target: { value: largo } });
    await act(async () => fireEvent.click(boton()));
    expect(screen.getByText(T.textoEnviado(largo)).className).toContain("wrap-anywhere");
  });
});

describe("vista 40A · accesibilidad (axe A/AA, sin contraste)", () => {
  it("el formulario, con el aviso de correo incompleto, enviando, sin conexión y enviado", async () => {
    const respuesta = diferida<RespuestaDelPedido>();
    const { container } = montar({ pedir: vi.fn(() => respuesta.promesa) });
    expect(await violaciones(container)).toEqual([]);

    const usuario = userEvent.setup();
    await usuario.type(campo(), "marta@correo");
    await usuario.tab();
    expect(await violaciones(container)).toEqual([]);

    await usuario.clear(campo());
    await usuario.type(campo(), CORREO);
    await usuario.click(boton());
    expect(await violaciones(container)).toEqual([]);

    await act(async () => respuesta.resolver({ tipo: "enviado" }));
    expect(await violaciones(container)).toEqual([]);

    sinRed(true);
    expect(await violaciones(container)).toEqual([]);
  });
});
