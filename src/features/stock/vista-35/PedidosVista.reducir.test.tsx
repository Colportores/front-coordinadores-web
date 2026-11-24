import { act, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AccionesPedidos, DatosDePedidos, DecisionDeSolicitud, ResultadoDeAccion, SolicitudResuelta } from "@/datos/stock/pedidos";
import { crearAccionesSimuladas, crearDatosDePedidosSimulados } from "@/datos/stock/pedidos/simulado";
import { MS_DESHACER } from "@/features/cuentas/vista-29/modelo";
import { hayTrabajoPendiente, reiniciarTrabajoPendiente } from "@/shell/trabajo-pendiente";

import { PedidosVista } from "./PedidosVista";

/**
 * #93 · retoque 42A de la vista 35 (HU-STK-003): el límite de deuda de la campaña arriba de la bandeja con «Editar» (42A·01 y
 * 42A·02), «Reducir cantidades» antes de autorizar (42A·03) y «Deshacer» de 8 s al autorizar o rechazar un pedido (42A·04).
 * Con los casos límite de cada flujo: doble toque, falla a mitad, dos acciones seguidas, volver atrás y datos límite.
 */

const AHORA = new Date("2026-10-22T18:00:00-03:00");
type Resultado = ResultadoDeAccion<SolicitudResuelta>;
type ResultadoLimite = ResultadoDeAccion<{ limiteDeDeuda: number }>;

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

function acciones(responder: (d: DecisionDeSolicitud) => Promise<Resultado> | Resultado = ok, limite: (l: number) => Promise<ResultadoLimite> | ResultadoLimite = (l) => ({ ok: true, valor: { limiteDeDeuda: l } })) {
  const decidir = vi.fn(async (d: DecisionDeSolicitud) => responder(d));
  const editarLimite = vi.fn(async (l: number) => limite(l));
  return { decidir, editarLimite } satisfies AccionesPedidos;
}

function diferida<T>() {
  let resolver!: (r: T) => void;
  const promesa = new Promise<T>((res) => {
    resolver = res;
  });
  return { promesa, resolver };
}

const datos = (): DatosDePedidos => crearDatosDePedidosSimulados(AHORA);

function montar(d = datos(), a = acciones()) {
  const vista = render(<PedidosVista datos={d} acciones={a} />);
  return { ...vista, acciones: a };
}

const pestana = (nombre: RegExp) => screen.getByRole("tab", { name: nombre });
const fila = (numero: string) => screen.getByRole("button", { name: new RegExp(`^${numero},`) });
const detalle = (titulo: string) => screen.getByRole("region", { name: titulo });
const tocar = (el: HTMLElement) => act(async () => fireEvent.click(el));
const escribir = (el: HTMLElement, texto: string) => act(async () => fireEvent.change(el, { target: { value: texto } }));
const avanzar = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
  });
const boton = (titulo: string, nombre: RegExp | string) => within(detalle(titulo)).getByRole("button", { name: nombre });
const quitar = (producto: string) => tocar(screen.getByRole("button", { name: `Quitar uno de ${producto}` }));
const sumar = (producto: string) => tocar(screen.getByRole("button", { name: `Sumar uno a ${producto}` }));
const cantidadDe = (producto: string) => screen.getByLabelText(new RegExp(`unidades de ${producto}$`));

const ESPERANZA = "La Gran Esperanza";
const DESEADO = "El Deseado de Todas las Gentes";
const VIDA_FELIZ = "Revista Vida Feliz";

/** #231 (Emiliano): 10 + 8 + 30 = 48 unidades por $U 36.040, con una deuda de $U 22.100 y el límite en $U 50.000. */
async function reducirEl231(esperanza = 5, deseado = 4) {
  await tocar(boton("Pedido #231", /^Reducir cantidades/));
  for (let i = 10; i > esperanza; i--) await quitar(ESPERANZA);
  for (let i = 8; i > deseado; i--) await quitar(DESEADO);
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
});

afterEach(() => {
  vi.useRealTimers();
  reiniciarTrabajoPendiente();
  vi.restoreAllMocks();
});

