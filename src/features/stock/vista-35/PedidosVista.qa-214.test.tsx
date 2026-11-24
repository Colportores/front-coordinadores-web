import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AccionesPedidos, DatosDePedidos, DecisionDeSolicitud, ResultadoDeAccion, SolicitudResuelta } from "@/datos/stock/pedidos";
import { crearDatosDePedidosSimulados } from "@/datos/stock/pedidos/simulado";
import { MS_DESHACER } from "@/features/cuentas/vista-29/modelo";
import { reiniciarTrabajoPendiente } from "@/shell/trabajo-pendiente";

import { PedidosVista } from "./PedidosVista";
import { validarLimite } from "./modelo";

/**
 * QA de #93 (retoque 42A de la vista 35, HU-STK-003): casos límite que cruzan los flujos del PR (reducir con el límite que se
 * edita a mitad, deshacer y volver a decidir, una línea en cero, un pedido con muchas líneas) y las entradas del campo del
 * límite (vacío, solo espacios, emoji, pegado larguísimo, formatos de monto, el borde del máximo).
 */

const AHORA = new Date("2026-10-22T18:00:00-03:00");
type Resultado = ResultadoDeAccion<SolicitudResuelta>;

const ok = (d: DecisionDeSolicitud): Resultado => ({
  ok: true,
  valor: {
    tipo: d.tipo,
    id: d.id,
    estado: d.accion === "autorizar" ? (d.tipo === "pedido" ? "AUTORIZADO" : "AUTORIZADA") : d.tipo === "pedido" ? "RECHAZADO" : "RECHAZADA",
    resueltoEn: AHORA.toISOString(),
    motivoDeRechazo: d.accion === "rechazar" ? d.motivo : null,
    ...(d.accion === "autorizar" && d.cantidades ? { cantidades: d.cantidades } : {}),
  },
});

function acciones() {
  const decidir = vi.fn(async (d: DecisionDeSolicitud) => ok(d));
  const editarLimite = vi.fn(async (l: number) => ({ ok: true as const, valor: { limiteDeDeuda: l } }));
  return { decidir, editarLimite } satisfies AccionesPedidos;
}

const datos = (): DatosDePedidos => crearDatosDePedidosSimulados(AHORA);

function montar(d = datos(), a = acciones()) {
  const vista = render(<PedidosVista datos={d} acciones={a} />);
  return { ...vista, acciones: a };
}

const detalle = (titulo: string) => screen.getByRole("region", { name: titulo });
const tocar = (el: HTMLElement) => act(async () => fireEvent.click(el));
const escribir = (el: HTMLElement, texto: string) => act(async () => fireEvent.change(el, { target: { value: texto } }));
const avanzar = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
  });
const boton = (titulo: string, nombre: RegExp | string) => within(detalle(titulo)).getByRole("button", { name: nombre });
const quitar = (producto: string) => tocar(screen.getByRole("button", { name: `Quitar uno de ${producto}` }));
/** Las cantidades de la primera decisión que salió (solo las de autorizar las traen). */
const cantidadesEnviadas = (a: ReturnType<typeof acciones>) => {
  const d = a.decidir.mock.calls[0][0];
  return d.accion === "autorizar" ? (d.cantidades ?? []) : [];
};
const campo = () => within(screen.getByRole("dialog")).getByRole("textbox");

const ESPERANZA = "La Gran Esperanza";
const DESEADO = "El Deseado de Todas las Gentes";
const VIDA_FELIZ = "Revista Vida Feliz";

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
});

afterEach(() => {
  vi.useRealTimers();
  reiniciarTrabajoPendiente();
  vi.restoreAllMocks();
});

