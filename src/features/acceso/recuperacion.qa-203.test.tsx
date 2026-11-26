import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RespuestaDeApertura, RespuestaDeCierreDeSesiones, RespuestaDelPedido } from "@/auth/acciones-recuperacion";
import { PantallaNuevaContrasena, type PropiedadesDeNuevaContrasena } from "@/features/acceso/PantallaNuevaContrasena";
import { PantallaOlvide } from "@/features/acceso/PantallaOlvide";
import { TEXTOS_DE_ACCESO } from "@/features/acceso/textos";
import { TEXTOS_DE_NUEVA_CONTRASENA as TN, TEXTOS_DE_OLVIDE as TO } from "@/features/acceso/textos-recuperacion";

/**
 * QA de #111 (PR #203, vista 40): lo que la HU, las decisiones del issue y la revisión en Chromium piden y los tests del
 * implementador no cubren. Los que llevan `skip` documentan un hallazgo: el implementador saca el `skip` al arreglarlo.
 */

const CORREO = "marta.perez@correo.com";
const CLAVE = "Nueva-clave-1";

beforeEach(() => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

function montarNueva(propiedades: Partial<PropiedadesDeNuevaContrasena> = {}) {
  const abrir = vi.fn<PropiedadesDeNuevaContrasena["abrir"]>(async () => ({ tipo: "ok", correo: CORREO }));
  const guardar = vi.fn<PropiedadesDeNuevaContrasena["guardar"]>(async () => ({ tipo: "ok" }));
  const cerrarOtras = vi.fn<PropiedadesDeNuevaContrasena["cerrarOtras"]>(async () => ({ tipo: "ok" }));
  const resultado = render(<PantallaNuevaContrasena inicial={{ paso: "nueva", correo: CORREO }} abrir={abrir} guardar={guardar} cerrarOtras={cerrarOtras} {...propiedades} />);
  return { ...resultado, abrir, guardar, cerrarOtras };
}

const nueva = () => screen.getByLabelText(TN.nueva);
const repetida = () => screen.getByLabelText(TN.repetida);
const guardarBoton = () => screen.getByRole("button", { name: new RegExp(`^(${TN.guardar}|${TN.guardando}|${TN.reintentar})$`) });

describe("#217 · decisión P2: el aviso del enlace no válido", () => {
  it("el enlace no válido dice el texto del canvas 40B·06 y ya no culpa al navegador", () => {
    montarNueva({ inicial: { paso: "no-valido" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Este enlace ya no sirve: venció o ya se usó. Solicitá uno nuevo.");
    expect(screen.queryByText(/navegador/)).toBeNull();
    // La salida sigue: pedir uno nuevo y volver al login.
    expect(screen.getByRole("link", { name: TN.solicitarNuevo })).toHaveAttribute("href", "/acceso/olvide");
    expect(screen.getByRole("link", { name: TN.volverAlLogin })).toHaveAttribute("href", "/acceso");
  });

  it("un `?code=` viejo sin el verificador PKCE de este navegador conserva el texto del 22/11 (ahí sí se sabe por qué)", async () => {
    const abrir = vi.fn(async (): Promise<RespuestaDeApertura> => ({ tipo: "no-valido", sinVerificador: true }));
    montarNueva({ inicial: { paso: "abrir", codigo: "c-viejo" }, abrir });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos abrir este enlace en este navegador. Abrilo en el navegador donde lo pediste, o pedí uno nuevo desde acá.",
    );
  });

  it("un código de un solo uso se canjea con su tipo y un código viejo, con un solo argumento", async () => {
    const abrir = vi.fn<PropiedadesDeNuevaContrasena["abrir"]>(async () => ({ tipo: "ok", correo: CORREO }));
    const { unmount } = montarNueva({ inicial: { paso: "abrir", codigo: "hash-1", tipo: "un-solo-uso" }, abrir });
    expect(await screen.findByText(TN.para(CORREO))).toBeVisible();
    expect(abrir).toHaveBeenCalledWith("hash-1", "un-solo-uso");
    unmount();
    const abrirViejo = vi.fn<PropiedadesDeNuevaContrasena["abrir"]>(async () => ({ tipo: "ok", correo: CORREO }));
    montarNueva({ inicial: { paso: "abrir", codigo: "c-viejo-2" }, abrir: abrirViejo });
    expect(await screen.findByText(TN.para(CORREO))).toBeVisible();
    expect(abrirViejo).toHaveBeenCalledWith("c-viejo-2");
  });
});

describe("QA #111 · 40B · abrir el enlace una sola vez en el navegador real", () => {
  it("QA #111: tras abrir bien el enlace, Next re-renderiza la página con otra referencia de la acción (replaceState) y el código se canjea de nuevo: «Enlace no válido» con un enlace bueno", async () => {
    let llamadas = 0;
    const abrirViejo = vi.fn(async (codigo: string): Promise<RespuestaDeApertura> => {
      expect(codigo).toBe("c-un-solo-uso");
      llamadas += 1;
      // El segundo canje de un mismo código ya no existe en Supabase.
      return llamadas === 1 ? { tipo: "ok", correo: CORREO } : { tipo: "no-valido" };
    });
    const inicial = { paso: "abrir", codigo: "c-un-solo-uso" } as const;
    const { rerender } = render(<PantallaNuevaContrasena inicial={inicial} abrir={abrirViejo} guardar={vi.fn()} cerrarOtras={vi.fn()} />);
    expect(await screen.findByLabelText(TN.nueva)).toBeVisible();

    // La página vuelve del servidor con otra referencia de la misma server action (pasa tras `history.replaceState` en Next).
    const abrirNuevo = vi.fn((codigo: string) => abrirViejo(codigo));
    await act(async () => rerender(<PantallaNuevaContrasena inicial={inicial} abrir={abrirNuevo} guardar={vi.fn()} cerrarOtras={vi.fn()} />));

    expect(abrirNuevo).not.toHaveBeenCalled();
    expect(screen.getByLabelText(TN.nueva)).toBeVisible();
    expect(screen.queryByRole("heading", { level: 1, name: TN.tituloNoValido })).toBeNull();
  });
});

describe("QA #111 · 40B · contraseña de más de 72 bytes (HU-AUTH-001 «Topes de largo», misma política que el registro, HU-AUTH-005)", () => {
  // 37 letras «ñ» = 74 bytes en UTF-8; con una mayúscula y un número cumple las otras reglas.
  const LARGA = `Ñ1${"ñ".repeat(36)}`;

  it("QA #111: el campo no avisa «Es demasiado larga. Acortala.», deja «Guardar» encendido y el servidor la rechaza con un error sin salida", async () => {
    expect(new TextEncoder().encode(LARGA).length).toBeGreaterThan(72);
    const { guardar } = montarNueva();
    fireEvent.change(nueva(), { target: { value: LARGA } });
    fireEvent.change(repetida(), { target: { value: LARGA } });
    expect(screen.getByText("Es demasiado larga. Acortala.")).toBeVisible();
    expect(guardarBoton()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(guardarBoton());
    expect(guardar).not.toHaveBeenCalled();
    // Nunca se recorta lo escrito ni lo pegado.
    expect(nueva()).toHaveValue(LARGA);
  });

  it("con exactamente 72 bytes sigue permitido", () => {
    const justa = `A1${"x".repeat(70)}`;
    expect(new TextEncoder().encode(justa).length).toBe(72);
    montarNueva();
    fireEvent.change(nueva(), { target: { value: justa } });
    fireEvent.change(repetida(), { target: { value: justa } });
    expect(guardarBoton()).not.toHaveAttribute("aria-disabled");
  });
});

describe("QA #111 · 40B · el foco tras un error al guardar con Enter", () => {
  it("QA #111: al fallar el guardado con Enter en «Repetila», los campos se apagan y el foco cae al <body> (Chromium); nadie lo devuelve al campo ni al botón", async () => {
    const usuario = userEvent.setup();
    let fallar!: (r: { tipo: "no-disponible" }) => void;
    const guardar = vi.fn(() => new Promise<{ tipo: "no-disponible" }>((r) => (fallar = r)));
    montarNueva({ guardar });
    await usuario.type(nueva(), CLAVE);
    await usuario.type(repetida(), CLAVE);
    await usuario.keyboard("{Enter}");
    // El navegador real saca el foco de un campo que se apaga (jsdom no lo hace): se imita.
    (document.activeElement as HTMLElement | null)?.blur();
    await act(async () => fallar({ tipo: "no-disponible" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(TN.errorAlGuardar);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.closest("form")).not.toBeNull();
  });
});

describe("QA #111 · 40B · validación de entradas", () => {
  it("solo espacios en los dos campos: ni una regla cumplida ni «Guardar» encendido", async () => {
    const { guardar } = montarNueva();
    fireEvent.change(nueva(), { target: { value: "          " } });
    fireEvent.change(repetida(), { target: { value: "          " } });
    expect(guardarBoton()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(guardarBoton());
    expect(guardar).not.toHaveBeenCalled();
  });

  it("una contraseña de 7 emoji con número y sin mayúscula no pasa; un emoji vale 1 carácter", () => {
    montarNueva();
    fireEvent.change(nueva(), { target: { value: "😀😀😀😀😀😀1" } });
    expect(screen.getByText(TN.reglaLargoFaltan(1))).toBeVisible();
    expect(guardarBoton()).toHaveAttribute("aria-disabled", "true");
  });

  it("pegar un texto larguísimo (20 mil caracteres) no cuelga la pantalla, no se recorta y avisa que es demasiado larga (tope de 72 bytes)", async () => {
    const enorme = `Aa1${"z".repeat(20_000)}`;
    const { guardar } = montarNueva();
    fireEvent.change(nueva(), { target: { value: enorme } });
    fireEvent.change(repetida(), { target: { value: enorme } });
    expect(nueva()).toHaveValue(enorme);
    expect(screen.getByRole("alert")).toHaveTextContent(TN.demasiadaLarga);
    await act(async () => fireEvent.click(guardarBoton()));
    expect(guardar).not.toHaveBeenCalled();
  });

  it("después de un error del servidor, lo tipeado no se pierde y al reintentar sale el segundo guardado", async () => {
    const usuario = userEvent.setup();
    const guardar = vi.fn<PropiedadesDeNuevaContrasena["guardar"]>().mockResolvedValueOnce({ tipo: "no-disponible" }).mockResolvedValueOnce({ tipo: "ok" });
    montarNueva({ guardar });
    await usuario.type(nueva(), CLAVE);
    await usuario.type(repetida(), CLAVE);
    await usuario.click(guardarBoton());
    expect(await screen.findByRole("alert")).toHaveTextContent(TN.errorAlGuardar);
    expect(nueva()).toHaveValue(CLAVE);
    expect(repetida()).toHaveValue(CLAVE);
    expect(guardarBoton()).not.toHaveAttribute("aria-disabled");
    await usuario.click(guardarBoton());
    expect(guardar).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("heading", { level: 1, name: TN.tituloCambiada })).toBeVisible();
  });

  it("«misma contraseña» y luego «débil»: cada aviso reemplaza al anterior y se va al cambiar la contraseña", async () => {
    const guardar = vi.fn<PropiedadesDeNuevaContrasena["guardar"]>().mockResolvedValueOnce({ tipo: "misma-contrasena" }).mockResolvedValueOnce({ tipo: "contrasena-debil" });
    montarNueva({ guardar });
    fireEvent.change(nueva(), { target: { value: CLAVE } });
    fireEvent.change(repetida(), { target: { value: CLAVE } });
    await act(async () => fireEvent.click(guardarBoton()));
    expect(screen.getByText(TN.mismaContrasena)).toBeVisible();
    await act(async () => fireEvent.click(guardarBoton()));
    expect(screen.queryByText(TN.mismaContrasena)).toBeNull();
    expect(screen.getByText(TN.contrasenaDebil)).toBeVisible();
    fireEvent.change(nueva(), { target: { value: `${CLAVE}2` } });
    expect(screen.queryByText(TN.contrasenaDebil)).toBeNull();
  });
});

describe("QA #111 · 40A · validación de entradas y casos límite", () => {
  function montarOlvide(pedir = vi.fn<(correo: string) => Promise<RespuestaDelPedido>>(async () => ({ tipo: "enviado" }))) {
    const resultado = render(<PantallaOlvide pedir={pedir} />);
    return { ...resultado, pedir };
  }
  const campo = () => screen.getByLabelText(TO.correo);
  const boton = () => screen.getByRole("button");

  it.each([
    ["emoji", "marta😀@correo.com", TEXTOS_DE_ACCESO.correoConCaracterQueNoVa],
    ["espacio en el medio", "marta perez@correo.com", TEXTOS_DE_ACCESO.correoConCaracterQueNoVa],
    ["coma", "marta,perez@correo.com", TEXTOS_DE_ACCESO.correoConCaracterQueNoVa],
    ["comillas", '"marta"@correo.com', TEXTOS_DE_ACCESO.correoConCaracterQueNoVa],
    ["dos arrobas", "marta@@correo.com", TO.correoIncompleto],
    ["punto al final", "marta@correo.com.", TO.correoIncompleto],
    ["sin terminación", "marta@correo", TO.correoIncompleto],
  ])("correo con %s: el aviso sale en el campo, el foco vuelve ahí y no se manda nada", (_nombre, correo, aviso) => {
    const { pedir } = montarOlvide();
    fireEvent.change(campo(), { target: { value: correo } });
    fireEvent.click(boton());
    expect(screen.getByRole("alert")).toHaveTextContent(aviso);
    expect(campo()).toHaveFocus();
    expect(campo()).toHaveAttribute("aria-invalid", "true");
    expect(pedir).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
  });

  it("un correo pegado de 5000 caracteres (sin tope de JS) no se manda y avisa", () => {
    const { pedir } = montarOlvide();
    fireEvent.change(campo(), { target: { value: `${"a".repeat(5000)}@correo.com` } });
    fireEvent.click(boton());
    expect(screen.getByRole("alert")).toHaveTextContent(TO.correoIncompleto);
    expect(pedir).not.toHaveBeenCalled();
  });

  it("el campo se limita a 254 caracteres y no corrige el autocompletado", () => {
    montarOlvide();
    expect(campo()).toHaveAttribute("maxlength", "254");
    expect(campo()).toHaveAttribute("type", "email");
    expect(campo()).toHaveAttribute("autocomplete", "username");
  });

  it("mayúsculas y espacios alrededor: se manda normalizado y el correo de la pantalla 05 es el normalizado", async () => {
    const { pedir } = montarOlvide();
    fireEvent.change(campo(), { target: { value: `  ${CORREO.toUpperCase()}  ` } });
    await act(async () => fireEvent.click(boton()));
    expect(pedir).toHaveBeenCalledWith(CORREO);
    expect(screen.getByText(TO.textoEnviado(CORREO))).toBeVisible();
  });

  it("falla a mitad de camino y se reintenta con otro correo: se manda el nuevo y no el rechazado", async () => {
    const pedir = vi.fn<(correo: string) => Promise<RespuestaDelPedido>>().mockResolvedValueOnce({ tipo: "no-disponible" }).mockResolvedValueOnce({ tipo: "enviado" });
    montarOlvide(pedir);
    fireEvent.change(campo(), { target: { value: CORREO } });
    await act(async () => fireEvent.click(boton()));
    expect(screen.getByRole("alert")).toHaveTextContent(TO.noDisponible);
    fireEvent.change(campo(), { target: { value: "otra@correo.com" } });
    await act(async () => fireEvent.click(boton()));
    expect(pedir).toHaveBeenLastCalledWith("otra@correo.com");
    expect(screen.getByText(TO.textoEnviado("otra@correo.com"))).toBeVisible();
  });

  it("la dirección que el servidor acepta pero la acción rechaza no deja la pantalla trabada y se corrige", async () => {
    const pedir = vi.fn<(correo: string) => Promise<RespuestaDelPedido>>().mockResolvedValueOnce({ tipo: "correo-invalido" }).mockResolvedValueOnce({ tipo: "enviado" });
    montarOlvide(pedir);
    fireEvent.change(campo(), { target: { value: CORREO } });
    await act(async () => fireEvent.click(boton()));
    expect(screen.getByRole("alert")).toHaveTextContent(TO.correoIncompleto);
    expect(boton()).not.toHaveAttribute("aria-disabled");
    expect(boton()).toHaveTextContent(TO.enviar);
    fireEvent.change(campo(), { target: { value: "marta.perez@correo.org" } });
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => fireEvent.click(boton()));
    expect(await screen.findByRole("heading", { level: 1, name: TO.tituloEnviado })).toBeVisible();
  });
});

describe("QA #111 · 40B-05 · el cierre de las otras sesiones no se pudo confirmar (commit eacb41c)", () => {
  async function guardarSinRevocar(cerrarOtras: PropiedadesDeNuevaContrasena["cerrarOtras"]) {
    const usuario = userEvent.setup();
    const guardar = vi.fn<PropiedadesDeNuevaContrasena["guardar"]>(async () => ({ tipo: "ok-sin-revocar" }));
    const montada = montarNueva({ guardar, cerrarOtras });
    await usuario.type(nueva(), CLAVE);
    await usuario.type(repetida(), CLAVE);
    await usuario.click(guardarBoton());
    await screen.findByRole("heading", { level: 1, name: TN.tituloCambiada });
    return { usuario, ...montada };
  }
  const cerrarBoton = () => screen.getByRole("button", { name: new RegExp(`^(${TN.cerrarOtras}|${TN.cerrandoOtras})$`) });

  it("no es un éxito: avisa con rol alert, ofrece «Cerrar las otras sesiones» e «Ir al login», y no queda nada escrito", async () => {
    await guardarSinRevocar(vi.fn(async () => ({ tipo: "ok" as const })));
    expect(screen.getByRole("alert")).toHaveTextContent(TN.sinRevocar);
    expect(screen.queryByText(TN.cambiada)).toBeNull();
    expect(cerrarBoton()).not.toHaveAttribute("aria-disabled");
    expect(screen.getByRole("link", { name: TN.irAlLogin })).toHaveAttribute("href", "/acceso");
    expect(screen.queryByLabelText(TN.nueva)).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: TN.tituloCambiada })).toHaveFocus();
  });

  it("dos toques seguidos cierran una sola vez y el segundo no se pierde ni se pisa", async () => {
    let soltar!: (r: RespuestaDeCierreDeSesiones) => void;
    const cerrarOtras = vi.fn(() => new Promise<RespuestaDeCierreDeSesiones>((r) => (soltar = r)));
    await guardarSinRevocar(cerrarOtras);
    fireEvent.click(cerrarBoton());
    fireEvent.click(cerrarBoton());
    expect(cerrarOtras).toHaveBeenCalledOnce();
    expect(cerrarBoton()).toHaveTextContent(TN.cerrandoOtras);
    await act(async () => soltar({ tipo: "ok" }));
    expect(cerrarOtras).toHaveBeenCalledOnce();
  });

  it("si sigue sin poder (ok-sin-revocar) o la acción tira, el botón vuelve a habilitarse y el aviso queda", async () => {
    const cerrarOtras = vi.fn<PropiedadesDeNuevaContrasena["cerrarOtras"]>().mockResolvedValueOnce({ tipo: "ok-sin-revocar" }).mockRejectedValueOnce(new Error("se cortó"));
    await guardarSinRevocar(cerrarOtras);
    await act(async () => fireEvent.click(cerrarBoton()));
    expect(cerrarBoton()).toHaveTextContent(TN.cerrarOtras);
    expect(cerrarBoton()).not.toHaveAttribute("aria-disabled");
    expect(screen.getByRole("alert")).toHaveTextContent(TN.sinRevocar);
    await act(async () => fireEvent.click(cerrarBoton()));
    expect(cerrarBoton()).not.toHaveAttribute("aria-disabled");
    expect(screen.getByRole("alert")).toHaveTextContent(TN.sinRevocar);
    expect(cerrarOtras).toHaveBeenCalledTimes(2);
  });

  it("al lograrlo pasa a «Contraseña cambiada» con «Ir al login» y el foco en el título", async () => {
    await guardarSinRevocar(vi.fn(async () => ({ tipo: "ok" as const })));
    await act(async () => fireEvent.click(cerrarBoton()));
    expect(screen.getByRole("status")).toHaveTextContent(TN.cambiada);
    expect(screen.queryByRole("button", { name: TN.cerrarOtras })).toBeNull();
    expect(screen.getByRole("link", { name: TN.irAlLogin })).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: TN.tituloCambiada })).toHaveFocus();
  });

  it("sin conexión el botón queda apagado y no llama al servidor", async () => {
    const cerrarOtras = vi.fn(async () => ({ tipo: "ok" as const }));
    await guardarSinRevocar(cerrarOtras);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(cerrarBoton()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(cerrarBoton());
    expect(cerrarOtras).not.toHaveBeenCalled();
  });
});

