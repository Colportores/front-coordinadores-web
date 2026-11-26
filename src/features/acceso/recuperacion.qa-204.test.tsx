import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RespuestaDeCierreDeSesiones, RespuestaDeGuardado } from "@/auth/acciones-recuperacion";
import { PantallaNuevaContrasena, type PropiedadesDeNuevaContrasena } from "@/features/acceso/PantallaNuevaContrasena";
import { TEXTOS_DE_NUEVA_CONTRASENA as TN } from "@/features/acceso/textos-recuperacion";
import { leerUltimoCorreo } from "@/features/acceso/ultimo-correo";

/**
 * QA de #204 (PR #212, vista 40): tope de 72 bytes en la contraseña nueva y «Ir al login» tras el cierre fallido de sesiones.
 * Lo que las decisiones del 22/11 y los casos límite piden y los tests del implementador no cubren. Los que llevan `skip`
 * documentan un hallazgo: el implementador saca el `skip` al arreglarlo.
 */

const CORREO = "marta.perez@correo.com";
const CLAVE = "Nueva-clave-1";

/** `A1` + relleno hasta `bytes` bytes en UTF-8, con caracteres de `ancho` bytes (ñ: 2, emoji: 4). */
function claveDeBytes(bytes: number, caracter: string, ancho: number): string {
  const base = "A1";
  const resto = bytes - base.length;
  return base + caracter.repeat(Math.floor(resto / ancho)) + "a".repeat(resto % ancho);
}

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
  const salirDeLaRecuperacion = vi.fn<PropiedadesDeNuevaContrasena["salirDeLaRecuperacion"]>(async () => ({ tipo: "ok" }));
  const irA = vi.fn<(ruta: string) => void>();
  const resultado = render(
    <PantallaNuevaContrasena
      inicial={{ paso: "nueva", correo: CORREO }}
      abrir={abrir}
      guardar={guardar}
      cerrarOtras={cerrarOtras}
      salirDeLaRecuperacion={salirDeLaRecuperacion}
      irA={irA}
      {...propiedades}
    />,
  );
  return { ...resultado, abrir, guardar, cerrarOtras, salirDeLaRecuperacion, irA };
}

const nueva = () => screen.getByLabelText(TN.nueva);
const repetida = () => screen.getByLabelText(TN.repetida);
const guardarBoton = () => screen.getByRole("button", { name: new RegExp(`^(${TN.guardar}|${TN.guardando}|${TN.reintentar})$`) });

/** Pega una contraseña (sin tipear letra por letra: los textos largos) en los dos campos. */
function pegar(clave: string, repeticion: string = clave) {
  fireEvent.change(nueva(), { target: { value: clave } });
  fireEvent.change(repetida(), { target: { value: repeticion } });
}

