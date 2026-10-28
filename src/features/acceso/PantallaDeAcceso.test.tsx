import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RespuestaDeInicio } from "@/auth/acciones";
import { PantallaDeAcceso, type PropiedadesDeAcceso } from "@/features/acceso/PantallaDeAcceso";
import { TEXTOS_DE_ACCESO as T, textoSinAcceso } from "@/features/acceso/textos";

/** axe en jsdom no mide contraste (no hay layout): el contraste va en la corrida con navegador real. */
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
/** El botón principal: es el único `button` de la pantalla. */
const boton = () => screen.getByRole("button");

async function escribir(usuario: ReturnType<typeof userEvent.setup>, correo = CORREO, clave = CLAVE) {
  await usuario.type(campoCorreo(), correo);
  await usuario.type(campoClave(), clave);
}

function sinRed(valor: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(!valor);
  act(() => {
    window.dispatchEvent(new Event(valor ? "offline" : "online"));
  });
}

beforeEach(() => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("vista 38 · los ocho artboards", () => {
  it("01 · vacío: «Entrar» apagado y el pie dice cuándo se habilita", async () => {
    const { iniciar } = montar();
    expect(screen.getByRole("heading", { level: 1, name: T.tituloFormulario })).toBeVisible();
    expect(boton()).toHaveTextContent(T.entrar);
    expect(boton()).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(T.pieVacio)).toBeVisible();

    // Un clic o Enter con la pantalla vacía no manda nada.
    await userEvent.click(boton());
    expect(iniciar).not.toHaveBeenCalled();
  });

  it("«Entrar» se habilita con el correo y la contraseña escritos", async () => {
    montar();
    const usuario = userEvent.setup();
    await usuario.type(campoCorreo(), CORREO);
    expect(boton()).toHaveAttribute("aria-disabled", "true");
    await usuario.type(campoClave(), CLAVE);
    expect(boton()).not.toHaveAttribute("aria-disabled");
    expect(screen.queryByText(T.pieVacio)).toBeNull();
  });

  it("02 · entrando: campos y botón apagados hasta que llega la respuesta", async () => {
    const respuesta = diferida<RespuestaDeInicio>();
    const { iniciar, irA } = montar({ siguiente: "/equipo", iniciar: vi.fn(() => respuesta.promesa) });
    const usuario = userEvent.setup();
    await escribir(usuario);

    await usuario.click(boton());

    expect(boton()).toHaveTextContent(T.entrando);
    expect(boton()).toHaveAttribute("aria-disabled", "true");
    expect(campoCorreo()).toBeDisabled();
    expect(campoClave()).toBeDisabled();
    expect(screen.getByText(T.pieEntrando)).toBeVisible();
    expect(document.querySelector("[aria-live=polite]")).toHaveTextContent(T.entrando);
    expect(iniciar).not.toHaveBeenCalled(); // (el doble de arriba es el que se pasó por propiedad)

    await act(async () => respuesta.resolver({ tipo: "ok", destino: "/equipo" }));
    expect(irA).toHaveBeenCalledWith("/equipo");
  });

  it("03 · correo o contraseña incorrectos: un solo mensaje, sin decir cuál; los campos se conservan", async () => {
    const { iniciar } = montar({ iniciar: vi.fn(async () => ({ tipo: "credenciales-invalidas" as const })) });
    const usuario = userEvent.setup();
    await escribir(usuario);

    await usuario.click(boton());

    expect(await screen.findByRole("alert")).toHaveTextContent(T.credenciales);
    expect(campoCorreo()).toHaveAttribute("aria-invalid", "true");
    expect(campoClave()).toHaveAttribute("aria-invalid", "true");
    expect(campoCorreo()).toHaveAccessibleDescription(T.credenciales);
    expect(campoCorreo()).toHaveValue(CORREO);
    expect(campoClave()).toHaveValue(CLAVE);
    // El botón vuelve a estar listo y el foco, en el primer campo.
    expect(boton()).not.toHaveAttribute("aria-disabled");
    expect(campoCorreo()).toHaveFocus();
    void iniciar;
  });

  it("04 · sin acceso al entrar: nombra la cuenta, no muestra el formulario ni deja la contraseña", async () => {
    montar({ iniciar: vi.fn(async () => ({ tipo: "sin-acceso" as const })) });
    const usuario = userEvent.setup();
    await escribir(usuario);

    await usuario.click(boton());

    expect(await screen.findByRole("heading", { level: 1, name: T.tituloSinAcceso })).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent(textoSinAcceso(CORREO));
    expect(screen.queryByLabelText(T.correo)).toBeNull();
    expect(screen.queryByLabelText(T.contrasena)).toBeNull();
    expect(boton()).toHaveTextContent(T.entrarConOtraCuenta);
  });

  it("04 · sin acceso por la guarda de rutas: nombra la cuenta de la sesión, o dice «Esta cuenta»", () => {
    const { unmount } = montar({ motivo: "sin-acceso", correoSinAcceso: "otra@correo.com" });
    expect(screen.getByRole("alert")).toHaveTextContent(textoSinAcceso("otra@correo.com"));
    unmount();

    montar({ motivo: "sin-acceso", correoSinAcceso: null });
    expect(screen.getByRole("alert")).toHaveTextContent("Esta cuenta no tiene el rol de coordinador vigente. Si creés que es un error, hablá con el administrador.");
  });

  it("04 · «Entrar con otra cuenta» cierra la sesión y vuelve al formulario vacío", async () => {
    const { cerrar } = montar({ motivo: "sin-acceso", correoSinAcceso: "otra@correo.com", siguiente: "/equipo" });
    const reemplazo = vi.spyOn(window.history, "replaceState");

    await userEvent.click(boton());

    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: T.tituloFormulario })).toBeVisible());
    expect(cerrar).toHaveBeenCalledTimes(1);
    expect(campoCorreo()).toHaveValue("");
    expect(campoCorreo()).toHaveFocus();
    expect(screen.queryByRole("alert")).toBeNull();
    // La URL ya no dice «sin acceso»: recargar no vuelve a esa pantalla.
    expect(reemplazo).toHaveBeenCalledWith(null, "", "/acceso?siguiente=%2Fequipo");
  });

  it("04 · si no se pudo cerrar la sesión, igual se puede entrar con otra cuenta", async () => {
    montar({ motivo: "sin-acceso", cerrar: vi.fn(async () => Promise.reject(new TypeError("fetch failed"))) });
    await userEvent.click(boton());
    expect(await screen.findByLabelText(T.correo)).toBeVisible();
    expect(boton()).toHaveTextContent(T.entrar);
  });

  it("05 · sesión vencida: lo dice como información y pide entrar de nuevo", () => {
    montar({ motivo: "vencida", siguiente: "/ciudades" });
    expect(screen.getByRole("status")).toHaveTextContent(T.sesionVencida);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(boton()).toHaveAttribute("aria-disabled", "true");
  });

  it("05 · tras entrar vuelve al lugar donde estaba", async () => {
    const { irA } = montar({ motivo: "vencida", siguiente: "/ciudades", iniciar: vi.fn(async () => ({ tipo: "ok" as const, destino: "/ciudades" })) });
    const usuario = userEvent.setup();
    await escribir(usuario);
    await usuario.click(boton());
    await waitFor(() => expect(irA).toHaveBeenCalledWith("/ciudades"));
  });

  it("06 · no disponible al entrar: no acusa a la cuenta, y «Reintentar» manda de nuevo lo escrito", async () => {
    const iniciar = vi
      .fn<PropiedadesDeAcceso["iniciar"]>()
      .mockResolvedValueOnce({ tipo: "no-disponible" })
      .mockResolvedValueOnce({ tipo: "ok", destino: "/inicio" });
    const { irA } = montar({ iniciar });
    const usuario = userEvent.setup();
    await escribir(usuario);

    await usuario.click(boton());

    expect(await screen.findByRole("alert")).toHaveTextContent(T.noDisponible);
    expect(screen.queryByText(T.credenciales)).toBeNull();
    expect(boton()).toHaveTextContent(T.reintentar);
    expect(boton()).not.toHaveAttribute("aria-disabled");

    await usuario.click(boton());
    await waitFor(() => expect(irA).toHaveBeenCalledWith("/inicio"));
    expect(iniciar).toHaveBeenCalledTimes(2);
    expect(iniciar).toHaveBeenLastCalledWith(CORREO, CLAVE, "/inicio");
  });

  it("06 · no disponible por la guarda de rutas (sin nada escrito): «Reintentar» vuelve a pedir la pantalla de antes", async () => {
    const { iniciar, irA } = montar({ motivo: "no-disponible", siguiente: "/equipo" });
    expect(screen.getByRole("alert")).toHaveTextContent(T.noDisponible);
    expect(boton()).toHaveTextContent(T.reintentar);

    await userEvent.click(boton());

    expect(irA).toHaveBeenCalledWith("/equipo");
    expect(iniciar).not.toHaveBeenCalled();
  });

  it("07 · sesión cerrada: aviso de éxito", () => {
    montar({ motivo: "cerrada" });
    expect(screen.getByRole("status")).toHaveTextContent(T.sesionCerrada);
    expect(boton()).toHaveAttribute("aria-disabled", "true");
  });

  it("08 · sin conexión: avisa, apaga «Entrar» y no manda nada; al volver la red se habilita", async () => {
    const { iniciar } = montar();
    const usuario = userEvent.setup();
    await escribir(usuario);

    sinRed(true);
    expect(screen.getByRole("status")).toHaveTextContent(T.sinConexion);
    expect(boton()).toHaveAttribute("aria-disabled", "true");
    await usuario.click(boton());
    fireEvent.submit(boton().closest("form")!);
    expect(iniciar).not.toHaveBeenCalled();
    // Lo escrito no se pierde.
    expect(campoCorreo()).toHaveValue(CORREO);

    sinRed(false);
    expect(screen.queryByText(T.sinConexion)).toBeNull();
    expect(boton()).not.toHaveAttribute("aria-disabled");
  });

  it("sin artboard (mapa §2): correo sin verificar y demasiados intentos dicen qué pasa y qué hacer", async () => {
    for (const [tipo, texto] of [
      ["correo-sin-verificar", T.correoSinVerificar],
      ["demasiados-intentos", T.demasiadosIntentos],
    ] as const) {
      const { unmount } = montar({ iniciar: vi.fn(async () => ({ tipo })) });
      const usuario = userEvent.setup();
      await escribir(usuario);
      await usuario.click(boton());
      expect(await screen.findByRole("alert")).toHaveTextContent(texto);
      expect(boton()).not.toHaveAttribute("aria-disabled");
      unmount();
    }
  });
});

