import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RespuestaDeApertura, RespuestaDeCierreDeSesiones, RespuestaDeGuardado } from "@/auth/acciones-recuperacion";
import { PantallaNuevaContrasena, type PropiedadesDeNuevaContrasena } from "@/features/acceso/PantallaNuevaContrasena";
import { TEXTOS_DE_NUEVA_CONTRASENA as T } from "@/features/acceso/textos-recuperacion";

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
  const promesa = new Promise<T>((res) => {
    resolver = res;
  });
  return { promesa, resolver };
}

const CORREO = "marta.perez@correo.com";
const CLAVE = "Nueva-clave-1";

function montar(propiedades: Partial<PropiedadesDeNuevaContrasena> = {}) {
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

const nueva = () => screen.getByLabelText(T.nueva);
const repetida = () => screen.getByLabelText(T.repetida);
const guardarBoton = () => screen.getByRole("button", { name: new RegExp(`^(${T.guardar}|${T.guardando}|${T.reintentar})$`) });

async function escribir(usuario: ReturnType<typeof userEvent.setup>, a = CLAVE, b = a) {
  await usuario.type(nueva(), a);
  await usuario.type(repetida(), b);
}

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
  vi.restoreAllMocks();
});

describe("40B · 01 nueva contraseña", () => {
  it("nombra la cuenta, trae las reglas y «Guardar contraseña» apagado hasta que todo está bien", async () => {
    montar();
    expect(screen.getByRole("heading", { level: 1, name: T.titulo })).toBeVisible();
    expect(screen.getByText(T.para(CORREO))).toBeVisible();
    expect(guardarBoton()).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("list", { name: T.reglasTitulo })).toBeVisible();
    // Sin escribir, ninguna regla acusa un incumplimiento.
    expect(screen.queryByText(`(${T.noCumple})`, { exact: false })).toBeNull();

    const usuario = userEvent.setup();
    await escribir(usuario);
    expect(guardarBoton()).not.toHaveAttribute("aria-disabled");
  });

  it("guarda la contraseña nueva, una vez, y pasa a «Contraseña cambiada» con el foco en el título", async () => {
    const { guardar } = montar();
    const usuario = userEvent.setup();
    await escribir(usuario);
    await usuario.click(guardarBoton());

    expect(guardar).toHaveBeenCalledOnce();
    expect(guardar).toHaveBeenCalledWith(CLAVE);
    expect(screen.getByRole("heading", { level: 1, name: T.tituloCambiada })).toHaveFocus();
  });

  it("«Ver» y «Ocultar» muestran cada campo, con un nombre que dice cuál y contiene el texto visible", async () => {
    montar();
    const usuario = userEvent.setup();
    const ver = screen.getByRole("button", { name: `${T.ver} la contraseña nueva` });
    expect(ver).toHaveTextContent(T.ver);
    expect(nueva()).toHaveAttribute("type", "password");
    await usuario.click(ver);
    expect(nueva()).toHaveAttribute("type", "text");
    expect(repetida()).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: `${T.ocultar} la contraseña nueva` })).toHaveTextContent(T.ocultar);
    await usuario.click(screen.getByRole("button", { name: `${T.ver} la contraseña repetida` }));
    expect(repetida()).toHaveAttribute("type", "text");
  });
});

describe("40B · 02 no cumple las reglas", () => {
  it("cada regla dice si cumple, con «faltan N», y «Guardar» sigue apagado", async () => {
    const { guardar } = montar();
    const usuario = userEvent.setup();
    await usuario.type(nueva(), "abc12");
    expect(screen.getByText(T.reglaLargoFaltan(3))).toBeVisible();
    const reglas = screen.getByRole("list", { name: T.reglasTitulo });
    expect(reglas).toHaveTextContent(`${T.reglaLargoFaltan(3)} (${T.noCumple})`);
    expect(reglas).toHaveTextContent(`${T.reglaMayuscula} (${T.noCumple})`);
    expect(reglas).toHaveTextContent(`${T.reglaNumero} (${T.cumple})`);
    await usuario.type(repetida(), "abc12");
    await usuario.click(guardarBoton());
    expect(guardar).not.toHaveBeenCalled();
  });

  it("una Ñ o una letra con tilde cuentan como mayúscula (decisión del 02/10)", async () => {
    montar();
    const usuario = userEvent.setup();
    await usuario.type(nueva(), "ñandú2026Ñ");
    expect(screen.getByRole("list", { name: T.reglasTitulo })).toHaveTextContent(`${T.reglaMayuscula} (${T.cumple})`);
  });

  it("un emoji vale 1 carácter visible", async () => {
    montar();
    const usuario = userEvent.setup();
    await usuario.type(nueva(), "Ab1😀😀😀");
    expect(screen.getByText(T.reglaLargoFaltan(2))).toBeVisible();
  });
});