describe("QA #111 · privacidad (checklist 8)", () => {
  it("ningún flujo de las dos pantallas escribe el correo ni la contraseña en la consola", async () => {
    const espias = (["log", "info", "warn", "error", "debug"] as const).map((nivel) => vi.spyOn(console, nivel).mockImplementation(() => {}));
    const usuario = userEvent.setup();
    const olvide = render(<PantallaOlvide pedir={vi.fn(async () => ({ tipo: "no-disponible" as const }))} />);
    await usuario.type(screen.getByLabelText(TO.correo), CORREO);
    await usuario.click(screen.getByRole("button"));
    await screen.findByRole("alert");
    olvide.unmount();

    const guardar = vi.fn<PropiedadesDeNuevaContrasena["guardar"]>(async () => Promise.reject(new Error("se cortó")));
    montarNueva({ guardar });
    fireEvent.change(nueva(), { target: { value: CLAVE } });
    fireEvent.change(repetida(), { target: { value: CLAVE } });
    await act(async () => fireEvent.click(guardarBoton()));

    for (const espia of espias) {
      for (const llamada of espia.mock.calls) {
        const texto = llamada.map(String).join(" ");
        expect(texto).not.toContain(CORREO);
        expect(texto).not.toContain(CLAVE);
      }
    }
  });

  it("la contraseña no llega a ningún almacenamiento del navegador, y el correo solo a la espera y al correo del login", async () => {
    const usuario = userEvent.setup();
    montarNueva();
    await usuario.type(nueva(), CLAVE);
    await usuario.type(repetida(), CLAVE);
    await usuario.click(guardarBoton());
    await screen.findByRole("heading", { level: 1, name: TN.tituloCambiada });
    const todo = JSON.stringify({ ...window.localStorage }) + JSON.stringify({ ...window.sessionStorage });
    expect(todo).not.toContain(CLAVE);
  });
});
