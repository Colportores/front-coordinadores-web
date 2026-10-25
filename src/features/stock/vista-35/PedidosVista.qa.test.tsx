import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AccionesPedidos, DatosDePedidos, DecisionDeSolicitud, ResultadoDeAccion, SolicitudResuelta } from "@/datos/stock/pedidos";
import { crearDatosDePedidosSimulados } from "@/datos/stock/pedidos/simulado";
import { reiniciarTrabajoPendiente } from "@/shell/trabajo-pendiente";

import { PedidosVista } from "./PedidosVista";

// QA de la vista 35 (PR #89, issue #66): lo que los tests del implementador no cubren.

const AHORA = new Date("2026-10-22T18:00:00-03:00");
const simulados = (): DatosDePedidos => crearDatosDePedidosSimulados(AHORA);

type Resultado = ResultadoDeAccion<SolicitudResuelta>;

const ok = (d: DecisionDeSolicitud): Resultado => ({
  ok: true,
  valor: {
    tipo: d.tipo,
    id: d.id,
    estado: d.accion === "autorizar" ? (d.tipo === "pedido" ? "AUTORIZADO" : "AUTORIZADA") : d.tipo === "pedido" ? "RECHAZADO" : "RECHAZADA",
    resueltoEn: AHORA.toISOString(),
    motivoDeRechazo: d.accion === "rechazar" ? d.motivo : null,
  },
});

function acciones(responder: (d: DecisionDeSolicitud) => Promise<Resultado> | Resultado = ok) {
  const decidir = vi.fn(async (d: DecisionDeSolicitud) => responder(d));
  return { decidir } satisfies AccionesPedidos;
}

function diferida() {
  let resolver!: (r: Resultado) => void;
  const promesa = new Promise<Resultado>((res) => {
    resolver = res;
  });
  return { promesa, resolver };
}

function montar(datos = simulados(), a = acciones()) {
  const vista = render(<PedidosVista datos={datos} acciones={a} />);
  return { ...vista, acciones: a };
}

const detalle = (titulo: string) => screen.getByRole("region", { name: titulo });
const autorizar = () => within(detalle("Pedido #231")).getByRole("button", { name: /^Autorizar/ });
const abrirRechazo = async () => {
  await userEvent.click(within(detalle("Pedido #231")).getByRole("button", { name: /^Rechazar/ }));
  return screen.getByRole("textbox", { name: /MOTIVO DEL RECHAZO/ });
};

afterEach(() => {
  reiniciarTrabajoPendiente();
});