describe("40B · 03 no coinciden", () => {
  it("el aviso sale en «Repetila» al salir del campo, con su texto, y «Guardar» sigue apagado", async () => {
    const { guardar } = montar();
    const usuario = userEvent.setup();
    await usuario.type(nueva(), CLAVE);
    await usuario.type(repetida(), "Nueva-clave-");
    // Mientras escribe y todavía es más corta, no acusa.
    expect(screen.queryByText(T.noCoinciden)).toBeNull();
    await usuario.tab();
    expect(screen.getByRole("alert")).toHaveTextContent(T.noCoinciden);
    expect(repetida()).toHaveAttribute("aria-invalid", "true");
    expect(repetida()).toHaveAccessibleDescription(T.noCoinciden);
    await usuario.click(guardarBoton());
    expect(guardar).not.toHaveBeenCalled();
  });

  it("si la repetición ya es tan larga como la contraseña y difiere, avisa sin esperar", async () => {
    montar();
    const usuario = userEvent.setup();
    await escribir(usuario, CLAVE, "Nueva-clave-2");
    expect(screen.getByRole("alert")).toHaveTextContent(T.noCoinciden);
  });

  it("al igualarlas el aviso se va", async () => {
    montar();
    const usuario = userEvent.setup();
    await escribir(usuario, CLAVE, "Nueva-clave-2");
    await usuario.type(repetida(), "{Backspace}1");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(guardarBoton()).not.toHaveAttribute("aria-disabled");
  });
});

describe("40B · 04 guardando", () => {
  it("campos y botón apagados hasta la respuesta, y un doble toque o Enter guarda una sola vez", async () => {
    const respuesta = diferida<RespuestaDeGuardado>();
    const guardar = vi.fn(() => respuesta.promesa);
    montar({ guardar });
    const usuario = userEvent.setup();
    await escribir(usuario);
    await usuario.click(guardarBoton());
    expect(guardarBoton()).toHaveTextContent(T.guardando);
    expect(guardarBoton()).toHaveAttribute("aria-disabled", "true");
    expect(nueva()).toBeDisabled();
    expect(repetida()).toBeDisabled();
    await usuario.click(guardarBoton());
    fireEvent.submit(guardarBoton().closest("form")!);
    expect(guardar).toHaveBeenCalledOnce();

    await act(async () => respuesta.resolver({ tipo: "ok" }));
    expect(screen.getByRole("heading", { level: 1, name: T.tituloCambiada })).toBeVisible();
  });
});