describe("vista 38 · cuenta suspendida (R7 de HU-ADM-003, decisión del 27/10)", () => {
  it("04 · al entrar con una cuenta suspendida: mismo layout que «Sin acceso», con el texto literal y sin formulario", async () => {
    montar({ iniciar: vi.fn(async () => ({ tipo: "suspendida" as const })) });
    const usuario = userEvent.setup();
    await escribir(usuario);

    await usuario.click(boton());

    expect(await screen.findByRole("heading", { level: 1, name: T.tituloSinAcceso })).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent("Cuenta suspendida. Contactá al administrador.");
    expect(screen.queryByLabelText(T.correo)).toBeNull();
    expect(screen.queryByLabelText(T.contrasena)).toBeNull();
    expect(boton()).toHaveTextContent(T.entrarConOtraCuenta);
  });

  it("04 · por la guarda de rutas (motivo=suspendida) muestra el mismo texto y permite entrar con otra cuenta", async () => {
    const { cerrar } = montar({ motivo: "suspendida" });
    expect(screen.getByRole("alert")).toHaveTextContent("Cuenta suspendida. Contactá al administrador.");

    await userEvent.click(boton());

    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: T.tituloFormulario })).toBeVisible());
    expect(cerrar).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/suspendida/i)).toBeNull();
  });
});