describe("QA #93 · reducir y el límite que cambia a mitad", () => {
  it("con el pedido a medio reducir, editar el límite recalcula el aviso y no pierde las cantidades elegidas", async () => {
    montar();
    await tocar(boton("Pedido #231", /^Reducir cantidades/));
    for (let i = 0; i < 5; i++) await quitar(ESPERANZA);
    for (let i = 0; i < 4; i++) await quitar(DESEADO);
    // 22.100 de deuda + 20.870 reducido = 42.970: con el límite de 50.000 ya no lo pasa.
    expect(screen.getByText(/Reducido a 39 de 48\./)).toHaveTextContent("ya no pasa el límite de $U 50.000");

    await tocar(screen.getByRole("button", { name: "Editar límite" }));
    await escribir(campo(), "30000");
    await tocar(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.getByText(/Reducido a 39 de 48\./)).toHaveTextContent("todavía pasa el límite por $U 12.970");
    expect(screen.getByLabelText(new RegExp(`unidades de ${ESPERANZA}$`))).toHaveTextContent("5");
    expect(screen.getByLabelText(new RegExp(`unidades de ${DESEADO}$`))).toHaveTextContent("4");
  });
});

describe("QA #93 · deshacer y volver a decidir", () => {
  it("autorizar reducido, «Deshacer», bajar otra cantidad y autorizar de nuevo: sale una sola decisión, con las cantidades nuevas", async () => {
    const { acciones: a } = montar();
    await tocar(boton("Pedido #231", /^Reducir cantidades/));
    for (let i = 0; i < 5; i++) await quitar(ESPERANZA);
    await tocar(boton("Pedido #231", /^Autorizar reducido/));
    await avanzar(3000);
    await tocar(screen.getByRole("button", { name: /^Deshacer · 8 s: autorización del pedido #231/ }));

    // Vuelve con lo elegido (5 / 8 / 30): se baja otra línea y se autoriza otra vez.
    expect(screen.getByLabelText(new RegExp(`unidades de ${ESPERANZA}$`))).toHaveTextContent("5");
    for (let i = 0; i < 4; i++) await quitar(DESEADO);
    await tocar(boton("Pedido #231", /^Autorizar reducido/));
    await avanzar(MS_DESHACER);

    expect(a.decidir).toHaveBeenCalledTimes(1);
    expect(cantidadesEnviadas(a)).toEqual([
      { nombre: ESPERANZA, cantidad: 5 },
      { nombre: DESEADO, cantidad: 4 },
      { nombre: VIDA_FELIZ, cantidad: 30 },
    ]);
  });
});

describe("QA #93 · datos límite al reducir", () => {
  it("un producto en cero entre los tres se autoriza con cantidad 0 y la bandeja cuenta solo los que quedan", async () => {
    const { acciones: a } = montar();
    await tocar(boton("Pedido #231", /^Reducir cantidades/));
    for (let i = 0; i < 30; i++) await quitar(VIDA_FELIZ);
    expect(boton("Pedido #231", /^Autorizar reducido/)).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(/Reducido a 18 de 48\./)).toBeInTheDocument();

    await tocar(boton("Pedido #231", /^Autorizar reducido/));
    await avanzar(MS_DESHACER);
    expect(cantidadesEnviadas(a)).toEqual([
      { nombre: ESPERANZA, cantidad: 10 },
      { nombre: DESEADO, cantidad: 8 },
      { nombre: VIDA_FELIZ, cantidad: 0 },
    ]);
    await tocar(screen.getByRole("tab", { name: /^Autorizados/ }));
    expect(screen.getByRole("button", { name: /^#231,.*2 productos · 18 de 48 unidades · reducido/ })).toBeInTheDocument();
  });

  it("un pedido de 60 líneas se reduce en una sola y manda las 60 cantidades", async () => {
    const d = datos();
    const base = d.pedidos.find((p) => p.numero === "#231");
    if (!base) throw new Error("falta #231");
    base.lineas = Array.from({ length: 60 }, (_, i) => ({ nombre: `Libro ${String(i + 1).padStart(2, "0")}`, cantidad: 3, costoUnitario: 1000 }));
    const { acciones: a } = montar(d);
    await tocar(boton("Pedido #231", /^Reducir cantidades/));
    expect(screen.getAllByRole("button", { name: /^Quitar uno de Libro/ })).toHaveLength(60);
    await quitar("Libro 37");
    expect(screen.getByText(/Reducido a 179 de 180\./)).toBeInTheDocument();
    await tocar(boton("Pedido #231", /^Autorizar reducido/));
    await avanzar(MS_DESHACER);
    const cantidades = cantidadesEnviadas(a);
    expect(cantidades).toHaveLength(60);
    expect(cantidades.filter((c) => c.cantidad !== 3)).toEqual([{ nombre: "Libro 37", cantidad: 2 }]);
  });
});

describe("QA #93 · lo que se escribe en el límite", () => {
  const INVALIDAS: Array<[string, string]> = [
    ["solo espacios", "   "],
    ["tabulaciones y saltos", "\t\n"],
    ["emoji", "😀😀"],
    ["emoji entre dígitos", "35😀000"],
    ["centavos con coma", "35.000,50"],
    ["centavos con punto", "35.00"],
    ["negativo", "-5000"],
    ["notación científica", "1e5"],
    ["dígitos de otro alfabeto", "٣٥٠٠٠"],
    ["pasa el máximo por uno", "1.000.000.000"],
    ["HTML pegado", "<script>alert(1)</script>"],
    ["pegado de 5.000 dígitos", "9".repeat(5000)],
    ["pegado de 200.000 caracteres", "x".repeat(200_000)],
  ];

  it.each(INVALIDAS)("%s: no es un monto, no se guarda y dice qué escribir", (_nombre, texto) => {
    const t0 = performance.now();
    const r = validarLimite(texto);
    expect(performance.now() - t0).toBeLessThan(500);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/Escribí|El límite/);
      expect(r.error.length).toBeLessThan(120);
    }
  });

  const VALIDAS: Array<[string, number]> = [
    ["35000", 35_000],
    ["35.000", 35_000],
    ["$U 35.000", 35_000],
    [" $ 35 000 ", 35_000],
    ["0035000", 35_000],
    ["1", 1],
    ["0", 0],
    ["000", 0],
    ["999.999.999", 999_999_999],
  ];

  it.each(VALIDAS)("«%s» es un monto válido de %i", (texto, esperado) => {
    expect(validarLimite(texto)).toEqual({ ok: true, limite: esperado });
  });

  it("en el diálogo un pegado larguísimo avisa sin guardar, deja lo escrito y no se cuelga", async () => {
    const { acciones: a } = montar();
    await tocar(screen.getByRole("button", { name: "Editar límite" }));
    const pegado = "9".repeat(5000);
    await escribir(campo(), pegado);
    await tocar(screen.getByRole("button", { name: "Guardar" }));
    expect(a.editarLimite).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("El límite es demasiado alto: usá hasta $U 999.999.999.");
    expect(campo()).toHaveValue(pegado);
    expect(campo()).toHaveFocus();
    expect(screen.getByRole("button", { name: "Guardar" })).not.toHaveAttribute("aria-disabled", "true");
  });

  it("el borde del máximo se guarda y se ve en el encabezado", async () => {
    const { acciones: a } = montar();
    await tocar(screen.getByRole("button", { name: "Editar límite" }));
    await escribir(campo(), "999.999.999");
    await tocar(screen.getByRole("button", { name: "Guardar" }));
    expect(a.editarLimite).toHaveBeenCalledWith(999_999_999, expect.any(String));
    expect(screen.getByText(/^Límite de deuda de la campaña:/)).toHaveTextContent("$U 999.999.999 por colportor");
  });
});

describe("QA #93 · lo que se ve al reducir (Chromium 1280×800 y 1440×900, capturas de QA)", () => {
  it.skip("QA #93: sin nada para autorizar, el dimmed de «Autorizar reducido» dice por qué en el propio botón (aria-describedby a la nota)", async () => {
    montar();
    await tocar(boton("Pedido #231", /^Reducir cantidades/));
    for (let i = 0; i < 10; i++) await quitar(ESPERANZA);
    for (let i = 0; i < 8; i++) await quitar(DESEADO);
    for (let i = 0; i < 30; i++) await quitar(VIDA_FELIZ);
    const autorizar = boton("Pedido #231", /^Autorizar reducido/);
    expect(autorizar).toHaveAttribute("aria-disabled", "true");
    const id = autorizar.getAttribute("aria-describedby");
    expect(id).toBeTruthy();
    expect(document.getElementById(id ?? "")).toHaveTextContent("Dejá al menos un producto con cantidad para autorizar.");
  });
});