describe("40B · 05 contraseña cambiada", () => {
  it("«Ir al login» (no entra directo: se cerraron todas las sesiones) y no queda nada escrito", async () => {
    montar();
    const usuario = userEvent.setup();
    await escribir(usuario);
    await usuario.click(guardarBoton());

    expect(screen.getByRole("status")).toHaveTextContent(T.cambiada);
    expect(screen.getByRole("link", { name: T.irAlLogin })).toHaveAttribute("href", "/acceso?motivo=cerrada");
    expect(screen.queryByLabelText(T.nueva)).toBeNull();
    expect(screen.queryByDisplayValue(CLAVE)).toBeNull();
  });

  describe("el cierre de las otras sesiones no se pudo confirmar", () => {
    async function llegarASinRevocar(propiedades: Partial<PropiedadesDeNuevaContrasena> = {}) {
      const montado = montar(propiedades);
      montado.guardar.mockResolvedValue({ tipo: "ok-sin-revocar" });
      const usuario = userEvent.setup();
      await escribir(usuario);
      await usuario.click(guardarBoton());
      return { ...montado, usuario };
    }
    const botonCerrar = () => screen.getByRole("button", { name: new RegExp(`^(${T.cerrarOtras}|${T.cerrandoOtras})$`) });

    it("no muestra el éxito: avisa, ofrece «Cerrar las otras sesiones» y deja «Ir al login»", async () => {
      await llegarASinRevocar();
      expect(screen.getByRole("heading", { level: 1, name: T.tituloCambiada })).toHaveFocus();
      expect(screen.getByRole("alert")).toHaveTextContent(T.sinRevocar);
      expect(screen.queryByText(T.cambiada)).toBeNull();
      expect(botonCerrar()).not.toHaveAttribute("aria-disabled");
      // «Ir al login» es un botón: un enlace al login dejaría entrar al panel con la sesión de recuperación abierta.
      expect(screen.getByRole("button", { name: T.irAlLogin })).toBeVisible();
      expect(screen.queryByRole("link", { name: T.irAlLogin })).toBeNull();
      expect(screen.queryByDisplayValue(CLAVE)).toBeNull();
    });

    describe("«Ir al login» (decisión del 22/11, P2 del QA de #111)", () => {
      const botonIr = () => screen.getByRole("button", { name: new RegExp(`^(${T.irAlLogin}|${T.saliendo})$`) });

      it("cierra la sesión de este navegador y recién ahí va al login con el correo escrito; no entra al panel", async () => {
        const { salirDeLaRecuperacion, irA, usuario } = await llegarASinRevocar();
        const orden: string[] = [];
        salirDeLaRecuperacion.mockImplementation(async () => {
          orden.push("cerrar");
          expect(irA).not.toHaveBeenCalled();
          return { tipo: "ok" };
        });
        irA.mockImplementation((ruta) => orden.push(`ir:${ruta}`));
        await usuario.click(botonIr());
        expect(orden).toEqual(["cerrar", "ir:/acceso?motivo=cerrada"]);
        // El correo queda escrito para el login de esta pestaña, y la contraseña nunca viaja.
        expect(window.sessionStorage.getItem("panel-ultimo-correo")).toBe(CORREO);
        expect(JSON.stringify({ ...window.sessionStorage, ...window.localStorage })).not.toContain(CLAVE);
        // Y el destino no es el panel.
        expect(irA).not.toHaveBeenCalledWith(expect.stringMatching(/^\/(?!acceso)/));
      });

      it("«Cerrar las otras sesiones» sigue disponible mientras no se haya ido de esa pantalla", async () => {
        const { cerrarOtras, salirDeLaRecuperacion, usuario } = await llegarASinRevocar();
        salirDeLaRecuperacion.mockRejectedValueOnce(new Error("se cortó"));
        await usuario.click(botonIr());
        expect(botonCerrar()).not.toHaveAttribute("aria-disabled");
        await usuario.click(botonCerrar());
        expect(cerrarOtras).toHaveBeenCalledTimes(1);
      });

      it("un doble toque cierra una sola vez y el botón queda ocupado hasta la respuesta", async () => {
        const respuesta = diferida<{ tipo: "ok" }>();
        const { salirDeLaRecuperacion, irA, usuario } = await llegarASinRevocar();
        salirDeLaRecuperacion.mockReturnValueOnce(respuesta.promesa);
        await usuario.dblClick(botonIr());
        expect(salirDeLaRecuperacion).toHaveBeenCalledTimes(1);
        expect(botonIr()).toHaveAttribute("aria-disabled", "true");
        expect(botonIr()).toHaveTextContent(T.saliendo);
        // Ocupado: «Cerrar las otras sesiones» no se pisa con él.
        expect(botonCerrar()).toHaveAttribute("aria-disabled", "true");
        await act(async () => respuesta.resolver({ tipo: "ok" }));
        expect(irA).toHaveBeenCalledTimes(1);
      });

      it("si el cierre no llega, avisa, no navega y el botón vuelve a habilitarse (a la segunda sale)", async () => {
        const { salirDeLaRecuperacion, irA, usuario } = await llegarASinRevocar();
        salirDeLaRecuperacion.mockRejectedValueOnce(new Error("se cortó"));
        await usuario.click(botonIr());
        expect(irA).not.toHaveBeenCalled();
        expect(screen.getByText(T.noPudoSalir)).toBeVisible();
        expect(botonIr()).not.toHaveAttribute("aria-disabled");
        expect(botonIr()).toHaveTextContent(T.irAlLogin);

        await usuario.click(botonIr());
        expect(salirDeLaRecuperacion).toHaveBeenCalledTimes(2);
        expect(irA).toHaveBeenCalledOnce();
        expect(screen.queryByText(T.noPudoSalir)).toBeNull();
      });

      it("dos acciones seguidas: con «Cerrar las otras sesiones» en curso, «Ir al login» espera y no se pierde ninguna", async () => {
        const cierre = diferida<RespuestaDeCierreDeSesiones>();
        const { cerrarOtras, salirDeLaRecuperacion, usuario } = await llegarASinRevocar();
        cerrarOtras.mockReturnValueOnce(cierre.promesa);
        await usuario.click(botonCerrar());
        await usuario.click(botonIr());
        expect(salirDeLaRecuperacion).not.toHaveBeenCalled();
        expect(botonIr()).toHaveAttribute("aria-disabled", "true");
        await act(async () => cierre.resolver({ tipo: "ok" }));
        // El cierre salió bien: es el éxito de siempre, con su enlace al login.
        expect(screen.getByRole("link", { name: T.irAlLogin })).toHaveAttribute("href", "/acceso?motivo=cerrada");
      });

      it("sin conexión queda apagado y no llama al servidor", async () => {
        const { salirDeLaRecuperacion, irA, usuario } = await llegarASinRevocar();
        sinRed(true);
        expect(botonIr()).toHaveAttribute("aria-disabled", "true");
        await usuario.click(botonIr());
        expect(salirDeLaRecuperacion).not.toHaveBeenCalled();
        expect(irA).not.toHaveBeenCalled();
      });
    });

    it("el reintento no pide la contraseña y, si sale bien, sigue el éxito de siempre", async () => {
      const { cerrarOtras, guardar, usuario } = await llegarASinRevocar();
      await usuario.click(botonCerrar());
      expect(cerrarOtras).toHaveBeenCalledTimes(1);
      expect(guardar).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("status")).toHaveTextContent(T.cambiada);
      expect(screen.queryByRole("button", { name: T.cerrarOtras })).toBeNull();
      expect(screen.getByRole("link", { name: T.irAlLogin })).toHaveAttribute("href", "/acceso?motivo=cerrada");
    });

    it("si el reintento sigue sin poder (respuesta o falla de la acción), el aviso queda y el botón se vuelve a habilitar", async () => {
      const { cerrarOtras, usuario } = await llegarASinRevocar();
      cerrarOtras.mockResolvedValueOnce({ tipo: "ok-sin-revocar" });
      await usuario.click(botonCerrar());
      expect(screen.getByRole("alert")).toHaveTextContent(T.sinRevocar);
      expect(botonCerrar()).not.toHaveAttribute("aria-disabled");

      cerrarOtras.mockRejectedValueOnce(new Error("sin red"));
      await usuario.click(botonCerrar());
      expect(screen.getByRole("alert")).toHaveTextContent(T.sinRevocar);
      expect(botonCerrar()).not.toHaveAttribute("aria-disabled");

      // Y un tercer intento todavía puede salir bien.
      await usuario.click(botonCerrar());
      expect(screen.getByRole("status")).toHaveTextContent(T.cambiada);
    });

    it("un doble toque hace un solo cierre y el botón queda ocupado hasta la respuesta", async () => {
      const respuesta = diferida<RespuestaDeCierreDeSesiones>();
      const { cerrarOtras, usuario } = await llegarASinRevocar();
      cerrarOtras.mockReturnValueOnce(respuesta.promesa);
      await usuario.dblClick(botonCerrar());
      expect(cerrarOtras).toHaveBeenCalledTimes(1);
      expect(botonCerrar()).toHaveAttribute("aria-disabled", "true");
      expect(botonCerrar()).toHaveTextContent(T.cerrandoOtras);
      await act(async () => respuesta.resolver({ tipo: "ok" }));
      expect(screen.getByRole("status")).toHaveTextContent(T.cambiada);
    });

    it("sin conexión el botón queda apagado y no llama", async () => {
      const { cerrarOtras, usuario } = await llegarASinRevocar();
      sinRed(true);
      expect(botonCerrar()).toHaveAttribute("aria-disabled", "true");
      await usuario.click(botonCerrar());
      expect(cerrarOtras).not.toHaveBeenCalled();
    });

    it("no tiene fallas de accesibilidad (axe)", async () => {
      const { container } = await llegarASinRevocar();
      expect(await violaciones(container)).toEqual([]);
    });
  });
});

