import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AccionesCuentas, DatosDeCuentas, ResultadoDeAccion, ResultadoDeAnulacion } from "@/datos/cuentas";
import { armarCuentasSimuladas, crearAccionesSimuladas } from "@/datos/cuentas/simulado";
import { ProveedorModoDev } from "@/dev/ProveedorModoDev";
import { CuentasVista } from "@/features/cuentas/CuentasVista";
import { hayTrabajoPendiente } from "@/shell/trabajo-pendiente";

/**
 * QA de «Anular cobro» (front-coordinadores-web#81, PR 201, vista 39): lo que no cubren los tests del implementador. Caso límite
 * de la señal con el diálogo abierto (qué dice), escrituras superpuestas (otra escritura en camino, otra ciudad), reentrada
 * después de un error, lo que viaja al servidor con «Otro» (espacios, emoji, pegado largo), un ticket por validar, privacidad
 * (nada de lo escrito en la consola) y axe A/AA en cada estado del diálogo y del detalle (el contraste va en la corrida con
 * navegador real: jsdom no tiene layout).
 */

const AHORA = new Date("2026-10-22T15:00:00.000Z");
const EJEMPLOS = [
  "florencia-pintos-cobro-vigente",
  "valentina-silva-cobro-pasado",
  "joaquin-duarte-cobro-anulado",
  "lucia-fernandez-por-validar",
  "sofia-cabral-por-validar",
];

function datosDeLaVista39(): DatosDeCuentas {
  const base = armarCuentasSimuladas(AHORA);
  return { ...base, tickets: base.tickets.filter((t) => EJEMPLOS.includes(t.id)) };
}

function diferida<T>() {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>((res) => {
    resolver = res;
  });
  return { promesa, resolver };
}

type Anular = AccionesCuentas["anularCobro"];
type Usuario = ReturnType<typeof userEvent.setup>;

function montar(opciones: { anularCobro?: Anular; editarAlquiler?: AccionesCuentas["editarAlquiler"] } = {}) {
  const datos = datosDeLaVista39();
  const base = crearAccionesSimuladas(datos, () => AHORA.getTime());
  const anularCobro = vi.fn<Anular>(opciones.anularCobro ?? base.anularCobro);
  const editarAlquiler = vi.fn(opciones.editarAlquiler ?? base.editarAlquiler);
  const acciones: AccionesCuentas = { ...base, anularCobro, editarAlquiler };
  const usuario = userEvent.setup();
  const r = render(
    <ProveedorModoDev activo={false}>
      <CuentasVista datos={datos} acciones={acciones} />
    </ProveedorModoDev>,
  );
  return { usuario, anularCobro, editarAlquiler, base, datos, ...r };
}

function conConexion(hay: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(hay);
  act(() => {
    window.dispatchEvent(new Event(hay ? "online" : "offline"));
  });
}

/** Sin ciudad se queda en «Todas» (Sofía Cabral es de Artigas; los demás cobros son de Rivera). */
async function irATickets(usuario: Usuario, ciudad: RegExp | null = /^Rivera/) {
  if (ciudad) await usuario.click(screen.getByRole("button", { name: ciudad }));
  await usuario.click(screen.getByRole("tab", { name: /Tickets/ }));
}

const botonAnular = (nombre: string) => screen.getByRole("button", { name: `Anular cobro de ${nombre}` });
const dialogo = () => screen.getByRole("dialog");

async function abrirDialogo(usuario: Usuario, nombre = "Florencia Pintos") {
  await irATickets(usuario);
  await usuario.click(screen.getByRole("button", { name: nombre }));
  await usuario.click(botonAnular(nombre));
  return within(dialogo());
}

async function elegirYSeguir(usuario: Usuario, motivo: string, nombre = "Florencia Pintos") {
  const d = await abrirDialogo(usuario, nombre);
  await usuario.click(d.getByRole("radio", { name: motivo }));
  await usuario.click(d.getByRole("button", { name: "Seguir" }));
  return d;
}