describe("42A·01 · el límite de la campaña arriba de la bandeja y «Reducir cantidades» en el detalle", () => {
  it("dice que el límite es de la campaña y por colportor, con «Editar» al lado", () => {
    montar();
    expect(screen.getByText(/^Límite de deuda de la campaña:/)).toHaveTextContent("Límite de deuda de la campaña: $U 50.000 por colportor");
    const editar = screen.getByRole("button", { name: "Editar límite" });
    expect(editar).toHaveTextContent("Editar");
    expect(editar).not.toHaveAttribute("aria-disabled");
  });

  it("en el detalle de un pedido «Reducir cantidades» queda entre «Autorizar» y «Rechazar»", () => {
    montar();
    const nombres = within(detalle("Pedido #231"))
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"))
      .filter((n) => /^(Autorizar|Reducir|Rechazar)/.test(n ?? ""));
    expect(nombres).toEqual([
      "Autorizar el pedido #231 de Emiliano Sosa",
      "Reducir cantidades de el pedido #231 de Emiliano Sosa",
      "Rechazar el pedido #231 de Emiliano Sosa",
    ]);
  });

  it("una transferencia no se reduce y un pedido ya autorizado tampoco", async () => {
    montar();
    await tocar(pestana(/^Transferencias/));
    expect(within(detalle("Transferencia T-18")).queryByRole("button", { name: /^Reducir/ })).not.toBeInTheDocument();
    await tocar(pestana(/^Autorizados/));
    expect(within(detalle("Pedido #224")).queryByRole("button", { name: /^Reducir/ })).not.toBeInTheDocument();
  });

  it("sin el límite fijado lo dice y «Editar» sigue disponible para fijarlo", () => {
    montar({ ...datos(), limiteDeDeuda: null });
    expect(screen.getByText("Sin límite de deuda fijado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar límite" })).not.toHaveAttribute("aria-disabled");
  });

  it("si la fuente no sabe editar el límite, «Editar» queda como una acción no disponible", () => {
    montar(datos(), { decidir: acciones().decidir } as unknown as ReturnType<typeof acciones>);
    expect(screen.getByRole("button", { name: "Editar límite" })).toHaveAttribute("aria-disabled", "true");
  });
});