describe("40B · 06 enlace no válido", () => {
  it("sin código ni recuperación en curso: una sola pantalla, con el texto del teléfono y dos salidas", () => {
    montar({ inicial: { paso: "no-valido" } });
    expect(screen.getByRole("heading", { level: 1, name: T.tituloNoValido })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(T.noValido);
    expect(screen.getByRole("link", { name: T.solicitarNuevo })).toHaveAttribute("href", "/acceso/olvide");
    expect(screen.getByRole("link", { name: T.volverAlLogin })).toHaveAttribute("href", "/acceso");
    // No afirma por qué falló (vencido, usado u otro navegador: no se sabe).
    expect(screen.queryByText(/venció|ya se usó/)).toBeNull();
  });

  it("un código vencido o usado cae en la misma pantalla", async () => {
    const abrir = vi.fn(async (): Promise<RespuestaDeApertura> => ({ tipo: "no-valido" }));
    montar({ inicial: { paso: "abrir", codigo: "c-vencido" }, abrir });
    expect(await screen.findByRole("heading", { level: 1, name: T.tituloNoValido })).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent(T.noValido);
  });

  it("si al guardar la sesión de recuperación ya no está, también es «Enlace no válido» y no queda nada escrito", async () => {
    const { guardar } = montar();
    guardar.mockResolvedValue({ tipo: "enlace-no-valido" });
    const usuario = userEvent.setup();
    await escribir(usuario);
    await usuario.click(guardarBoton());
    expect(screen.getByRole("heading", { level: 1, name: T.tituloNoValido })).toBeVisible();
    expect(screen.queryByDisplayValue(CLAVE)).toBeNull();
  });
});

describe("40B · 07 error al guardar y 08 sin conexión", () => {
  it("error: el aviso, «Reintentar», lo escrito queda y al reintentar guarda", async () => {
    const { guardar } = montar();
    guardar.mockResolvedValueOnce({ tipo: "no-disponible" });
    const usuario = userEvent.setup();
    await escribir(usuario);
    await usuario.click(guardarBoton());

    expect(screen.getByRole("alert")).toHaveTextContent(T.errorAlGuardar);
    expect(guardarBoton()).toHaveTextContent(T.reintentar);
    expect(guardarBoton()).not.toHaveAttribute("aria-disabled");
    expect(nueva()).toHaveValue(CLAVE);
    expect(nueva()).toBeEnabled();

    await usuario.click(guardarBoton());
    expect(guardar).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("heading", { level: 1, name: T.tituloCambiada })).toBeVisible();
  });

  it("la acción que tira a mitad de camino deja el botón habilitado y lo escrito", async () => {
    const { guardar } = montar();
    guardar.mockRejectedValueOnce(new Error("se cortó"));
    const usuario = userEvent.setup();
    await escribir(usuario);
    await usuario.click(guardarBoton());
    expect(screen.getByRole("alert")).toHaveTextContent(T.errorAlGuardar);
    expect(guardarBoton()).not.toHaveAttribute("aria-disabled");
    expect(repetida()).toHaveValue(CLAVE);
  });

  it("sin conexión: el cartel punteado, «Guardar» apagado y no se manda nada", async () => {
    const { guardar } = montar();
    const usuario = userEvent.setup();
    await escribir(usuario);
    sinRed(true);
    expect(screen.getByRole("status")).toHaveTextContent(T.sinConexion);
    expect(guardarBoton()).toHaveAttribute("aria-disabled", "true");
    await usuario.click(guardarBoton());
    expect(guardar).not.toHaveBeenCalled();

    sinRed(false);
    await usuario.click(guardarBoton());
    expect(guardar).toHaveBeenCalledOnce();
  });
});

