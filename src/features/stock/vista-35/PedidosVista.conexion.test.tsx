import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AccionesPedidos, DatosDePedidos, DecisionDeSolicitud, ResultadoDeAccion, SolicitudResuelta } from "@/datos/stock/pedidos";
import { crearDatosDePedidosSimulados } from "@/datos/stock/pedidos/simulado";
import { MS_DESHACER } from "@/features/cuentas/vista-29/modelo";
import { reiniciarTrabajoPendiente } from "@/shell/trabajo-pendiente";

import { PedidosVista } from "./PedidosVista";

/**
 * #215 · la vista 35 conectada a las RPC de la bandeja: «Quitar el límite» y el cero como límite (decisión del 24/11, regla R6),
 * el límite que la fuente no puede leer, y «Deshacer» pasado el plazo (HU-STK-003; la base daría `PE005`).
 */

const AHORA = new Date("2026-10-22T18:00:00-03:00");
type Limite = ResultadoDeAccion<{ limiteDeDeuda: number | null }>;

const resuelta = (d: DecisionDeSolicitud): ResultadoDeAccion<SolicitudResuelta> => ({
  ok: true,
  valor: { tipo: d.tipo, id: d.id, estado: d.tipo === "pedido" ? "AUTORIZADO" : "AUTORIZADA", resueltoEn: AHORA.toISOString(), motivoDeRechazo: null },
});

function acciones(limite: (l: number | null) => Promise<Limite> | Limite = (l) => ({ ok: true, valor: { limiteDeDeuda: l } })) {
  const decidir = vi.fn(async (d: DecisionDeSolicitud) => resuelta(d));
  const editarLimite = vi.fn(async (l: number | null) => limite(l));
  return { decidir, editarLimite } satisfies AccionesPedidos;
}

function montar(cambios: Partial<DatosDePedidos> = {}, a = acciones()) {
  const datos = { ...crearDatosDePedidosSimulados(AHORA), ...cambios };
  render(<PedidosVista datos={datos} acciones={a} />);
  return a;
}

const tocar = (el: HTMLElement) => act(async () => fireEvent.click(el));
const escribir = (el: HTMLElement, texto: string) => act(async () => fireEvent.change(el, { target: { value: texto } }));
const abrir = () => tocar(screen.getByRole("button", { name: "Editar límite" }));
const campo = () => screen.getByLabelText("LÍMITE POR COLPORTOR");
const quitar = () => screen.getByRole("button", { name: "Quitar el límite" });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
});

afterEach(() => {
  vi.useRealTimers();
  reiniciarTrabajoPendiente();
  vi.restoreAllMocks();
});