describe("QA #204 · P1 · el tope de 72 bytes en UTF-8 (HU-AUTH-001 «Topes de largo»)", () => {
  it.each([
    ["ASCII", claveDeBytes(72, "a", 1), claveDeBytes(73, "a", 1)],
    ["con ñ (2 bytes)", claveDeBytes(72, "ñ", 2), claveDeBytes(73, "ñ", 2)],
    ["con emoji (4 bytes)", claveDeBytes(72, "😀", 4), claveDeBytes(73, "😀", 4)],
  ])("el borde exacto, %s: 72 bytes se guarda; 73 dice «Es demasiado larga. Acortala.» y apaga «Guardar»", async (_nombre, justa, pasada) => {
    expect(new TextEncoder().encode(justa).length).toBe(72);
    expect(new TextEncoder().encode(pasada).length).toBe(73);
    const { guardar } = montarNueva();

    pegar(justa);
    expect(screen.queryByText(TN.demasiadaLarga)).toBeNull();
    expect(guardarBoton()).not.toHaveAttribute("aria-disabled", "true");

    pegar(pasada);
    expect(screen.getByText(TN.demasiadaLarga)).toBeVisible();
    expect(guardarBoton()).toHaveAttribute("aria-disabled", "true");
    expect(nueva()).toHaveAttribute("aria-invalid", "true");
    // Nunca se recorta: lo pegado queda entero.
    expect((nueva() as HTMLInputElement).value).toBe(pasada);
    expect(guardar).not.toHaveBeenCalled();
  });

  it("texto pegado muy largo (20 000 caracteres): avisa, no cuelga, no llama al servidor ni con Enter y no recorta", async () => {
    const usuario = userEvent.setup();
    const { guardar } = montarNueva();
    const enorme = "Aa1" + "ñ".repeat(20_000);
    pegar(enorme);
    expect(screen.getByText(TN.demasiadaLarga)).toBeVisible();
    expect(guardarBoton()).toHaveAttribute("aria-disabled", "true");
    // Enter en el campo envía el formulario: la guarda de la pantalla también corta ahí.
    await usuario.click(repetida());
    await usuario.keyboard("{Enter}");
    expect(guardar).not.toHaveBeenCalled();
    expect((nueva() as HTMLInputElement).value).toHaveLength(enorme.length);
  });

  it("se puede corregir: al acortar vuelve a habilitarse y guarda lo que quedó (sin pedir nada más)", async () => {
    const usuario = userEvent.setup();
    const { guardar } = montarNueva();
    pegar(claveDeBytes(80, "ñ", 2));
    expect(guardarBoton()).toHaveAttribute("aria-disabled", "true");
    pegar(CLAVE);
    expect(screen.queryByText(TN.demasiadaLarga)).toBeNull();
    await usuario.click(guardarBoton());
    expect(guardar).toHaveBeenCalledExactlyOnceWith(CLAVE);
  });

  it("el servidor rechaza por largo una contraseña que la pantalla dio por buena: mismo texto en el campo, sin «No pudimos guardar», foco en el campo y lo escrito intacto", async () => {
    const usuario = userEvent.setup();
    const guardar = vi.fn<PropiedadesDeNuevaContrasena["guardar"]>(async () => ({ tipo: "contrasena-larga" }));
    montarNueva({ guardar });
    await usuario.type(nueva(), CLAVE);
    await usuario.type(repetida(), CLAVE);
    await usuario.click(guardarBoton());

    expect(await screen.findByText(TN.demasiadaLarga)).toBeVisible();
    expect(screen.queryByText(TN.errorAlGuardar)).toBeNull();
    expect(nueva()).toHaveAttribute("aria-invalid", "true");
    expect(nueva()).toHaveFocus();
    expect((nueva() as HTMLInputElement).value).toBe(CLAVE);
    expect((repetida() as HTMLInputElement).value).toBe(CLAVE);
    // El aviso del campo se anuncia (rol alert) y el botón sigue disponible para reintentar con otra.
    expect(screen.getByRole("alert")).toHaveTextContent(TN.demasiadaLarga);
    expect(guardarBoton()).not.toHaveAttribute("aria-disabled", "true");
  });

  it("tras el rechazo por largo, el segundo intento (otra contraseña) guarda y pasa a «Contraseña cambiada»", async () => {
    const usuario = userEvent.setup();
    const guardar = vi
      .fn<PropiedadesDeNuevaContrasena["guardar"]>()
      .mockResolvedValueOnce({ tipo: "contrasena-larga" })
      .mockResolvedValueOnce({ tipo: "ok" });
    montarNueva({ guardar });
    await usuario.type(nueva(), CLAVE);
    await usuario.type(repetida(), CLAVE);
    await usuario.click(guardarBoton());
    await screen.findByText(TN.demasiadaLarga);

    await usuario.clear(nueva());
    await usuario.clear(repetida());
    await usuario.type(nueva(), "Otra-clave-2");
    await usuario.type(repetida(), "Otra-clave-2");
    expect(screen.queryByText(TN.demasiadaLarga)).toBeNull();
    await usuario.click(guardarBoton());
    expect(await screen.findByRole("heading", { level: 1, name: TN.tituloCambiada })).toBeVisible();
    expect(guardar).toHaveBeenCalledTimes(2);
    expect(guardar).toHaveBeenLastCalledWith("Otra-clave-2");
  });

  it("dos toques seguidos en «Guardar» con la respuesta pendiente: un solo envío", async () => {
    const usuario = userEvent.setup();
    let resolver: (r: RespuestaDeGuardado) => void = () => {};
    const guardar = vi.fn<PropiedadesDeNuevaContrasena["guardar"]>(() => new Promise<RespuestaDeGuardado>((r) => (resolver = r)));
    montarNueva({ guardar });
    await usuario.type(nueva(), CLAVE);
    await usuario.type(repetida(), CLAVE);
    await usuario.dblClick(guardarBoton());
    expect(guardar).toHaveBeenCalledTimes(1);
    await act(async () => resolver({ tipo: "contrasena-larga" }));
    expect(screen.getByText(TN.demasiadaLarga)).toBeVisible();
  });
});