describe("40B · avisos que el servidor dice y el canvas no dibuja", () => {
  it.each([
    ["misma-contrasena" as const, T.mismaContrasena],
    ["contrasena-debil" as const, T.contrasenaDebil],
  ])("%s: el aviso sale bajo los campos, el foco va a la contraseña y se corrige solo al escribir", async (tipo, texto) => {
    const { guardar } = montar();
    guardar.mockResolvedValueOnce({ tipo });
    const usuario = userEvent.setup();
    await escribir(usuario);
    await usuario.click(guardarBoton());
    expect(screen.getByRole("alert")).toHaveTextContent(texto);
    expect(nueva()).toHaveFocus();
    expect(nueva()).toHaveAccessibleDescription(texto);
    expect(guardarBoton()).toHaveTextContent(T.guardar);

    await usuario.type(nueva(), "2");
    expect(screen.queryByText(texto)).toBeNull();
  });
});

describe("abrir el enlace del correo", () => {
  beforeEach(() => {
    vi.spyOn(window.history, "replaceState");
  });

  it("verifica el código, nombra la cuenta, saca el código de la URL y lleva el foco a la contraseña", async () => {
    const respuesta = diferida<RespuestaDeApertura>();
    const abrir = vi.fn(() => respuesta.promesa);
    montar({ inicial: { paso: "abrir", codigo: "c-bueno" }, abrir });
    expect(screen.getByRole("status")).toHaveTextContent(T.verificando);
    expect(screen.queryByLabelText(T.nueva)).toBeNull();

    await act(async () => respuesta.resolver({ tipo: "ok", correo: CORREO }));
    expect(abrir).toHaveBeenCalledOnce();
    expect(abrir).toHaveBeenCalledWith("c-bueno");
    expect(screen.getByText(T.para(CORREO))).toBeVisible();
    expect(nueva()).toHaveFocus();
    expect(window.history.replaceState).toHaveBeenCalledWith(null, "", "/acceso/nueva-contrasena");
  });

  it("el mismo código se canjea una sola vez aunque el efecto corra dos veces (React en desarrollo)", async () => {
    const respuesta = diferida<RespuestaDeApertura>();
    const abrir = vi.fn(() => respuesta.promesa);
    const inicial = { paso: "abrir", codigo: "c-doble" } as const;
    const { unmount } = render(<PantallaNuevaContrasena inicial={inicial} abrir={abrir} guardar={vi.fn()} cerrarOtras={vi.fn()} salirDeLaRecuperacion={vi.fn()} />);
    unmount();
    render(<PantallaNuevaContrasena inicial={inicial} abrir={abrir} guardar={vi.fn()} cerrarOtras={vi.fn()} salirDeLaRecuperacion={vi.fn()} />);
    expect(abrir).toHaveBeenCalledOnce();
    await act(async () => respuesta.resolver({ tipo: "ok", correo: CORREO }));
    expect(screen.getByText(T.para(CORREO))).toBeVisible();
  });

  it("si no se pudo comprobar (no es un enlace vencido) ofrece «Reintentar» y el segundo intento canjea de nuevo", async () => {
    const abrir = vi.fn<PropiedadesDeNuevaContrasena["abrir"]>(async () => ({ tipo: "no-disponible" }));
    montar({ inicial: { paso: "abrir", codigo: "c-sin-red" }, abrir });
    expect(await screen.findByRole("heading", { level: 1, name: T.tituloNoSePudoAbrir })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(T.noSePudoAbrir);
    expect(screen.queryByText(T.noValido)).toBeNull();

    abrir.mockResolvedValueOnce({ tipo: "ok", correo: CORREO });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: T.reintentar })));
    expect(abrir).toHaveBeenCalledTimes(2);
    expect(await screen.findByLabelText(T.nueva)).toBeVisible();
  });

  it("una acción que tira al abrir es «no se pudo comprobar»", async () => {
    montar({ inicial: { paso: "abrir", codigo: "c-tira" }, abrir: vi.fn(async () => Promise.reject(new Error("se cortó"))) });
    expect(await screen.findByRole("heading", { level: 1, name: T.tituloNoSePudoAbrir })).toBeVisible();
  });

  it("volver atrás y reentrar con el código ya usado muestra «Enlace no válido»", async () => {
    const abrir = vi.fn(async (): Promise<RespuestaDeApertura> => ({ tipo: "no-valido" }));
    const primera = montar({ inicial: { paso: "abrir", codigo: "c-usado" }, abrir });
    await screen.findByRole("heading", { level: 1, name: T.tituloNoValido });
    primera.unmount();
    montar({ inicial: { paso: "abrir", codigo: "c-usado" }, abrir });
    expect(await screen.findByRole("heading", { level: 1, name: T.tituloNoValido })).toBeVisible();
  });
});