describe("42A·02 · editar el límite", () => {
  const abrir = async () => {
    await tocar(screen.getByRole("button", { name: "Editar límite" }));
    return screen.getByRole("dialog", { name: "Límite de deuda de la campaña" });
  };
  const campo = () => screen.getByRole("textbox", { name: "LÍMITE POR COLPORTOR" });

  it("abre el diálogo con el campo enfocado y el límite de hoy, el texto de la campaña y lo que pasaría", async () => {
    montar();
    const d = await abrir();

    expect(within(d).getByText("Un solo límite para todos los colportores de Primavera 2026. Avisa cuando un pedido lo pasa; no lo bloquea.")).toBeInTheDocument();
    expect(campo()).toHaveFocus();
    expect(campo()).toHaveValue("50.000");
    expect(within(d).getByRole("note")).toHaveTextContent("Hoy 1 pedido por autorizar pasa el límite de $U 50.000. Con $U 50.000 lo sigue pasando, por $U 8.140.");
  });

  it("la nota se recalcula con lo que se escribe", async () => {
    montar();
    const d = await abrir();
    await escribir(campo(), "$U 60.000");
    expect(within(d).getByRole("note")).toHaveTextContent("Con $U 60.000 ninguno lo pasa.");
    await escribir(campo(), "55000");
    expect(within(d).getByRole("note")).toHaveTextContent("Con $U 55.000 lo sigue pasando, por $U 3.140.");
    await escribir(campo(), "abc");
    expect(within(d).queryByRole("note")).not.toBeInTheDocument();
  });

  it("«Guardar» manda el límite, cierra, actualiza el encabezado, avisa y devuelve el foco a «Editar»", async () => {
    const { acciones: a } = montar();
    await abrir();
    await escribir(campo(), "60.000");
    await tocar(screen.getByRole("button", { name: "Guardar" }));

    expect(a.editarLimite).toHaveBeenCalledExactlyOnceWith(60_000);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/^Límite de deuda de la campaña:/)).toHaveTextContent("$U 60.000 por colportor");
    expect(screen.getByText("✓ Límite de deuda de la campaña: $U 60.000 por colportor.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar límite" })).toHaveFocus();
    // El pedido que pasaba el límite deja de avisar: el límite vale también para lo que ya está por autorizar.
    expect(within(detalle("Pedido #231")).queryByRole("note")).not.toBeInTheDocument();
    expect(hayTrabajoPendiente()).toBe(false);
  });

  it("Enter en el campo también guarda", async () => {
    const { acciones: a } = montar();
    await abrir();
    await escribir(campo(), "70000");
    await act(async () => fireEvent.keyDown(campo(), { key: "Enter" }));
    expect(a.editarLimite).toHaveBeenCalledExactlyOnceWith(70_000);
  });

  it("con el campo vacío, en cero o con algo que no es un monto no guarda: lo dice y deja el foco en el campo", async () => {
    const { acciones: a } = montar();
    await abrir();
    for (const [escrito, mensaje] of [
      ["", "Escribí el límite por colportor, en pesos."],
      ["0", "El límite tiene que ser mayor que cero."],
      ["35,50", "Escribí solo el monto, en pesos enteros y sin centavos. Por ejemplo: 35.000."],
    ] as const) {
      await escribir(campo(), escrito);
      await tocar(screen.getByRole("button", { name: "Guardar" }));
      expect(screen.getByRole("alert")).toHaveTextContent(mensaje);
      expect(campo()).toHaveAttribute("aria-invalid", "true");
      expect(campo()).toHaveFocus();
    }
    expect(a.editarLimite).not.toHaveBeenCalled();
    await escribir(campo(), "40000");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("el mismo límite de hoy cierra sin guardar nada", async () => {
    const { acciones: a } = montar();
    await abrir();
    await tocar(screen.getByRole("button", { name: "Guardar" }));
    expect(a.editarLimite).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("«Cancelar» y Esc cierran sin guardar y devuelven el foco a «Editar»", async () => {
    const { acciones: a } = montar();
    await abrir();
    await escribir(campo(), "99.000");
    await tocar(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar límite" })).toHaveFocus();

    await abrir();
    expect(campo()).toHaveValue("50.000");
    await act(async () => fireEvent.keyDown(campo(), { key: "Escape" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(a.editarLimite).not.toHaveBeenCalled();
  });

  it("Tab no sale del diálogo", async () => {
    montar();
    await abrir();
    const guardar = screen.getByRole("button", { name: "Guardar" });
    guardar.focus();
    await act(async () => fireEvent.keyDown(guardar, { key: "Tab" }));
    expect(campo()).toHaveFocus();
    await act(async () => fireEvent.keyDown(campo(), { key: "Tab", shiftKey: true }));
    expect(guardar).toHaveFocus();
  });

  it("doble toque en «Guardar»: sale una sola vez, avisa que está guardando y no se puede cerrar", async () => {
    const espera = diferida<ResultadoLimite>();
    const a = acciones(ok, () => espera.promesa);
    montar(datos(), a);
    await abrir();
    await escribir(campo(), "65000");
    const guardar = screen.getByRole("button", { name: "Guardar" });
    await tocar(guardar);
    await tocar(guardar);

    expect(a.editarLimite).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Guardando…" })).toHaveAttribute("aria-disabled", "true");
    expect(hayTrabajoPendiente()).toBe(true);
    await tocar(screen.getByRole("button", { name: "Cancelar" }));
    await act(async () => fireEvent.keyDown(campo(), { key: "Escape" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await act(async () => espera.resolver({ ok: true, valor: { limiteDeDeuda: 65_000 } }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(a.editarLimite).toHaveBeenCalledTimes(1);
    expect(hayTrabajoPendiente()).toBe(false);
  });

  it("si falla a mitad (sin conexión) el diálogo sigue abierto con lo escrito, dice qué hacer y se puede reintentar", async () => {
    const respuestas: ResultadoLimite[] = [{ ok: false, causa: "sin-conexion" }];
    const a = acciones(ok, (l) => respuestas.shift() ?? { ok: true, valor: { limiteDeDeuda: l } });
    montar(datos(), a);
    await abrir();
    await escribir(campo(), "65.000");
    await tocar(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Necesitás conexión para guardar el límite. Revisá la conexión y probá de nuevo.");
    expect(campo()).toHaveValue("65.000");
    expect(campo()).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("button", { name: "Guardar" })).toHaveAttribute("aria-disabled", "false");
    expect(screen.getByText(/^Límite de deuda de la campaña:/)).toHaveTextContent("$U 50.000");

    await tocar(screen.getByRole("button", { name: "Guardar" }));
    expect(a.editarLimite).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/^Límite de deuda de la campaña:/)).toHaveTextContent("$U 65.000");
  });

  it("si la acción tira una excepción cuenta como falta de conexión y no deja nada trabado", async () => {
    const a = acciones(ok, () => {
      throw new Error("se cayó");
    });
    montar(datos(), a);
    await abrir();
    await escribir(campo(), "65000");
    await tocar(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Necesitás conexión para guardar el límite");
    expect(screen.getByRole("button", { name: "Guardar" })).toHaveAttribute("aria-disabled", "false");
    expect(hayTrabajoPendiente()).toBe(false);
  });

  it("si el servidor lo rechaza muestra su texto", async () => {
    montar(datos(), acciones(ok, () => ({ ok: false, causa: "rechazado", mensaje: "Ese límite no corresponde a esta campaña." })));
    await abrir();
    await escribir(campo(), "65000");
    await tocar(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Ese límite no corresponde a esta campaña.");
  });

  it("sin conexión del navegador «Guardar» queda apagado y lo explica; al volver se puede usar", async () => {
    const enLinea = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { acciones: a } = montar();
    await abrir();
    await escribir(campo(), "65000");
    expect(screen.getByRole("button", { name: "Guardar" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Necesitás conexión para guardar el límite. Revisá la conexión y probá de nuevo.")).toBeInTheDocument();
    await tocar(screen.getByRole("button", { name: "Guardar" }));
    expect(a.editarLimite).not.toHaveBeenCalled();

    enLinea.mockReturnValue(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await tocar(screen.getByRole("button", { name: "Guardar" }));
    expect(a.editarLimite).toHaveBeenCalledWith(65_000);
  });

  it("sin límite fijado el campo arranca vacío y fijarlo hace que los pedidos avisen", async () => {
    montar({ ...datos(), limiteDeDeuda: null });
    expect(within(detalle("Pedido #231")).queryByRole("note")).not.toBeInTheDocument();
    await abrir();
    expect(campo()).toHaveValue("");
    await escribir(campo(), "30000");
    expect(within(screen.getByRole("dialog")).getByRole("note")).toHaveTextContent("Hoy no hay límite fijado, así que ningún pedido avisa.");
    await tocar(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.getByText(/^Límite de deuda de la campaña:/)).toHaveTextContent("$U 30.000 por colportor");
    expect(within(detalle("Pedido #231")).getByRole("note")).toHaveTextContent("supera el límite de $U 30.000");
  });

  it("sin el nombre de la campaña dice «la campaña»", async () => {
    montar({ ...datos(), campaniaNombre: null });
    const d = await abrir();
    expect(within(d).getByText("Un solo límite para todos los colportores de la campaña. Avisa cuando un pedido lo pasa; no lo bloquea.")).toBeInTheDocument();
  });

  it("con la fuente simulada guarda y rechaza lo que no es un monto entero", async () => {
    const simulada = crearAccionesSimuladas();
    expect(await simulada.editarLimite?.(40_000)).toEqual({ ok: true, valor: { limiteDeDeuda: 40_000 } });
    expect(await simulada.editarLimite?.(0)).toMatchObject({ ok: false, causa: "rechazado" });
    expect(await simulada.editarLimite?.(1.5)).toMatchObject({ ok: false });
    expect(await simulada.editarLimite?.(10_000_000_000)).toMatchObject({ ok: false });
  });

  it("no tiene problemas de accesibilidad", async () => {
    montar();
    await abrir();
    vi.useRealTimers();
    const resultado = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    expect(resultado.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
  });
});

describe("42A·03 · reducir antes de autorizar", () => {
  it("«Reducir cantidades» abre el paso de cada producto con lo pedido y cambia los botones", async () => {
    montar();
    await tocar(boton("Pedido #231", /^Reducir cantidades/));

    const d = detalle("Pedido #231");
    expect(within(d).getByText("LO QUE AUTORIZÁS")).toBeInTheDocument();
    expect(within(d).getByText("Monto reducido")).toBeInTheDocument();
    expect(cantidadDe(ESPERANZA)).toHaveTextContent("10");
    expect(within(d).getByText("pidió 10")).toBeInTheDocument();
    expect(within(d).getByText("pidió 30")).toBeInTheDocument();
    expect(within(d).queryByRole("button", { name: /^Rechazar/ })).not.toBeInTheDocument();
    expect(within(d).getByRole("button", { name: /^Cancelar/ })).toBeInTheDocument();
    expect(within(d).getByText(/no se puede subir por encima de lo pedido/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Quitar uno de ${ESPERANZA}` })).toHaveFocus();
  });

  it("cada «−» baja uno, nunca de cero; cada «+» sube uno, nunca más de lo pedido", async () => {
    montar();
    await tocar(boton("Pedido #231", /^Reducir cantidades/));

    expect(screen.getByRole("button", { name: `Sumar uno a ${ESPERANZA}` })).toHaveAttribute("aria-disabled", "true");
    await sumar(ESPERANZA);
    expect(cantidadDe(ESPERANZA)).toHaveTextContent("10");

    await quitar(ESPERANZA);
    expect(cantidadDe(ESPERANZA)).toHaveTextContent("9");
    await sumar(ESPERANZA);
    expect(cantidadDe(ESPERANZA)).toHaveTextContent("10");

    for (let i = 0; i < 12; i++) await quitar(DESEADO);
    expect(cantidadDe(DESEADO)).toHaveTextContent("0");
    expect(screen.getByRole("button", { name: `Quitar uno de ${DESEADO}` })).toHaveAttribute("aria-disabled", "true");
  });

  it("el monto, la deuda con el pedido y el aviso se recalculan con cada cambio", async () => {
    montar();
    await reducirEl231(5, 4);
    const d = detalle("Pedido #231");

    expect(within(d).getByText("Monto reducido").closest("div")).toHaveTextContent("$U 20.870");
    expect(within(d).getByRole("note")).toHaveTextContent("Reducido a 39 de 48. Con este monto la deuda queda en $U 42.970 y ya no pasa el límite de $U 50.000.");
    expect(within(d).getByText("Deuda con este pedido").closest("div")).toHaveTextContent("$U 42.970");
    expect(within(d).getByText(DESEADO).closest("li")).toHaveTextContent("$U 7.920");
    expect(within(d).queryByText("△ Supera el límite")).not.toBeInTheDocument();
  });

  it("si reducido todavía pasa el límite lo dice con cuánto (el aviso del canvas)", async () => {
    montar({ ...datos(), limiteDeDeuda: 30_000 });
    await reducirEl231(5, 4);
    expect(within(detalle("Pedido #231")).getByRole("note")).toHaveTextContent("Reducido a 39 de 48. La deuda con el pedido todavía pasa el límite por $U 12.970.");
  });

  it("sin bajar nada «Autorizar reducido» no hace nada y lo explica", async () => {
    const { acciones: a } = montar();
    await tocar(boton("Pedido #231", /^Reducir cantidades/));
    const autorizar = boton("Pedido #231", /^Autorizar reducido/);
    expect(autorizar).toHaveAttribute("aria-disabled", "true");
    expect(within(detalle("Pedido #231")).getByText(/Bajá alguna cantidad para autorizar reducido/)).toBeInTheDocument();
    await tocar(autorizar);
    await avanzar(MS_DESHACER);
    expect(a.decidir).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /^Deshacer/ })).not.toBeInTheDocument();
  });

  it("con todo en cero no hay nada que autorizar: avisa y manda a subir una cantidad o a rechazar", async () => {
    // Cantidades chicas: lo que se prueba es el cero, no cuántos toques lleva llegar.
    const base = datos();
    const chico = { ...base.pedidos[0], lineas: base.pedidos[0].lineas.map((l, i) => ({ ...l, cantidad: [2, 1, 2][i] })) };
    const { acciones: a } = montar({ ...base, pedidos: [chico, ...base.pedidos.slice(1)] });
    await tocar(boton("Pedido #231", /^Reducir cantidades/));
    for (const [producto, veces] of [[ESPERANZA, 2], [DESEADO, 1], [VIDA_FELIZ, 2]] as const) for (let i = 0; i < veces; i++) await quitar(producto);

    const d = detalle("Pedido #231");
    expect(within(d).getByRole("note")).toHaveTextContent("No queda nada para autorizar: subí alguna cantidad, o cancelá y rechazá el pedido.");
    expect(boton("Pedido #231", /^Autorizar reducido/)).toHaveAttribute("aria-disabled", "true");
    await tocar(boton("Pedido #231", /^Autorizar reducido/));
    expect(a.decidir).not.toHaveBeenCalled();
    await sumar(VIDA_FELIZ);
    expect(boton("Pedido #231", /^Autorizar reducido/)).toHaveAttribute("aria-disabled", "false");
  });

  it("«Cancelar» vuelve a los tres botones con el foco en «Reducir cantidades» y descarta lo elegido", async () => {
    montar();
    await reducirEl231();
    await tocar(boton("Pedido #231", /^Cancelar/));

    const d = detalle("Pedido #231");
    expect(within(d).getByText("LO QUE PIDE")).toBeInTheDocument();
    expect(within(d).getByRole("button", { name: /^Reducir cantidades/ })).toHaveFocus();
    await tocar(boton("Pedido #231", /^Reducir cantidades/));
    expect(cantidadDe(ESPERANZA)).toHaveTextContent("10");
  });

  it("volver atrás y reentrar: cada pedido guarda lo que se le fue bajando", async () => {
    montar();
    await reducirEl231();
    await tocar(fila("#230"));
    expect(within(detalle("Pedido #230")).getByRole("button", { name: /^Reducir cantidades/ })).toBeInTheDocument();
    await tocar(fila("#231"));
    expect(cantidadDe(ESPERANZA)).toHaveTextContent("5");
    expect(cantidadDe(DESEADO)).toHaveTextContent("4");
  });

  it("«Rechazar» y «Reducir» no se mezclan: con el motivo abierto no se ofrece reducir", async () => {
    montar();
    await tocar(boton("Pedido #231", /^Rechazar/));
    expect(within(detalle("Pedido #231")).queryByRole("button", { name: /^Reducir/ })).not.toBeInTheDocument();
  });

  it("un producto de nombre larguísimo y un pedido de una sola línea no rompen el paso", async () => {
    const base = datos();
    const largo = "Producto de nombre larguísimo ".repeat(10).trim();
    const pedido = { ...base.pedidos[0], lineas: [{ nombre: largo, cantidad: 1, costoUnitario: 100 }] };
    montar({ ...base, pedidos: [pedido, ...base.pedidos.slice(1)] });
    await tocar(boton("Pedido #231", /^Reducir cantidades/));
    await quitar(largo);
    expect(boton("Pedido #231", /^Autorizar reducido/)).toHaveAttribute("aria-disabled", "true");
    expect(within(detalle("Pedido #231")).getByRole("note")).toHaveTextContent("No queda nada para autorizar");
  });

  it("no tiene problemas de accesibilidad mientras se reduce", async () => {
    montar();
    await reducirEl231();
    vi.useRealTimers();
    const resultado = await axe.run(detalle("Pedido #231"), { rules: { "color-contrast": { enabled: false } } });
    expect(resultado.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
  });
});

describe("42A·04 · autorizar reducido y «Deshacer» de 8 s", () => {
  const deshacerDe = (accion: "autorización" | "rechazo" = "autorización", numero = "#231") => screen.getByRole("button", { name: `Deshacer · 8 s: ${accion} del pedido ${numero}` });

  it("autorizar reducido: el pedido se ve autorizado con su aviso, sale a los 8 s con las cantidades y se abre el que sigue", async () => {
    const { acciones: a } = montar();
    await reducirEl231();
    await tocar(boton("Pedido #231", /^Autorizar reducido/));

    expect(
      screen.getByText("Autorizaste el pedido #231 de Emiliano Sosa, reducido a 39 de 48 unidades: se suman $U 20.870 a la deuda de Emiliano cuando se cierre este aviso."),
    ).toBeInTheDocument();
    expect(deshacerDe()).toHaveTextContent("Deshacer · 8 s");
    expect(a.decidir).not.toHaveBeenCalled();
    expect(hayTrabajoPendiente()).toBe(true);
    expect(fila("#230")).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("heading", { level: 3, name: "Pedido #230" })).toHaveFocus();
    expect(pestana(/^Por autorizar/)).toHaveTextContent("3");
    expect(pestana(/^Autorizados/)).toHaveTextContent("2");

    await avanzar(MS_DESHACER - 1);
    expect(a.decidir).not.toHaveBeenCalled();
    await avanzar(1);
    expect(a.decidir).toHaveBeenCalledExactlyOnceWith({
      tipo: "pedido",
      id: "pedido-231",
      accion: "autorizar",
      cantidades: [
        { nombre: ESPERANZA, cantidad: 5 },
        { nombre: DESEADO, cantidad: 4 },
        { nombre: VIDA_FELIZ, cantidad: 30 },
      ],
    });
    expect(screen.queryByRole("button", { name: /^Deshacer/ })).not.toBeInTheDocument();
    expect(hayTrabajoPendiente()).toBe(false);
  });

  it("el pedido reducido se ve en «Autorizados» con lo que se autorizó, lo que pidió y el monto autorizado", async () => {
    montar();
    await reducirEl231();
    await tocar(boton("Pedido #231", /^Autorizar reducido/));
    await avanzar(MS_DESHACER);
    await tocar(pestana(/^Autorizados/));

    expect(fila("#231")).toHaveAccessibleName(expect.stringContaining("3 productos · 39 de 48 unidades · reducido, $U 20.870"));
    await tocar(fila("#231"));
    const d = detalle("Pedido #231");
    expect(within(d).getByText("LO QUE AUTORIZASTE")).toBeInTheDocument();
    expect(within(d).getByText("Monto autorizado").closest("div")).toHaveTextContent("$U 20.870");
    expect(within(d).getByText("Reducido: autorizaste 39 de los 48 que pidió.")).toBeInTheDocument();
    expect(within(d).getByText("$U 1.450 c/u · pidió 10")).toBeInTheDocument();
    expect(within(d).getByText("Deuda actual").closest("div")).toHaveTextContent("$U 42.970");
    expect(within(d).queryByRole("button", { name: /^(Autorizar|Rechazar|Reducir)/ })).not.toBeInTheDocument();
  });

  it("«Deshacer» lo deja por autorizar otra vez, con lo elegido y el foco en «Autorizar reducido», y no se manda nunca", async () => {
    const { acciones: a } = montar();
    await reducirEl231();
    await tocar(boton("Pedido #231", /^Autorizar reducido/));
    await avanzar(3000);
    await tocar(deshacerDe());

    expect(screen.queryByRole("button", { name: /^Deshacer/ })).not.toBeInTheDocument();
    expect(fila("#231")).toHaveAttribute("aria-current", "true");
    expect(pestana(/^Por autorizar/)).toHaveAttribute("aria-selected", "true");
    expect(cantidadDe(ESPERANZA)).toHaveTextContent("5");
    expect(cantidadDe(DESEADO)).toHaveTextContent("4");
    expect(boton("Pedido #231", /^Autorizar reducido/)).toHaveFocus();
    expect(within(detalle("Pedido #231")).getByText("Deuda con este pedido").closest("div")).toHaveTextContent("$U 42.970");
    await avanzar(MS_DESHACER * 3);
    expect(a.decidir).not.toHaveBeenCalled();
    expect(hayTrabajoPendiente()).toBe(false);
  });

  it("deshacer vale aunque se haya cambiado de pestaña y de ciudad mientras corría el plazo", async () => {
    montar();
    await tocar(boton("Pedido #231", /^Autorizar/));
    await tocar(pestana(/^Transferencias/));
    await tocar(deshacerDe());

    expect(pestana(/^Por autorizar/)).toHaveAttribute("aria-selected", "true");
    expect(fila("#231")).toHaveAttribute("aria-current", "true");
    expect(boton("Pedido #231", /^Autorizar/)).toHaveFocus();
    expect(within(detalle("Pedido #231")).getByText("Deuda actual").closest("div")).toHaveTextContent("$U 22.100");
  });

  it("autorizar sin reducir también deja el aviso y manda la decisión de siempre (sin cantidades) a los 8 s", async () => {
    const { acciones: a } = montar();
    await tocar(boton("Pedido #231", /^Autorizar/));

    expect(screen.getByText("Autorizaste el pedido #231 de Emiliano Sosa: se suman $U 36.040 a la deuda de Emiliano cuando se cierre este aviso.")).toBeInTheDocument();
    await avanzar(MS_DESHACER);
    expect(a.decidir).toHaveBeenCalledExactlyOnceWith({ tipo: "pedido", id: "pedido-231", accion: "autorizar" });
  });

  it("rechazar un pedido: queda el aviso con «Deshacer», sale a los 8 s y con «Deshacer» vuelve el motivo escrito", async () => {
    const { acciones: a } = montar();
    await tocar(boton("Pedido #231", /^Rechazar/));
    await escribir(screen.getByRole("textbox", { name: /MOTIVO DEL RECHAZO/ }), "Excede la capacidad");
    await tocar(screen.getByRole("button", { name: "Confirmar rechazo" }));

    expect(screen.getByText("Rechazaste el pedido #231 de Emiliano Sosa. Cuando se cierre este aviso, Emiliano recibe el motivo.")).toBeInTheDocument();
    expect(a.decidir).not.toHaveBeenCalled();
    await tocar(deshacerDe("rechazo"));
    expect(screen.getByRole("textbox", { name: /MOTIVO DEL RECHAZO/ })).toHaveValue("Excede la capacidad");
    expect(screen.getByRole("textbox", { name: /MOTIVO DEL RECHAZO/ })).toHaveFocus();
    await avanzar(MS_DESHACER * 2);
    expect(a.decidir).not.toHaveBeenCalled();

    await tocar(screen.getByRole("button", { name: "Confirmar rechazo" }));
    await avanzar(MS_DESHACER);
    expect(a.decidir).toHaveBeenCalledExactlyOnceWith({ tipo: "pedido", id: "pedido-231", accion: "rechazar", motivo: "Excede la capacidad" });
    expect(pestana(/^Rechazados/)).toHaveTextContent("2");
  });

  it("doble toque en «Autorizar reducido»: sale una sola vez", async () => {
    const { acciones: a } = montar();
    await reducirEl231();
    const autorizar = boton("Pedido #231", /^Autorizar reducido/);
    await act(async () => {
      fireEvent.click(autorizar);
      fireEvent.click(autorizar);
    });
    expect(screen.getAllByText(/^Autorizaste el pedido #231/)).toHaveLength(1);
    await avanzar(MS_DESHACER * 2);
    expect(a.decidir).toHaveBeenCalledTimes(1);
  });

  it("si no sale (sin conexión), vuelve a «por autorizar» con la deuda de antes, lo elegido y el botón disponible", async () => {
    const respuestas: Resultado[] = [{ ok: false, causa: "sin-conexion" }];
    const a = acciones((d) => respuestas.shift() ?? ok(d));
    montar(datos(), a);
    await reducirEl231();
    await tocar(boton("Pedido #231", /^Autorizar reducido/));
    await avanzar(MS_DESHACER);

    expect(screen.getByRole("alert")).toHaveTextContent("Necesitás conexión para autorizar el pedido #231. Revisá la conexión y probá de nuevo. Sigue por autorizar.");
    expect(pestana(/^Por autorizar/)).toHaveTextContent("4");
    await tocar(fila("#231"));
    expect(cantidadDe(ESPERANZA)).toHaveTextContent("5");
    expect(within(detalle("Pedido #231")).getByText("Deuda actual").closest("div")).toHaveTextContent("$U 22.100");
    expect(boton("Pedido #231", /^Autorizar reducido/)).toHaveAttribute("aria-disabled", "false");

    await tocar(boton("Pedido #231", /^Autorizar reducido/));
    await avanzar(MS_DESHACER);
    expect(a.decidir).toHaveBeenCalledTimes(2);
    expect(pestana(/^Por autorizar/)).toHaveTextContent("3");
  });

  it("si la acción tira una excepción también vuelve a «por autorizar» y el rechazo conserva su motivo", async () => {
    const a = acciones(() => {
      throw new Error("se cayó");
    });
    montar(datos(), a);
    await tocar(boton("Pedido #231", /^Rechazar/));
    await escribir(screen.getByRole("textbox", { name: /MOTIVO DEL RECHAZO/ }), "No corresponde");
    await tocar(screen.getByRole("button", { name: "Confirmar rechazo" }));
    await avanzar(MS_DESHACER);

    expect(screen.getByRole("alert")).toHaveTextContent("Necesitás conexión para rechazar el pedido #231");
    await tocar(fila("#231"));
    expect(screen.getByRole("textbox", { name: /MOTIVO DEL RECHAZO/ })).toHaveValue("No corresponde");
    expect(hayTrabajoPendiente()).toBe(false);
  });

  it("si el servidor lo rechaza muestra su texto (por ejemplo, que otro ya lo resolvió)", async () => {
    montar(datos(), acciones(() => ({ ok: false, causa: "rechazado", mensaje: "Este pedido ya no está por autorizar." })));
    await tocar(boton("Pedido #231", /^Autorizar/));
    await avanzar(MS_DESHACER);
    expect(screen.getByRole("alert")).toHaveTextContent("Este pedido ya no está por autorizar. Sigue por autorizar.");
  });

  it("dos pedidos seguidos antes de que venza el primero: cada uno tiene su plazo y no se pierde ninguno", async () => {
    const { acciones: a } = montar();
    await tocar(boton("Pedido #231", /^Autorizar/));
    await avanzar(3000);
    await tocar(boton("Pedido #230", /^Autorizar/));
    expect(screen.getAllByRole("button", { name: /^Deshacer/ })).toHaveLength(2);

    await avanzar(5000);
    expect(a.decidir).toHaveBeenCalledTimes(1);
    expect(a.decidir).toHaveBeenLastCalledWith({ tipo: "pedido", id: "pedido-231", accion: "autorizar" });
    await avanzar(3000);
    expect(a.decidir).toHaveBeenCalledTimes(2);
    expect(a.decidir).toHaveBeenLastCalledWith({ tipo: "pedido", id: "pedido-230", accion: "autorizar" });
    expect(pestana(/^Autorizados/)).toHaveTextContent("3");
  });

  it("deshacer uno de dos no toca al otro", async () => {
    const { acciones: a } = montar();
    await tocar(boton("Pedido #231", /^Autorizar/));
    await tocar(boton("Pedido #230", /^Autorizar/));
    await tocar(deshacerDe("autorización", "#231"));
    await avanzar(MS_DESHACER);

    expect(a.decidir).toHaveBeenCalledExactlyOnceWith({ tipo: "pedido", id: "pedido-230", accion: "autorizar" });
    expect(pestana(/^Por autorizar/)).toHaveTextContent("3");
  });

  it("dos pedidos del mismo colportor: autorizar uno suma a la deuda del otro y deshacer la devuelve", async () => {
    const base = datos();
    const otro = { ...base.pedidos[0], id: "pedido-232", numero: "#232", enviadoEn: new Date(AHORA.getTime() - 1 * 3_600_000).toISOString() };
    montar({ ...base, pedidos: [otro, ...base.pedidos] });
    await tocar(boton("Pedido #232", /^Autorizar/));
    await tocar(fila("#231"));
    expect(within(detalle("Pedido #231")).getByText("Deuda actual").closest("div")).toHaveTextContent("$U 58.140");
    await tocar(deshacerDe("autorización", "#232"));
    await tocar(fila("#231"));
    expect(within(detalle("Pedido #231")).getByText("Deuda actual").closest("div")).toHaveTextContent("$U 22.100");
  });

  it("lo que está dentro del plazo cuenta como trabajo pendiente y al desmontar la vista sale en ese momento", async () => {
    const { acciones: a, unmount } = montar();
    await tocar(boton("Pedido #231", /^Autorizar/));
    expect(hayTrabajoPendiente()).toBe(true);
    await act(async () => unmount());
    expect(a.decidir).toHaveBeenCalledExactlyOnceWith({ tipo: "pedido", id: "pedido-231", accion: "autorizar" });
  });

  it("el plazo no corre mientras el foco está en «Deshacer» (Deshacer AA)", async () => {
    const { acciones: a } = montar();
    await tocar(boton("Pedido #231", /^Autorizar/));
    await avanzar(5000);
    await act(async () => fireEvent.focus(deshacerDe()));
    await avanzar(MS_DESHACER * 3);
    expect(a.decidir).not.toHaveBeenCalled();
    await act(async () => fireEvent.blur(deshacerDe()));
    await avanzar(3000);
    expect(a.decidir).toHaveBeenCalledTimes(1);
  });

  it("el último pedido por autorizar: al autorizarlo el foco va a la pestaña y «Deshacer» lo trae de vuelta", async () => {
    const base = datos();
    montar({ ...base, pedidos: base.pedidos.filter((p) => p.numero === "#231"), transferencias: [] });
    await tocar(boton("Pedido #231", /^Autorizar/));

    expect(screen.getByText("No hay pedidos por autorizar en la campaña.")).toBeInTheDocument();
    expect(pestana(/^Por autorizar/)).toHaveFocus();
    await tocar(deshacerDe());
    expect(boton("Pedido #231", /^Autorizar/)).toHaveFocus();
  });

  it("con la fuente simulada las cantidades llegan hasta el pedido autorizado", async () => {
    const simulada = crearAccionesSimuladas();
    const r = await simulada.decidir({ tipo: "pedido", id: "p", accion: "autorizar", cantidades: [{ nombre: "a", cantidad: 2 }] });
    expect(r).toMatchObject({ ok: true, valor: { estado: "AUTORIZADO", cantidades: [{ nombre: "a", cantidad: 2 }] } });
    expect(await simulada.decidir({ tipo: "pedido", id: "p", accion: "autorizar", cantidades: [{ nombre: "a", cantidad: 0 }] })).toMatchObject({ ok: false, causa: "rechazado" });
    expect(await simulada.decidir({ tipo: "pedido", id: "p", accion: "autorizar", cantidades: [{ nombre: "a", cantidad: -1 }] })).toMatchObject({ ok: false });
    expect(await simulada.decidir({ tipo: "transferencia", id: "t", accion: "autorizar", cantidades: [{ nombre: "a", cantidad: 1 }] })).toMatchObject({ ok: false });
  });
});