describe("QA #204 · P2 · «Ir al login» con el cierre de las otras sesiones sin confirmar (40B·05)", () => {
  const botonCerrar = () => screen.getByRole("button", { name: new RegExp(`^(${TN.cerrarOtras}|${TN.cerrandoOtras})$`) });
  const botonIr = () => screen.getByRole("button", { name: new RegExp(`^(${TN.irAlLogin}|${TN.saliendo})$`) });

  async function llegarASinRevocar(propiedades: Partial<PropiedadesDeNuevaContrasena> = {}) {
    const usuario = userEvent.setup();
    const guardar = vi.fn<PropiedadesDeNuevaContrasena["guardar"]>(async () => ({ tipo: "ok-sin-revocar" }));
    const montada = montarNueva({ guardar, ...propiedades });
    await usuario.type(nueva(), CLAVE);
    await usuario.type(repetida(), CLAVE);
    await usuario.click(guardarBoton());
    await screen.findByRole("heading", { level: 1, name: TN.tituloCambiada });
    return { usuario, ...montada };
  }

  it("Dado el cierre fallido, cuando toca «Ir al login», entonces va al login con el motivo «cerrada» (que precarga el correo) y nunca a una ruta del panel", async () => {
    const { usuario, irA } = await llegarASinRevocar();
    await usuario.click(botonIr());
    expect(irA).toHaveBeenCalledExactlyOnceWith("/acceso?motivo=cerrada");
  });

  it("el correo queda escrito solo en sessionStorage (esta pestaña) y solo si el cierre salió bien", async () => {
    const { usuario, salirDeLaRecuperacion } = await llegarASinRevocar();
    salirDeLaRecuperacion.mockRejectedValueOnce(new Error("se cortó"));
    await usuario.click(botonIr());
    expect(window.sessionStorage.getItem("panel-ultimo-correo")).toBeNull();
    await usuario.click(botonIr());
    expect(window.sessionStorage.getItem("panel-ultimo-correo")).toBe(CORREO);
    expect(window.localStorage.length).toBe(0);
  });

  it("el aviso de la falla se anuncia (rol alert) y no tapa el aviso de las sesiones sin cerrar", async () => {
    const { usuario, salirDeLaRecuperacion } = await llegarASinRevocar();
    salirDeLaRecuperacion.mockRejectedValueOnce(new Error("se cortó"));
    await usuario.click(botonIr());
    const alertas = screen.getAllByRole("alert").map((a) => a.textContent ?? "");
    expect(alertas.some((texto) => texto.includes(TN.noPudoSalir))).toBe(true);
    expect(alertas.some((texto) => texto.includes(TN.sinRevocar))).toBe(true);
  });

  it("falla dos veces seguidas y no se traba: cada intento llama una vez, el botón vuelve a habilitarse y a la tercera sale", async () => {
    const { usuario, salirDeLaRecuperacion, irA } = await llegarASinRevocar();
    salirDeLaRecuperacion.mockRejectedValueOnce(new Error("uno")).mockRejectedValueOnce(new Error("dos"));
    await usuario.click(botonIr());
    await usuario.click(botonIr());
    expect(irA).not.toHaveBeenCalled();
    expect(botonIr()).not.toHaveAttribute("aria-disabled");
    expect(botonIr()).toHaveTextContent(TN.irAlLogin);
    await usuario.click(botonIr());
    expect(salirDeLaRecuperacion).toHaveBeenCalledTimes(3);
    expect(irA).toHaveBeenCalledOnce();
  });

  it("«Cerrar las otras sesiones» que sale bien después de una falla de «Ir al login»: sigue el éxito y el aviso de la falla ya no se ve", async () => {
    const { usuario, salirDeLaRecuperacion } = await llegarASinRevocar();
    salirDeLaRecuperacion.mockRejectedValueOnce(new Error("se cortó"));
    await usuario.click(botonIr());
    await usuario.click(botonCerrar());
    expect(await screen.findByText(TN.cambiada)).toBeVisible();
    expect(screen.queryByText(TN.noPudoSalir)).toBeNull();
    expect(screen.getByRole("link", { name: TN.irAlLogin })).toHaveAttribute("href", "/acceso?motivo=cerrada");
  });

  it.skip("QA #204: al reintentar «Cerrar las otras sesiones», el aviso viejo de «Ir al login» sigue en pantalla (cerrarOtrasAhora no lo limpia)", async () => {
    const { usuario, salirDeLaRecuperacion, cerrarOtras } = await llegarASinRevocar();
    salirDeLaRecuperacion.mockRejectedValueOnce(new Error("se cortó"));
    cerrarOtras.mockResolvedValueOnce({ tipo: "ok-sin-revocar" });
    await usuario.click(botonIr());
    expect(screen.getByText(TN.noPudoSalir)).toBeVisible();
    await usuario.click(botonCerrar());
    // Se pidió otra acción: el aviso de la anterior no tiene por qué seguir en pantalla.
    expect(screen.queryByText(TN.noPudoSalir)).toBeNull();
  });

  it.skip("QA #204: tras cerrar bien, «Ir al login» vuelve a habilitarse antes de que cambie la página (el finally apaga «Saliendo…»)", async () => {
    const { usuario, salirDeLaRecuperacion, irA } = await llegarASinRevocar();
    await usuario.click(botonIr());
    expect(irA).toHaveBeenCalledOnce();
    // La navegación completa todavía no terminó (irA no descarga la página en jsdom): el botón no debería volver a «Ir al login».
    expect(botonIr()).toHaveAttribute("aria-disabled", "true");
    await usuario.click(botonIr());
    expect(salirDeLaRecuperacion).toHaveBeenCalledOnce();
    expect(irA).toHaveBeenCalledOnce();
  });

  it("QA #204: sin conexión con el cierre fallido, los dos botones quedan apagados y la línea de sin conexión dice por qué", async () => {
    const { usuario } = await llegarASinRevocar();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(botonIr()).toHaveAttribute("aria-disabled", "true");
    expect(botonCerrar()).toHaveAttribute("aria-disabled", "true");
    await usuario.click(botonIr());
    expect(screen.getByRole("status")).toHaveTextContent(TN.sinConexionParaSalir);
    expect(screen.getByRole("alert")).toHaveTextContent(TN.sinRevocar);
  });

  it("«Ir al login» respeta el orden con «Cerrar las otras» en curso: al terminar con falla, queda disponible y funciona", async () => {
    let resolver: (r: RespuestaDeCierreDeSesiones) => void = () => {};
    const cerrarOtras = vi.fn<PropiedadesDeNuevaContrasena["cerrarOtras"]>(() => new Promise<RespuestaDeCierreDeSesiones>((r) => (resolver = r)));
    const { usuario, salirDeLaRecuperacion, irA } = await llegarASinRevocar({ cerrarOtras });
    await usuario.click(botonCerrar());
    await usuario.click(botonIr());
    expect(salirDeLaRecuperacion).not.toHaveBeenCalled();
    await act(async () => resolver({ tipo: "ok-sin-revocar" }));
    expect(botonIr()).not.toHaveAttribute("aria-disabled");
    await usuario.click(botonIr());
    expect(salirDeLaRecuperacion).toHaveBeenCalledOnce();
    expect(irA).toHaveBeenCalledOnce();
  });

  it("con el cierre bien hecho, «Ir al login» sigue siendo el enlace de siempre (no hay sesión de recuperación que cerrar aparte)", async () => {
    const usuario = userEvent.setup();
    const { salirDeLaRecuperacion } = montarNueva();
    await usuario.type(nueva(), CLAVE);
    await usuario.type(repetida(), CLAVE);
    await usuario.click(guardarBoton());
    expect(await screen.findByRole("link", { name: TN.irAlLogin })).toHaveAttribute("href", "/acceso?motivo=cerrada");
    expect(salirDeLaRecuperacion).not.toHaveBeenCalled();
  });

  it("con el cierre bien hecho, «Ir al login» deja el correo para el login (mismo final que tras el cierre fallido)", async () => {
    const usuario = userEvent.setup();
    montarNueva();
    await usuario.type(nueva(), CLAVE);
    await usuario.type(repetida(), CLAVE);
    await usuario.click(guardarBoton());
    const enlace = await screen.findByRole("link", { name: TN.irAlLogin });
    // jsdom no navega: se frena el clic para mirar solo lo que dejó antes de irse.
    enlace.addEventListener("click", (evento) => evento.preventDefault());
    await usuario.click(enlace);
    expect(leerUltimoCorreo()).toBe(CORREO);
  });
});