describe("40B · contraseña de más de 72 bytes que el servidor rechaza (decisión del 22/11, P1 del QA de #111)", () => {
  it("el rechazo por largo dice «Es demasiado larga. Acortala.» y no «No pudimos guardar la contraseña»; lo escrito queda y el aviso se va al cambiarla", async () => {
    const { guardar } = montar();
    guardar.mockResolvedValueOnce({ tipo: "contrasena-larga" });
    const usuario = userEvent.setup();
    await escribir(usuario);
    await usuario.click(guardarBoton());

    expect(screen.getByRole("alert")).toHaveTextContent(T.demasiadaLarga);
    expect(screen.queryByText(T.errorAlGuardar)).toBeNull();
    expect(nueva()).toHaveAttribute("aria-invalid", "true");
    expect(nueva()).toHaveValue(CLAVE);
    expect(nueva()).toHaveFocus();
    // El botón no queda trabado.
    expect(guardarBoton()).toHaveTextContent(T.guardar);
    expect(guardarBoton()).not.toHaveAttribute("aria-disabled");

    await usuario.type(nueva(), "x");
    expect(screen.queryByText(T.demasiadaLarga)).toBeNull();
  });
});

describe("40B · datos límite", () => {
  it("una contraseña larguísima y una cuenta con correo largo no rompen la pantalla", async () => {
    const largo = `${"x".repeat(60)}@${"y".repeat(60)}.com`;
    const { guardar } = montar({ inicial: { paso: "nueva", correo: largo } });
    expect(screen.getByText(T.para(largo)).className).toContain("wrap-anywhere");
    // Con el tope justo (72 bytes) se guarda; con más, no (HU-AUTH-001 «Topes de largo»).
    const clave = `A1${"b".repeat(70)}`;
    fireEvent.change(nueva(), { target: { value: clave } });
    fireEvent.change(repetida(), { target: { value: clave } });
    await act(async () => fireEvent.click(guardarBoton()));
    expect(guardar).toHaveBeenCalledWith(clave);
  });

  it("una contraseña de más de 72 bytes avisa «Es demasiado larga. Acortala.», apaga «Guardar», no se recorta y el aviso se va al acortarla", async () => {
    const { guardar } = montar();
    const larga = `A1${"b".repeat(71)}`;
    fireEvent.change(nueva(), { target: { value: larga } });
    fireEvent.change(repetida(), { target: { value: larga } });
    expect(screen.getByRole("alert")).toHaveTextContent(T.demasiadaLarga);
    expect(nueva()).toHaveAttribute("aria-invalid", "true");
    expect(nueva()).toHaveValue(larga);
    expect(guardarBoton()).toHaveAttribute("aria-disabled", "true");
    await act(async () => fireEvent.click(guardarBoton()));
    expect(guardar).not.toHaveBeenCalled();

    fireEvent.change(nueva(), { target: { value: larga.slice(0, 70) } });
    expect(screen.queryByText(T.demasiadaLarga)).toBeNull();
  });
});