// --- contraste (axe en jsdom no lo mide: se calcula con los tokens de globals.css) -------------------------------------

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const token = (nombre: string): string => {
  const m = css.match(new RegExp(`--${nombre}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --${nombre} no encontrado`);
  return m[1];
};
const luminancia = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const razon = (a: string, b: string) => {
  const [x, y] = [luminancia(token(a)), luminancia(token(b))];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

describe("PedidosVista · QA · contraste de los textos de la vista (AA: 4,5:1)", () => {
  it.each([
    ["etiqueta «Por autorizar» / «Supera el límite» (alerta sobre alerta-fondo)", "alerta", "alerta-fondo"],
    ["etiqueta «Rechazado» y error de motivo (peligro sobre peligro-fondo)", "peligro", "peligro-fondo"],
    ["aviso de éxito (exito sobre exito-fondo)", "exito", "exito-fondo"],
    ["etiqueta «Autorizado» / «Despachado» (marca-media sobre marca-clara)", "marca-media", "marca-clara"],
    ["«Ver en Cuentas →» y paso actual (marca-media sobre superficie)", "marca-media", "superficie"],
    ["«Rechazar» (peligro sobre superficie)", "peligro", "superficie"],
    ["«Confirmar rechazo» (superficie sobre peligro)", "superficie", "peligro"],
    ["«Autorizar» y pestaña activa (superficie sobre marca)", "superficie", "marca"],
    ["«cuándo» y notas de la fila abierta (tinta-suave sobre marca-clara)", "tinta-suave", "marca-clara"],
    ["encabezados y notas (tinta-suave sobre superficie)", "tinta-suave", "superficie"],
    ["nota del detalle (tinta-2 sobre superficie-suave)", "tinta-2", "superficie-suave"],
    ["número del pedido sobre el fondo de página (tinta-suave sobre fondo)", "tinta-suave", "fondo"],
  ])("%s", (_nombre, fg, bg) => {
    expect(razon(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});

// --- tamaños -----------------------------------------------------------------------------------------------------------

describe("PedidosVista · QA · tamaños", () => {
  it("QA #66: a 1280 px con la lista de ciudades abierta la bandeja deja ancho para el nombre y lo que pide cada fila", () => {
    // El panel es solo escritorio (shell con `min-w-[1280px]`). jsdom no hace layout: se calcula con las clases reales.
    // Medido en un navegador: el nombre del colportor y «3 productos · 48 unidades» necesitan ~140 px, además de los 64 px del
    // número, el monto, la etiqueta («△ Supera el límite», ~118 px), los huecos y el relleno: la bandeja necesita ≥ 460 px.
    const { container } = montar();
    // Las columnas son `minmax(<mínimo de la bandeja>px,1fr)` y `minmax(<mínimo del detalle>px,<máximo>px)`: la bandeja nunca baja de
    // su mínimo y el detalle se achica antes de quitarle ancho. Alcanza si los dos mínimos entran en lo que queda a 1280 px.
    const patron = /grid-cols-\[minmax\((\d+)px,1fr\)_minmax\((\d+)px,(\d+)px\)\]/;
    const rejilla = Array.from(container.querySelectorAll<HTMLElement>("div")).find((el) => patron.test(el.className));
    expect(rejilla, "no se encontró la rejilla bandeja + detalle").toBeDefined();
    const [, minimoBandeja, minimoDetalle] = patron.exec(rejilla!.className)!.map(Number);
    expect(minimoBandeja).toBeGreaterThanOrEqual(460);
    const disponible = 1280 - 320 - 44 - 16;
    expect(minimoBandeja + minimoDetalle).toBeLessThanOrEqual(disponible);
  });
});

// --- validación del motivo ---------------------------------------------------------------------------------------------

describe("PedidosVista · QA · motivo del rechazo", () => {
  it("solo saltos de línea y tabulaciones tampoco cuentan como motivo", async () => {
    const { acciones: a } = montar();
    const campo = await abrirRechazo();
    fireEvent.change(campo, { target: { value: "\n\n\t \n" } });
    await userEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Escribí el motivo para rechazar el pedido.");
    expect(a.decidir).not.toHaveBeenCalled();
    expect(campo).toHaveFocus();
  });

  it("un texto pegado larguísimo se corta en el tope del campo, no rompe nada y se puede rechazar", async () => {
    const { acciones: a } = montar();
    const campo = await abrirRechazo();
    await userEvent.click(campo);
    await userEvent.paste("😀".repeat(1000));

    expect((campo as HTMLTextAreaElement).value.length).toBeLessThanOrEqual(500);
    await userEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));
    await waitFor(() => expect(a.decidir).toHaveBeenCalledTimes(1));
    const decision = a.decidir.mock.calls[0][0];
    expect(decision.accion === "rechazar" && decision.motivo.length).toBeLessThanOrEqual(500);
  });

  it("caracteres especiales y HTML se mandan tal cual (no se interpretan)", async () => {
    const { acciones: a } = montar();
    const campo = await abrirRechazo();
    await userEvent.type(campo, "<b>no</b> & \"comillas\" ñandú ✓");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));

    await waitFor(() => expect(a.decidir).toHaveBeenCalledTimes(1));
    expect(a.decidir.mock.calls[0][0]).toMatchObject({ accion: "rechazar", motivo: '<b>no</b> & "comillas" ñandú ✓' });
    expect(Array.from(document.querySelectorAll("b")).some((b) => b.textContent === "no")).toBe(false);
  });

  it("después de un error de motivo vacío, escribir limpia el aviso y lo escrito se conserva al fallar el envío", async () => {
    const respuestas: Resultado[] = [{ ok: false, causa: "rechazado", mensaje: "Otro coordinador ya resolvió este pedido." }];
    const a = acciones((d) => respuestas.shift() ?? ok(d));
    montar(simulados(), a);
    const campo = await abrirRechazo();
    await userEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Escribí el motivo");

    await userEvent.type(campo, "Falta el depósito");
    expect(screen.queryByText(/Escribí el motivo/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));

    expect(await screen.findByText("Otro coordinador ya resolvió este pedido.")).toBeInTheDocument();
    expect(campo).toHaveValue("Falta el depósito");
  });
});

// --- avisos de error ---------------------------------------------------------------------------------------------------

describe("PedidosVista · QA · avisos de error", () => {
  it("si el servidor rechaza sin texto propio, el aviso dice qué pasó y qué hacer (no un mensaje vacío)", async () => {
    montar(simulados(), acciones(() => ({ ok: false, causa: "rechazado" })));
    await userEvent.click(autorizar());

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("No se pudo autorizar el pedido #231");
    expect(aviso).toHaveTextContent(/Probá de nuevo/);
  });

  it("tras una falla el foco queda en el botón (no se pierde al <body>) y se puede reintentar con el teclado", async () => {
    const respuestas: Resultado[] = [{ ok: false, causa: "sin-conexion" }];
    const a = acciones((d) => respuestas.shift() ?? ok(d));
    montar(simulados(), a);
    autorizar().focus();
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("alert");

    expect(autorizar()).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await screen.findByText(/autorizado: se sumaron/);
    expect(a.decidir).toHaveBeenCalledTimes(2);
  });

  it.skip("QA #66: el aviso de falla de un intento anterior no queda a la vista junto al «✓ autorizado» del reintento", async () => {
    // Hoy el error de «Necesitás conexión…» sigue ahí, contradiciendo al éxito, hasta que se lo cierra a mano.
    const respuestas: Resultado[] = [{ ok: false, causa: "sin-conexion" }];
    const a = acciones((d) => respuestas.shift() ?? ok(d));
    montar(simulados(), a);
    await userEvent.click(autorizar());
    await screen.findByRole("alert");

    await userEvent.click(autorizar());
    await screen.findByText(/autorizado: se sumaron/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.skip("un mismo error repetido no se apila: tres toques fallidos dejan un solo aviso", async () => {
    montar(simulados(), acciones(() => ({ ok: false, causa: "sin-conexion" })));
    for (let i = 0; i < 3; i++) {
      await userEvent.click(autorizar());
      await waitFor(() => expect(autorizar()).toHaveAttribute("aria-disabled", "false"));
    }

    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});

// --- acciones superpuestas ---------------------------------------------------------------------------------------------

describe("PedidosVista · QA · acciones superpuestas", () => {
  it("QA #66: con el rechazo en camino, «Esc» en el campo no lo cancela ni descarta el motivo (si falla, se conserva)", async () => {
    const espera = diferida();
    const a = acciones(() => espera.promesa);
    montar(simulados(), a);
    const campo = await abrirRechazo();
    await userEvent.type(campo, "Falta el depósito del 10/10");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));
    expect(a.decidir).toHaveBeenCalledTimes(1);

    // «Cancelar» está apagado mientras se guarda; Esc en el campo hace lo mismo y tiene que estarlo también.
    campo.focus();
    await userEvent.keyboard("{Escape}");
    await act(async () => espera.resolver({ ok: false, causa: "sin-conexion" }));
    await screen.findByRole("alert");

    expect(screen.getByRole("textbox", { name: /MOTIVO DEL RECHAZO/ })).toHaveValue("Falta el depósito del 10/10");
  });

  it("«Autorizar» y «Rechazar» de otro pedido siguen disponibles mientras uno se guarda, y cada uno cuenta su «Guardando…»", async () => {
    const espera = diferida();
    montar(simulados(), acciones(() => espera.promesa));
    await userEvent.click(autorizar());
    expect(autorizar()).toHaveTextContent("Guardando…");

    await userEvent.click(screen.getByRole("button", { name: /^#230,/ }));
    const otro = within(detalle("Pedido #230")).getByRole("button", { name: /^Autorizar/ });
    expect(otro).toHaveAttribute("aria-disabled", "false");
    expect(otro).toHaveTextContent("Autorizar");
    await act(async () => espera.resolver({ ok: false, causa: "sin-conexion" }));
    await screen.findByRole("alert");
  });

  it("la lista de ciudades y las pestañas siguen funcionando mientras se guarda (no queda nada trabado)", async () => {
    const espera = diferida();
    montar(simulados(), acciones(() => espera.promesa));
    await userEvent.click(autorizar());

    await userEvent.click(screen.getByRole("tab", { name: /^Transferencias/ }));
    expect(screen.getByRole("tab", { name: /^Transferencias/ })).toHaveAttribute("aria-selected", "true");
    await act(async () => espera.resolver(ok({ tipo: "pedido", id: "pedido-231", accion: "autorizar" })));
    await screen.findByText(/autorizado: se sumaron/);
    expect(screen.getByRole("tab", { name: /^Transferencias/ })).toHaveAttribute("aria-selected", "true");
  });
});

// --- accesibilidad del botón que guarda --------------------------------------------------------------------------------

describe("PedidosVista · QA · «Guardando…»", () => {
  it.skip("QA #66: el texto visible «Guardando…» forma parte del nombre accesible (WCAG 2.5.3) o se anuncia", async () => {
    const espera = diferida();
    montar(simulados(), acciones(() => espera.promesa));
    await userEvent.click(autorizar());

    const boton = autorizar();
    expect(boton).toHaveTextContent("Guardando…");
    expect(boton).toHaveAccessibleName(/Guardando/);
    await act(async () => espera.resolver({ ok: false, causa: "sin-conexion" }));
  });
});

// --- datos límite ------------------------------------------------------------------------------------------------------

describe("PedidosVista · QA · datos límite", () => {
  it("un colportor con nombre de una sola palabra y emoji no rompe el detalle ni los avisos", async () => {
    const datos = simulados();
    datos.pedidos = datos.pedidos.map((p) => (p.numero === "#231" ? { ...p, colportorNombre: "👩‍🌾" } : p));
    montar(datos);

    expect(detalle("Pedido #231")).toBeInTheDocument();
    await userEvent.click(autorizar());
    expect(await screen.findByText(/Pedido #231 de 👩‍🌾 autorizado/)).toBeInTheDocument();
  });

  it("montos enormes se muestran enteros, con separador de miles y sin notación científica", () => {
    const datos = simulados();
    datos.pedidos = datos.pedidos.map((p) =>
      p.numero === "#231" ? { ...p, lineas: [{ nombre: "Libro", cantidad: 1_000_000, costoUnitario: 1_980 }], cuenta: { ...p.cuenta, deuda: 9_999_999 } } : p,
    );
    montar(datos);
    const d = within(detalle("Pedido #231"));

    expect(d.getAllByText("$U 1.980.000.000").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/e\+\d|NaN|Infinity|undefined|\[object/);
  });

  it("sin ningún dato personal en el texto de la vista: ni teléfonos, ni cédulas, ni correos", () => {
    montar();
    expect(document.body.textContent).not.toMatch(/\b\d{1}\.\d{3}\.\d{3}-\d\b|@[a-z]+\.|\+598|09\d{7}/i);
  });
});