describe("«Quitar el límite» (24/11, regla R6)", () => {
  it("con un límite fijado, el diálogo ofrece «Quitar el límite» como botón secundario y manda null con la campaña abierta", async () => {
    const a = montar();
    await abrir();
    expect(quitar()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();

    await tocar(quitar());

    expect(a.editarLimite).toHaveBeenCalledExactlyOnceWith(null, "campania-primavera-2026");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Sin límite de deuda fijado")).toBeInTheDocument();
    expect(screen.getByText(/Sin límite de deuda fijado: ningún pedido avisa por el límite\./)).toBeInTheDocument();
    expect(screen.queryByText("△ Supera el límite")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar límite" })).toHaveFocus();
  });

  it("sin límite fijado no hay nada para quitar: el botón no está", async () => {
    montar({ limiteDeDeuda: null });
    await abrir();
    expect(screen.queryByRole("button", { name: "Quitar el límite" })).not.toBeInTheDocument();
  });

  it("el doble toque manda una sola vez", async () => {
    let terminar!: (r: Limite) => void;
    const a = montar({}, acciones(() => new Promise<Limite>((res) => (terminar = res))));
    await abrir();
    await tocar(quitar());
    await tocar(quitar());
    expect(a.editarLimite).toHaveBeenCalledTimes(1);
    await act(async () => terminar({ ok: true, valor: { limiteDeDeuda: null } }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("si falla, el diálogo sigue abierto con el motivo, el límite no cambia y los botones se pueden volver a usar", async () => {
    const respuestas: Limite[] = [{ ok: false, causa: "rechazado", mensaje: "La campaña ya terminó." }, { ok: false, causa: "sin-conexion" }, { ok: true, valor: { limiteDeDeuda: null } }];
    const a = montar({}, acciones(() => respuestas.shift() as Limite));
    await abrir();

    await tocar(quitar());
    expect(screen.getByRole("alert")).toHaveTextContent("La campaña ya terminó.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/^Límite de deuda de la campaña:/)).toHaveTextContent("$U 50.000 por colportor");
    expect(quitar()).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Guardar" })).not.toHaveAttribute("aria-disabled", "true");

    await tocar(quitar());
    expect(screen.getByRole("alert")).toHaveTextContent("Necesitás conexión para quitar el límite.");

    await tocar(quitar());
    expect(a.editarLimite).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("una caída (la acción tira) cuenta como sin conexión y no deja el diálogo trabado", async () => {
    const a = montar({}, acciones(() => Promise.reject(new Error("sin red"))));
    await abrir();
    await tocar(quitar());
    expect(screen.getByRole("alert")).toHaveTextContent("Necesitás conexión");
    expect(quitar()).not.toHaveAttribute("aria-disabled", "true");
    expect(a.editarLimite).toHaveBeenCalledTimes(1);
  });

  it("sin conexión del navegador queda apagado y no manda nada", async () => {
    const enLinea = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const a = montar();
    await abrir();
    expect(quitar()).toHaveAttribute("aria-disabled", "true");
    await tocar(quitar());
    expect(a.editarLimite).not.toHaveBeenCalled();
    enLinea.mockReturnValue(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await tocar(quitar());
    expect(a.editarLimite).toHaveBeenCalledTimes(1);
  });

  it("Esc y Tab siguen cerrando y ciclando dentro del diálogo con el botón nuevo", async () => {
    montar();
    await abrir();
    quitar().focus();
    await act(async () => fireEvent.keyDown(quitar(), { key: "Escape" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("el cero es un límite", () => {
  it("«0» se guarda como límite (no se toma por «sin límite») y todo pedido con deuda avisa", async () => {
    const a = montar();
    await abrir();
    await escribir(campo(), "0");
    await tocar(screen.getByRole("button", { name: "Guardar" }));

    expect(a.editarLimite).toHaveBeenCalledExactlyOnceWith(0, "campania-primavera-2026");
    expect(screen.getByText(/^Límite de deuda de la campaña:/)).toHaveTextContent("$U 0 por colportor");
    expect(screen.queryByText("Sin límite de deuda fijado")).not.toBeInTheDocument();
    expect(screen.getAllByText("△ Supera el límite").length).toBeGreaterThan(1);
  });
});

describe("el límite que la fuente no puede leer (pendiente P1)", () => {
  it("no afirma «sin límite», no avisa de nada con él y deja ponerlo o quitarlo", async () => {
    const a = montar({ limiteDeDeuda: null, limiteSinLeer: true });
    expect(screen.queryByText("Sin límite de deuda fijado")).not.toBeInTheDocument();
    expect(screen.getByText("Límite de deuda de la campaña: todavía no se puede mostrar")).toBeInTheDocument();
    expect(screen.queryByText("△ Supera el límite")).not.toBeInTheDocument();

    await abrir();
    expect(quitar()).toBeInTheDocument();
    await escribir(campo(), "35000");
    expect(screen.getByRole("note")).toHaveTextContent("Hoy no se puede mostrar el límite de la campaña.");
    await tocar(screen.getByRole("button", { name: "Guardar" }));

    expect(a.editarLimite).toHaveBeenCalledExactlyOnceWith(35_000, "campania-primavera-2026");
    expect(screen.getByText(/^Límite de deuda de la campaña:/)).toHaveTextContent("$U 35.000 por colportor");
    expect(screen.queryByText(/todavía no se puede mostrar/)).not.toBeInTheDocument();
  });

  it("quitar el límite sin leerlo sabe que quedó sin límite", async () => {
    montar({ limiteDeDeuda: null, limiteSinLeer: true });
    await abrir();
    await tocar(quitar());
    expect(screen.getByText("Sin límite de deuda fijado")).toBeInTheDocument();
  });
});

describe("«Deshacer» pasado el plazo (HU-STK-003, «Deshacer fuera de plazo»)", () => {
  it("si el toque llega cuando el plazo ya se cerró, el pedido queda como se decidió y la pantalla lo dice", async () => {
    const a = montar();
    await tocar(screen.getByRole("button", { name: "Autorizar el pedido #231 de Emiliano Sosa" }));
    const deshacer = screen.getByRole("button", { name: "Deshacer · 8 s: autorización del pedido #231" });

    // El plazo vence y, antes de que la pantalla se repinte, llega el toque: la decisión ya salió.
    await act(async () => {
      vi.advanceTimersByTime(MS_DESHACER);
      fireEvent.click(deshacer);
    });

    expect(a.decidir).toHaveBeenCalledExactlyOnceWith({ tipo: "pedido", id: "pedido-231", accion: "autorizar" });
    expect(screen.getByText("Ya pasó el plazo para deshacer: el pedido #231 quedó como lo decidiste.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Deshacer/ })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Autorizados/ })).toHaveTextContent("2");
  });

  it("lo mismo con una transferencia", async () => {
    const a = montar();
    await tocar(screen.getByRole("tab", { name: /^Transferencias/ }));
    await tocar(screen.getByRole("button", { name: /^T-18,/ }));
    await tocar(screen.getByRole("button", { name: /^Autorizar la transferencia T-18/ }));
    const deshacer = screen.getByRole("button", { name: "Deshacer · 8 s: autorización de la transferencia T-18" });

    await act(async () => {
      vi.advanceTimersByTime(MS_DESHACER);
      fireEvent.click(deshacer);
    });

    expect(a.decidir).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Ya pasó el plazo para deshacer: la transferencia T-18 quedó como lo decidiste.")).toBeInTheDocument();
  });

  it("un «Deshacer» a tiempo sigue sin avisar nada de plazo", async () => {
    const a = montar();
    await tocar(screen.getByRole("button", { name: "Autorizar el pedido #231 de Emiliano Sosa" }));
    await tocar(screen.getByRole("button", { name: "Deshacer · 8 s: autorización del pedido #231" }));
    expect(screen.queryByText(/Ya pasó el plazo/)).not.toBeInTheDocument();
    expect(a.decidir).not.toHaveBeenCalled();
  });
});