describe("vista 40B · accesibilidad (axe A/AA, sin contraste)", () => {
  it("cada estado de la pantalla", async () => {
    for (const inicial of [{ paso: "nueva" as const, correo: CORREO }, { paso: "no-valido" as const }]) {
      const { container, unmount } = montar({ inicial });
      expect(await violaciones(container), JSON.stringify(inicial)).toEqual([]);
      unmount();
    }
  });

  it("con reglas sin cumplir, no coinciden, guardando, error, sin conexión y cambiada", async () => {
    const respuesta = diferida<RespuestaDeGuardado>();
    const { container, guardar } = montar();
    guardar.mockImplementationOnce(() => respuesta.promesa);
    const usuario = userEvent.setup();

    await usuario.type(nueva(), "abc12");
    expect(await violaciones(container)).toEqual([]);
    await usuario.clear(nueva());
    await escribir(usuario, CLAVE, "Nueva-clave-2");
    expect(await violaciones(container)).toEqual([]);
    await usuario.clear(repetida());
    await usuario.type(repetida(), CLAVE);
    await usuario.click(guardarBoton());
    expect(await violaciones(container)).toEqual([]);

    await act(async () => respuesta.resolver({ tipo: "no-disponible" }));
    expect(await violaciones(container)).toEqual([]);
    sinRed(true);
    expect(await violaciones(container)).toEqual([]);
    sinRed(false);
    await usuario.click(guardarBoton());
    expect(await violaciones(container)).toEqual([]);
  });

  it("verificando y no se pudo abrir", async () => {
    const respuesta = diferida<RespuestaDeApertura>();
    const { container } = montar({ inicial: { paso: "abrir", codigo: "c-axe" }, abrir: vi.fn(() => respuesta.promesa) });
    expect(await violaciones(container)).toEqual([]);
    await act(async () => respuesta.resolver({ tipo: "no-disponible" }));
    expect(await violaciones(container)).toEqual([]);
  });
});