describe("vista 38 · el correo en 05 y 07 (decisión del 27/10, regla R3: el canvas solo vacía la contraseña)", () => {
  it("al entrar guarda el correo en la pestaña (no en la URL)", async () => {
    montar();
    const usuario = userEvent.setup();
    await escribir(usuario, `  ${CORREO}  `);
    await usuario.click(boton());
    await waitFor(() => expect(window.sessionStorage.getItem("panel-ultimo-correo")).toBe(CORREO));
  });

  it.each([
    ["05 · sesión vencida", "vencida" as const],
    ["07 · sesión cerrada", "cerrada" as const],
  ])("%s: deja el correo con el que se entró, vacía la contraseña y el foco va a la contraseña", (_nombre, motivo) => {
    window.sessionStorage.setItem("panel-ultimo-correo", CORREO);
    montar({ motivo });
    expect(campoCorreo()).toHaveValue(CORREO);
    expect(campoClave()).toHaveValue("");
    expect(campoClave()).toHaveFocus();
    // Con el correo escrito, el botón espera solo la contraseña.
    expect(boton()).toHaveAttribute("aria-disabled", "true");
  });

  it("si la pestaña no sabe con qué cuenta se entró, el correo sale vacío (nunca viene de la URL)", () => {
    montar({ motivo: "vencida", siguiente: "/equipo?correo=otra@correo.com" });
    expect(campoCorreo()).toHaveValue("");
  });

  it("solo 05 y 07 lo precargan: la pantalla de siempre y los errores salen vacíos", () => {
    window.sessionStorage.setItem("panel-ultimo-correo", CORREO);
    montar({ motivo: "no-disponible" });
    expect(campoCorreo()).toHaveValue("");
  });

  it("se puede cambiar el correo precargado y entrar con otro", async () => {
    window.sessionStorage.setItem("panel-ultimo-correo", CORREO);
    const { iniciar } = montar({ motivo: "cerrada" });
    const usuario = userEvent.setup();
    await usuario.clear(campoCorreo());
    await usuario.type(campoCorreo(), "otra@correo.com");
    await usuario.type(campoClave(), CLAVE);
    await usuario.click(boton());
    expect(iniciar).toHaveBeenCalledWith("otra@correo.com", CLAVE, "/inicio");
  });

  it("«Entrar con otra cuenta» olvida el correo guardado", async () => {
    window.sessionStorage.setItem("panel-ultimo-correo", CORREO);
    montar({ motivo: "sin-acceso", correoSinAcceso: "otra@correo.com" });
    await userEvent.click(boton());
    await waitFor(() => expect(campoCorreo()).toHaveValue(""));
    expect(window.sessionStorage.getItem("panel-ultimo-correo")).toBeNull();
  });

  it("si el navegador no deja usar el almacenamiento, la pantalla funciona igual con el correo vacío", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    const { iniciar } = montar({ motivo: "vencida" });
    expect(campoCorreo()).toHaveValue("");
    const usuario = userEvent.setup();
    await escribir(usuario);
    await usuario.click(boton());
    expect(iniciar).toHaveBeenCalledTimes(1);
  });
});

