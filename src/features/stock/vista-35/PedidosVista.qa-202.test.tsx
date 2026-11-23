import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AccionesPedidos, DatosDePedidos, DecisionDeSolicitud, ResultadoDeAccion, SolicitudResuelta } from "@/datos/stock/pedidos";
import { crearDatosDePedidosSimulados } from "@/datos/stock/pedidos/simulado";
import { MS_DESHACER } from "@/features/cuentas/vista-29/modelo";
import { reiniciarTrabajoPendiente } from "@/shell/trabajo-pendiente";

import { PedidosVista } from "./PedidosVista";

/**
 * QA de la vista 35 (PR #202, issue #110): «Deshacer» de 8 s al autorizar o rechazar una transferencia. Lo que los tests del
 * implementador no cubren: ciclos de deshacer, validación del motivo, envío en vuelo y la deuda al deshacer.
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
  },
});

function acciones(responder: (d: DecisionDeSolicitud) => Promise<Resultado> | Resultado = ok) {
  const decidir = vi.fn(async (d: DecisionDeSolicitud) => responder(d));
  return { decidir } satisfies AccionesPedidos;
}

function montar(datos: DatosDePedidos = crearDatosDePedidosSimulados(AHORA), a = acciones()) {
  const vista = render(<PedidosVista datos={datos} acciones={a} />);
  return { ...vista, acciones: a };
}

const pestana = (nombre: RegExp) => screen.getByRole("tab", { name: nombre });
const detalle = (titulo: string) => screen.getByRole("region", { name: titulo });
const tocar = (el: HTMLElement) => act(async () => fireEvent.click(el));
const escribir = (el: HTMLElement, texto: string) => act(async () => fireEvent.change(el, { target: { value: texto } }));
const avanzar = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
  });
const botonAutorizar = () => within(detalle("Transferencia T-18")).getByRole("button", { name: /^Autorizar/ });
const botonRechazar = () => within(detalle("Transferencia T-18")).getByRole("button", { name: /^Rechazar/ });
const deshacerDe = (que: "autorización" | "rechazo" = "autorización") =>
  screen.getByRole("button", { name: `Deshacer · 8 s: ${que} de la transferencia T-18` });
const pasosT18 = () => within(detalle("Transferencia T-18")).getByRole("list", { name: "Estado de la transferencia" });
const motivo = () => screen.getByRole("textbox", { name: /MOTIVO DEL RECHAZO/ });

async function abrirTransferencias() {
  await tocar(pestana(/^Transferencias/));
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
});

afterEach(() => {
  vi.useRealTimers();
  reiniciarTrabajoPendiente();
});

describe("ciclos de «Deshacer» y acciones superpuestas", () => {
  it("autorizar y deshacer tres veces seguidas no deja plazos sueltos: no sale nada, y a la cuarta sale una sola vez", async () => {
    const { acciones: a } = montar();
    await abrirTransferencias();
    for (let i = 0; i < 3; i++) {
      await tocar(botonAutorizar());
      await avanzar(1500);
      await tocar(deshacerDe());
    }
    await avanzar(MS_DESHACER * 2);
    expect(a.decidir).not.toHaveBeenCalled();

    await tocar(botonAutorizar());
    await avanzar(MS_DESHACER);
    expect(a.decidir).toHaveBeenCalledTimes(1);
    expect(a.decidir).toHaveBeenCalledWith({ tipo: "transferencia", id: "transferencia-18", accion: "autorizar" });
  });

  it("autorizar, deshacer y rechazar: sale solo el rechazo, con su motivo, y no la autorización vieja", async () => {
    const { acciones: a } = montar();
    await abrirTransferencias();
    await tocar(botonAutorizar());
    await avanzar(2000);
    await tocar(deshacerDe());
    await tocar(botonRechazar());
    await escribir(motivo(), "Ya la entregó otra persona");
    await tocar(screen.getByRole("button", { name: "Confirmar rechazo" }));
    await avanzar(MS_DESHACER * 2);

    expect(a.decidir).toHaveBeenCalledTimes(1);
    expect(a.decidir).toHaveBeenCalledWith({ tipo: "transferencia", id: "transferencia-18", accion: "rechazar", motivo: "Ya la entregó otra persona" });
  });

  it("pasado el plazo con el envío todavía en vuelo ya no hay «Deshacer» ni «Autorizar»; si falla, vuelve a por autorizar", async () => {
    let resolver!: (r: Resultado) => void;
    const a = acciones(() => new Promise<Resultado>((res) => (resolver = res)));
    montar(undefined, a);
    await abrirTransferencias();
    await tocar(botonAutorizar());
    await avanzar(MS_DESHACER);

    expect(a.decidir).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /^Deshacer/ })).not.toBeInTheDocument();
    expect(within(detalle("Transferencia T-18")).queryByRole("button", { name: /^Autorizar/ })).not.toBeInTheDocument();

    await act(async () => resolver({ ok: false, causa: "sin-conexion" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Sigue por autorizar.");
    expect(botonAutorizar()).not.toHaveAttribute("aria-disabled", "true");
    expect(within(pasosT18()).getByText(/^Por autorizar/)).toHaveTextContent("Por autorizar (estado actual)");
  });

  it("el aviso de «Deshacer» está en una región viva, para que el lector de pantalla lo anuncie al aparecer", async () => {
    montar();
    await abrirTransferencias();
    await tocar(botonAutorizar());
    expect(deshacerDe().closest("[aria-live]")).toHaveAttribute("aria-live", "polite");
  });

  it("con el teclado: «Deshacer» se activa con Enter y vuelve el foco a «Autorizar»", async () => {
    vi.useRealTimers();
    montar();
    await userEvent.click(pestana(/^Transferencias/));
    await userEvent.click(botonAutorizar());
    deshacerDe().focus();
    await userEvent.keyboard("{Enter}");
    expect(botonAutorizar()).toHaveFocus();
  });
});

describe("validación del motivo de un rechazo con «Deshacer»", () => {
  it("solo espacios: no hay aviso de «Deshacer», no se programa nada y el error guía a escribir el motivo", async () => {
    const { acciones: a } = montar();
    await abrirTransferencias();
    await tocar(botonRechazar());
    await escribir(motivo(), "     ");
    await tocar(screen.getByRole("button", { name: "Confirmar rechazo" }));
    await avanzar(MS_DESHACER * 2);

    expect(screen.queryByRole("button", { name: /^Deshacer/ })).not.toBeInTheDocument();
    expect(a.decidir).not.toHaveBeenCalled();
    expect(screen.getByText("Escribí el motivo para rechazar la transferencia.")).toBeInTheDocument();
  });

  it("501 caracteres pegados: no se programa y el error dice el máximo; con 500 sí y sale entero", async () => {
    const { acciones: a } = montar();
    await abrirTransferencias();
    await tocar(botonRechazar());
    await escribir(motivo(), "a".repeat(501));
    await tocar(screen.getByRole("button", { name: "Confirmar rechazo" }));
    expect(screen.queryByRole("button", { name: /^Deshacer/ })).not.toBeInTheDocument();
    expect(screen.getByText("El motivo es muy largo: usá hasta 500 caracteres.")).toBeInTheDocument();

    await escribir(motivo(), "a".repeat(500));
    await tocar(screen.getByRole("button", { name: "Confirmar rechazo" }));
    await avanzar(MS_DESHACER);
    expect(a.decidir).toHaveBeenCalledWith({ tipo: "transferencia", id: "transferencia-18", accion: "rechazar", motivo: "a".repeat(500) });
  });

  it("emoji, comillas y marcas HTML en el motivo salen tal cual al servidor y se muestran como texto", async () => {
    const { acciones: a, container } = montar();
    await abrirTransferencias();
    const texto = `No alcanza 😀 "ya" <b>x</b> & Ñandú`;
    await tocar(botonRechazar());
    await escribir(motivo(), `  ${texto}  `);
    await tocar(screen.getByRole("button", { name: "Confirmar rechazo" }));
    expect(within(container).queryByText("x", { selector: "b" })).toBeNull();
    await avanzar(MS_DESHACER);
    expect(a.decidir).toHaveBeenCalledWith({ tipo: "transferencia", id: "transferencia-18", accion: "rechazar", motivo: texto });
  });

  it("rechazar, deshacer y confirmar de nuevo sin tocar el motivo: sale una vez, con el mismo motivo", async () => {
    const { acciones: a } = montar();
    await abrirTransferencias();
    await tocar(botonRechazar());
    await escribir(motivo(), "Sin stock en Rivera");
    await tocar(screen.getByRole("button", { name: "Confirmar rechazo" }));
    await avanzar(3000);
    await tocar(deshacerDe("rechazo"));
    expect(motivo()).toHaveValue("Sin stock en Rivera");
    await tocar(screen.getByRole("button", { name: "Confirmar rechazo" }));
    await avanzar(MS_DESHACER * 2);

    expect(a.decidir).toHaveBeenCalledTimes(1);
    expect(a.decidir).toHaveBeenCalledWith({ tipo: "transferencia", id: "transferencia-18", accion: "rechazar", motivo: "Sin stock en Rivera" });
  });
});

describe("la deuda que se ve al autorizar y al deshacer", () => {
  const deudaDeLucia = () => within(detalle("Pedido #230")).getByText("Deuda actual").closest("div")!;

  it("autorizar T-18 suma $U 2.900 a la deuda de Lucía en su pedido y deshacer la devuelve a $U 14.300", async () => {
    montar();
    await tocar(pestana(/^Todos/));
    await tocar(screen.getByRole("button", { name: /^#230,/ }));
    expect(deudaDeLucia()).toHaveTextContent("$U 14.300");

    await tocar(pestana(/^Transferencias/));
    await tocar(botonAutorizar());
    await tocar(pestana(/^Todos/));
    await tocar(screen.getByRole("button", { name: /^#230,/ }));
    expect(deudaDeLucia()).toHaveTextContent("$U 17.200");

    await tocar(deshacerDe());
    await tocar(pestana(/^Todos/));
    await tocar(screen.getByRole("button", { name: /^#230,/ }));
    expect(deudaDeLucia()).toHaveTextContent("$U 14.300");
  });

  // El «Deshacer» es la inversa exacta de autorizar (HU-STK-006): la deuda de quien da no baja de cero al autorizar, así que
  // deshacer devuelve lo que realmente se descontó (el efecto guardado), no el costo entero.
  it("QA #110: si quien da debe menos que lo transferido, deshacer le devuelve la deuda que tenía, no más", async () => {
    const base = crearDatosDePedidosSimulados(AHORA);
    // Valentina (quien da) debe $U 1.000 y le transfiere $U 2.900 a Lucía. El pedido #224 es suyo.
    const datos: DatosDePedidos = {
      ...base,
      pedidos: base.pedidos.map((p) => (p.colportorNombre === "Valentina Silva" ? { ...p, cuenta: { ...p.cuenta, deuda: 1000 } } : p)),
    };
    montar(datos);
    await tocar(pestana(/^Todos/));
    await tocar(screen.getByRole("button", { name: /^#224,/ }));
    const deuda = () => within(detalle("Pedido #224")).getByText("Deuda actual").closest("div")!;
    expect(deuda()).toHaveTextContent("$U 1.000");

    await tocar(pestana(/^Transferencias/));
    await tocar(botonAutorizar());
    await tocar(deshacerDe());
    await tocar(pestana(/^Todos/));
    await tocar(screen.getByRole("button", { name: /^#224,/ }));
    expect(deuda()).toHaveTextContent("$U 1.000");
  });
});

describe("texto del aviso mientras la decisión no es firme (decisión del orquestador, P1 de QA, 22/11)", () => {
  it("QA #110: el aviso de una autorización dice que la deuda pasa «cuando se cierre este aviso»", async () => {
    montar();
    await abrirTransferencias();
    await tocar(botonAutorizar());
    expect(deshacerDe().closest("div")).toHaveTextContent(/pasa a Lucía cuando se cierre este aviso\./);
  });

  it("QA #110: el aviso de un rechazo dice que el colportor recibe el motivo «cuando se cierre este aviso», no antes", async () => {
    montar();
    await abrirTransferencias();
    await tocar(botonRechazar());
    await escribir(motivo(), "Sin stock");
    await tocar(screen.getByRole("button", { name: "Confirmar rechazo" }));
    expect(deshacerDe("rechazo").closest("div")).toHaveTextContent(/Cuando se cierre este aviso, el colportor recibe el motivo\./i);
  });
});