async function violaciones(raiz: Element) {
  const r = await axe.run(raiz, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("QA #81 · sin señal con el diálogo abierto", () => {
  it.skip("QA #81: si falla por falta de señal el aviso dice «Necesitás conexión para anular un cobro» (convención de avisos), no el texto genérico", async () => {
    // Convenciones de desarrollo, «Sin conexión, por pantalla»: una falla de red se dice con «Necesitás conexión para <acción>».
    // Hoy `textoDeFallaAlAnular` ignora la causa `sin-conexion` y muestra «No pudimos anular el cobro. No cambió nada: probá de nuevo.»
    // (`anular-cobro.ts`), que no dice que el problema es la conexión: el usuario sin señal reintenta a ciegas.
    const { usuario } = montar({ anularCobro: async () => ({ ok: false, causa: "sin-conexion" }) });
    const d = await elegirYSeguir(usuario, "Monto equivocado");
    conConexion(false);
    await usuario.click(d.getByRole("button", { name: "Sí, anular el cobro" }));
    await waitFor(() => expect(d.getByRole("alert")).toHaveTextContent("Necesitás conexión para anular un cobro"));
  });

  it("el diálogo no se cierra solo al perder la señal y lo elegido se conserva; al volver, confirmar anula", async () => {
    const { usuario, anularCobro } = montar();
    const d = await elegirYSeguir(usuario, "Cliente equivocado");
    conConexion(false);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(d.getByText("Cliente equivocado")).toBeInTheDocument();
    conConexion(true);
    await usuario.click(d.getByRole("button", { name: "Sí, anular el cobro" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(anularCobro).toHaveBeenCalledWith("cobro-florencia-pintos-vigente", "Cliente equivocado", undefined);
  });
});

describe("QA #81 · escrituras superpuestas", () => {
  it("con una anulación en camino, el «Anular cobro» de otro cobro (detrás del diálogo) no abre nada ni manda un segundo pedido", async () => {
    const espera = diferida<ResultadoDeAccion<ResultadoDeAnulacion>>();
    const { usuario, anularCobro, base } = montar({ anularCobro: () => espera.promesa });
    await irATickets(usuario, null);
    await usuario.click(screen.getByRole("button", { name: "Florencia Pintos" }));
    await usuario.click(screen.getByRole("button", { name: "Sofía Cabral" }));
    await usuario.click(botonAnular("Florencia Pintos"));
    await usuario.click(within(dialogo()).getByRole("radio", { name: "Monto equivocado" }));
    await usuario.click(within(dialogo()).getByRole("button", { name: "Seguir" }));
    await usuario.click(within(dialogo()).getByRole("button", { name: "Sí, anular el cobro" }));
    expect(hayTrabajoPendiente()).toBe(true);

    // El botón de la otra fila queda apagado y, aunque se fuerce el click, no se manda nada.
    const otro = botonAnular("Sofía Cabral");
    expect(otro).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(otro);
    expect(anularCobro).toHaveBeenCalledTimes(1);

    await act(async () => {
      espera.resolver(await base.anularCobro("cobro-florencia-pintos-vigente", "Monto equivocado"));
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(hayTrabajoPendiente()).toBe(false);
    // Terminada la primera, la segunda se puede hacer: no quedó ningún «ocupado» trabado.
    expect(botonAnular("Sofía Cabral")).not.toHaveAttribute("aria-disabled", "true");
  });

  it("con otra escritura en camino (guardar el alquiler) no se abre el diálogo de anular", async () => {
    const espera = diferida<ResultadoDeAccion<number>>();
    const { usuario, editarAlquiler } = montar({ editarAlquiler: () => espera.promesa });
    await usuario.click(screen.getByRole("button", { name: "Editar" }));
    const form = within(screen.getByRole("form", { name: "Editar el alquiler de la campaña" }));
    const campo = form.getByRole("textbox");
    await usuario.clear(campo);
    await usuario.type(campo, "1500");
    await usuario.click(form.getByRole("button", { name: /Guardar/ }));
    await waitFor(() => expect(editarAlquiler).toHaveBeenCalledTimes(1));

    await irATickets(usuario);
    await usuario.click(screen.getByRole("button", { name: "Florencia Pintos" }));
    expect(botonAnular("Florencia Pintos")).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(botonAnular("Florencia Pintos"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => {
      espera.resolver({ ok: true, valor: 1500 });
    });
    expect(hayTrabajoPendiente()).toBe(false);
  });
});

describe("QA #81 · reentrada después de un error", () => {
  it("un error, Esc y volver a abrir: el diálogo empieza de cero (sin aviso, sin motivo) y se puede anular", async () => {
    let intento = 0;
    const { usuario, base, anularCobro } = montar({
      anularCobro: async (...args) => (++intento === 1 ? { ok: false, causa: "sin-conexion" } : base.anularCobro(...args)),
    });
    const d = await elegirYSeguir(usuario, "Monto equivocado");
    await usuario.click(d.getByRole("button", { name: "Sí, anular el cobro" }));
    await waitFor(() => expect(d.getByRole("alert")).toBeInTheDocument());
    await usuario.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(hayTrabajoPendiente()).toBe(false);

    await usuario.click(botonAnular("Florencia Pintos"));
    const otra = within(dialogo());
    expect(otra.queryByRole("alert")).not.toBeInTheDocument();
    expect(otra.getByRole("button", { name: "Seguir" })).toHaveAttribute("aria-disabled", "true");
    await usuario.click(otra.getByRole("radio", { name: "Lo registré dos veces" }));
    await usuario.click(otra.getByRole("button", { name: "Seguir" }));
    await usuario.click(otra.getByRole("button", { name: "Sí, anular el cobro" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(anularCobro).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toHaveTextContent("Cobro anulado.");
  });

  it("tras el error, lo escrito con «Otro» no se pierde al volver y reintentar", async () => {
    let intento = 0;
    const { usuario, base } = montar({
      anularCobro: async (...args) => (++intento === 1 ? { ok: false, causa: "sin-conexion" } : base.anularCobro(...args)),
    });
    const d = await abrirDialogo(usuario);
    await usuario.click(d.getByRole("radio", { name: "Otro" }));
    await usuario.type(d.getByRole("textbox"), "Cobré de más");
    await usuario.click(d.getByRole("button", { name: "Seguir" }));
    await usuario.click(d.getByRole("button", { name: "Sí, anular el cobro" }));
    await waitFor(() => expect(d.getByRole("alert")).toBeInTheDocument());
    expect(d.getByText("Otro: Cobré de más")).toBeInTheDocument();
    await usuario.click(d.getByRole("button", { name: "Volver" }));
    expect(d.getByRole("textbox")).toHaveValue("Cobré de más");
  });
});

describe("QA #81 · «Otro»: lo que viaja al servidor", () => {
  it("solo espacios no deja seguir; con emoji y espacios de más manda el texto recortado", async () => {
    const { usuario, anularCobro } = montar();
    const d = await abrirDialogo(usuario);
    await usuario.click(d.getByRole("radio", { name: "Otro" }));
    await usuario.type(d.getByRole("textbox"), "     ");
    expect(d.getByRole("button", { name: "Seguir" })).toHaveAttribute("aria-disabled", "true");
    await usuario.click(d.getByRole("button", { name: "Seguir" }));
    expect(d.queryByRole("button", { name: "Sí, anular el cobro" })).not.toBeInTheDocument();
    expect(d.getByRole("alert")).toHaveTextContent("Escribí el motivo para seguir.");

    await usuario.type(d.getByRole("textbox"), "  Cobré de más 😀  ");
    await usuario.click(d.getByRole("button", { name: "Seguir" }));
    await usuario.click(d.getByRole("button", { name: "Sí, anular el cobro" }));
    await waitFor(() => expect(anularCobro).toHaveBeenCalledTimes(1));
    expect(anularCobro).toHaveBeenCalledWith("cobro-florencia-pintos-vigente", "Otro", "Cobré de más 😀");
  });

  it("un texto pegado de 5.000 caracteres queda en 200 y es lo que viaja", async () => {
    const { usuario, anularCobro } = montar();
    const d = await abrirDialogo(usuario);
    await usuario.click(d.getByRole("radio", { name: "Otro" }));
    fireEvent.change(d.getByRole("textbox"), { target: { value: "ñ".repeat(5000) } });
    expect((d.getByRole("textbox") as HTMLInputElement).value).toHaveLength(200);
    await usuario.click(d.getByRole("button", { name: "Seguir" }));
    await usuario.click(d.getByRole("button", { name: "Sí, anular el cobro" }));
    await waitFor(() => expect(anularCobro).toHaveBeenCalledTimes(1));
    expect(anularCobro.mock.calls[0]?.[2]).toHaveLength(200);
  });

  it("caracteres especiales (HTML, comillas) se muestran como texto, no como marcado", async () => {
    const { usuario } = montar();
    const d = await abrirDialogo(usuario);
    await usuario.click(d.getByRole("radio", { name: "Otro" }));
    fireEvent.change(d.getByRole("textbox"), { target: { value: '<img src=x onerror="alert(1)"> "a" & \'b\'' } });
    await usuario.click(d.getByRole("button", { name: "Seguir" }));
    expect(d.getByText(/Otro: <img src=x/)).toBeInTheDocument();
    expect(dialogo().querySelector("img")).toBeNull();
  });
});

describe("QA #81 · un cobro todavía por validar", () => {
  it("anular el cobro de un ticket por validar lo saca de «Por validar» y del «Validar», sin mover la plata", async () => {
    const { usuario } = montar();
    await irATickets(usuario, null);
    const kpis = () => screen.getByText("POR VALIDAR").parentElement as HTMLElement;
    const antes = kpis().textContent;
    await usuario.click(screen.getByRole("button", { name: "Sofía Cabral" }));
    expect(screen.getByLabelText("Validar el ticket de Sofía Cabral")).toBeInTheDocument();
    await usuario.click(botonAnular("Sofía Cabral"));
    await usuario.click(within(dialogo()).getByRole("radio", { name: "Cliente equivocado" }));
    await usuario.click(within(dialogo()).getByRole("button", { name: "Seguir" }));
    await usuario.click(within(dialogo()).getByRole("button", { name: "Sí, anular el cobro" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByLabelText("Validar el ticket de Sofía Cabral")).not.toBeInTheDocument();
    expect(kpis().textContent).not.toBe(antes);
  });
});

describe("QA #81 · privacidad", () => {
  it("nada de lo escrito con «Otro» ni del monto sale por la consola durante el flujo completo", async () => {
    const espias = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const { usuario } = montar();
    const d = await abrirDialogo(usuario);
    await usuario.click(d.getByRole("radio", { name: "Otro" }));
    await usuario.type(d.getByRole("textbox"), "secreto-del-cliente");
    await usuario.click(d.getByRole("button", { name: "Seguir" }));
    await usuario.click(d.getByRole("button", { name: "Sí, anular el cobro" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const salida = espias.flatMap((e) => e.mock.calls.flat()).map(String).join("\n");
    expect(salida).not.toMatch(/secreto-del-cliente/);
  });
});

describe("QA #81 · axe A/AA (sin contraste) en cada estado", () => {
  it("el detalle: con «Anular cobro», fuera de plazo, anulado desde el teléfono y sin conexión", { timeout: 30_000 }, async () => {
    const { usuario } = montar();
    await irATickets(usuario);
    await usuario.click(screen.getByRole("button", { name: "Florencia Pintos" }));
    await usuario.click(screen.getByRole("button", { name: "Valentina Silva" }));
    await usuario.click(screen.getByRole("button", { name: "Joaquín Duarte" }));
    expect(await violaciones(document.body)).toEqual([]);
    conConexion(false);
    expect(await violaciones(document.body)).toEqual([]);
  });

  it("el diálogo: motivo, «Otro», confirmar, error y «No se anuló»", { timeout: 30_000 }, async () => {
    let intento = 0;
    const { usuario } = montar({
      anularCobro: async () => (++intento === 1 ? { ok: false, causa: "sin-conexion" } : { ok: false, causa: "rechazado", codigo: "fuera-de-plazo", mensaje: "x" }),
    });
    const d = await abrirDialogo(usuario);
    expect(await violaciones(document.body)).toEqual([]);
    await usuario.click(d.getByRole("radio", { name: "Otro" }));
    expect(await violaciones(document.body)).toEqual([]);
    await usuario.type(d.getByRole("textbox"), "Cobré de más");
    await usuario.click(d.getByRole("button", { name: "Seguir" }));
    expect(await violaciones(document.body)).toEqual([]);
    await usuario.click(d.getByRole("button", { name: "Sí, anular el cobro" }));
    await waitFor(() => expect(d.getByRole("alert")).toBeInTheDocument());
    expect(await violaciones(document.body)).toEqual([]);
    await usuario.click(d.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(d.getByRole("heading", { name: "No se anuló" })).toBeInTheDocument());
    expect(await violaciones(document.body)).toEqual([]);
  });
});