describe("vista 38 · casos límite", () => {
  it("doble tap y Enter más clic en el mismo instante: se manda un solo intento", async () => {
    const respuesta = diferida<RespuestaDeInicio>();
    const iniciar = vi.fn(() => respuesta.promesa);
    montar({ iniciar });
    const usuario = userEvent.setup();
    await escribir(usuario);

    const formulario = boton().closest("form")!;
    act(() => {
      fireEvent.submit(formulario);
      fireEvent.submit(formulario);
      fireEvent.click(boton());
    });

    expect(iniciar).toHaveBeenCalledTimes(1);
    await act(async () => respuesta.resolver({ tipo: "credenciales-invalidas" }));
  });

  it("Enter en la contraseña envía el formulario", async () => {
    const { iniciar } = montar();
    const usuario = userEvent.setup();
    await usuario.type(campoCorreo(), CORREO);
    await usuario.type(campoClave(), `${CLAVE}{Enter}`);
    expect(iniciar).toHaveBeenCalledWith(CORREO, CLAVE, "/inicio");
  });

  it("falla a mitad del envío (la acción se cae): el botón vuelve a habilitarse y se puede reintentar", async () => {
    const iniciar = vi
      .fn<PropiedadesDeAcceso["iniciar"]>()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({ tipo: "ok", destino: "/inicio" });
    const { irA } = montar({ iniciar });
    const usuario = userEvent.setup();
    await escribir(usuario);

    await usuario.click(boton());

    expect(await screen.findByRole("alert")).toHaveTextContent(T.noDisponible);
    expect(boton()).not.toHaveAttribute("aria-disabled");
    expect(campoCorreo()).toBeEnabled();
    expect(screen.queryByRole("status")?.textContent ?? "").toBe("");

    await usuario.click(boton());
    await waitFor(() => expect(irA).toHaveBeenCalledWith("/inicio"));
  });

  it("si la acción se cae justo cuando se perdió la red, el aviso es el de sin conexión", async () => {
    montar({
      iniciar: vi.fn(async () => {
        vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
        throw new TypeError("fetch failed");
      }),
    });
    const usuario = userEvent.setup();
    await escribir(usuario);
    await usuario.click(boton());
    expect(await screen.findByText(T.sinConexion)).toBeVisible();
  });

  it("al entrar, la pantalla queda apagada hasta que cambia la página (no admite un segundo intento)", async () => {
    const { iniciar } = montar();
    const usuario = userEvent.setup();
    await escribir(usuario);
    await usuario.click(boton());
    await waitFor(() => expect(iniciar).toHaveBeenCalledTimes(1));

    expect(boton()).toHaveAttribute("aria-disabled", "true");
    await usuario.click(boton());
    expect(iniciar).toHaveBeenCalledTimes(1);
  });

  it("dos intentos seguidos: el segundo ve los campos y el botón otra vez disponibles después del primero", async () => {
    const iniciar = vi
      .fn<PropiedadesDeAcceso["iniciar"]>()
      .mockResolvedValueOnce({ tipo: "credenciales-invalidas" })
      .mockResolvedValueOnce({ tipo: "credenciales-invalidas" });
    montar({ iniciar });
    const usuario = userEvent.setup();
    await escribir(usuario);
    await usuario.click(boton());
    await screen.findByRole("alert");
    await usuario.click(boton());
    await waitFor(() => expect(iniciar).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("alert")).toHaveTextContent(T.credenciales);
  });

  it("volver atrás y reentrar: la pantalla arranca limpia, sin un «Entrando…» trabado", async () => {
    const colgada = diferida<RespuestaDeInicio>();
    const primera = montar({ iniciar: vi.fn(() => colgada.promesa) });
    const usuario = userEvent.setup();
    await escribir(usuario);
    await usuario.click(boton());
    expect(boton()).toHaveTextContent(T.entrando);
    primera.unmount();

    montar();
    expect(boton()).toHaveTextContent(T.entrar);
    expect(campoCorreo()).toBeEnabled();
    expect(campoCorreo()).toHaveValue("");
  });

  it("datos límite: un correo de 254 letras entra; la contraseña se manda tal cual, con espacios; el aviso largo no rompe", async () => {
    const correoLargo = `${"a".repeat(240)}@correo.com`;
    const { iniciar } = montar();
    expect(campoCorreo()).toHaveAttribute("maxlength", "254");
    const usuario = userEvent.setup();
    await usuario.type(campoCorreo(), correoLargo);
    await usuario.type(campoClave(), "  con espacios  ");
    await usuario.click(boton());
    expect(iniciar).toHaveBeenCalledWith(correoLargo, "  con espacios  ", "/inicio");
  });

  it("datos límite: la cuenta sin acceso con un correo larguísimo se corta en la caja, no la desborda", () => {
    const largo = `${"x".repeat(200)}@correo.com`;
    montar({ motivo: "sin-acceso", correoSinAcceso: largo });
    const texto = screen.getByText(textoSinAcceso(largo));
    expect(texto.className).toContain("wrap-anywhere");
  });

  it("no hay un enlace «¿Olvidaste tu contraseña?» sin destino (decisión del orquestador, 26/10)", () => {
    montar();
    expect(screen.queryByText(/olvidaste/i)).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("vista 38 · accesibilidad (axe A/AA, sin contraste)", () => {
  it("cada estado de la pantalla", async () => {
    for (const propiedades of [
      {},
      { motivo: "vencida" as const },
      { motivo: "cerrada" as const },
      { motivo: "no-disponible" as const },
      { motivo: "sin-acceso" as const, correoSinAcceso: "otra@correo.com" },
    ]) {
      const { container, unmount } = montar(propiedades);
      expect(await violaciones(container), JSON.stringify(propiedades)).toEqual([]);
      unmount();
    }
  });

  it("con error de credenciales, entrando y sin conexión", async () => {
    const respuesta = diferida<RespuestaDeInicio>();
    const { container } = montar({ iniciar: vi.fn(() => respuesta.promesa) });
    const usuario = userEvent.setup();
    await escribir(usuario);

    await usuario.click(boton());
    expect(await violaciones(container)).toEqual([]);

    await act(async () => respuesta.resolver({ tipo: "credenciales-invalidas" }));
    expect(await violaciones(container)).toEqual([]);

    sinRed(true);
    expect(await violaciones(container)).toEqual([]);
  });
});
