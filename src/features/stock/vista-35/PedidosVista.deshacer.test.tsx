import { act, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AccionesPedidos, DatosDePedidos, DecisionDeSolicitud, ResultadoDeAccion, SolicitudResuelta, TransferenciaDeStock } from "@/datos/stock/pedidos";
import { crearDatosDePedidosSimulados } from "@/datos/stock/pedidos/simulado";
import { MS_DESHACER } from "@/features/cuentas/vista-29/modelo";
import { hayTrabajoPendiente, reiniciarTrabajoPendiente } from "@/shell/trabajo-pendiente";

import { PedidosVista } from "./PedidosVista";

/**
 * «Deshacer» de 8 s al autorizar o rechazar una transferencia (HU-STK-005, #110; canvas 42A·04): la bandeja la muestra decidida
 * con su aviso, la decisión sale recién a los 8 s y, con «Deshacer», no sale nunca. Con los casos límite de cada flujo.
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

/** T-18 (Valentina → Lucía) más las transferencias extra que pida el caso, todas de Rivera. */
function datosConTransferencias(extra: Array<Partial<TransferenciaDeStock> & { numero: string }> = []): DatosDePedidos {
  const base = crearDatosDePedidosSimulados(AHORA);
  const t18 = base.transferencias.find((t) => t.numero === "T-18")!;
  const masTransferencias = extra.map(
    (e): TransferenciaDeStock => ({ ...t18, id: `transferencia-${e.numero.slice(2)}`, deNombre: `Colportor ${e.numero}`, ...e }),
  );
  return { ...base, transferencias: [...base.transferencias, ...masTransferencias] };
}

function montar(datos = datosConTransferencias(), a = acciones()) {
  const vista = render(<PedidosVista datos={datos} acciones={a} />);
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
/** Abre la transferencia en la lista (la que abre sola es la más nueva) y toca «Autorizar». */
async function autorizar(numero: string) {
  await tocar(fila(numero));
  await tocar(within(detalle(`Transferencia ${numero}`)).getByRole("button", { name: /^Autorizar/ }));
}
const deshacerDe = (numero: string, que: "autorización" | "rechazo" = "autorización") =>
  screen.getByRole("button", { name: `Deshacer · 8 s: ${que} de la transferencia ${numero}` });
const pasos = (numero: string) => within(detalle(`Transferencia ${numero}`)).getByRole("list", { name: "Estado de la transferencia" });

async function rechazar(numero: string, motivo: string) {
  await tocar(within(detalle(`Transferencia ${numero}`)).getByRole("button", { name: /^Rechazar/ }));
  await escribir(screen.getByRole("textbox", { name: /MOTIVO DEL RECHAZO/ }), motivo);
  await tocar(screen.getByRole("button", { name: "Confirmar rechazo" }));
}

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

describe("42A·04 · autorizar una transferencia deja 8 s el aviso con «Deshacer»", () => {
  it("la bandeja la muestra autorizada con el aviso, pero no sale al servidor hasta cerrar el plazo", async () => {
    const { acciones: a } = montar();
    await abrirTransferencias();
    await autorizar("T-18");

    expect(screen.getByText("Autorizaste la transferencia T-18 de Valentina Silva: la deuda de $U 2.900 pasa a Lucía.")).toBeInTheDocument();
    expect(deshacerDe("T-18")).toHaveTextContent("Deshacer · 8 s");
    expect(within(pasos("T-18")).getByText(/^Autorizada/)).toHaveTextContent("Autorizada (hecho)");
    expect(within(detalle("Transferencia T-18")).queryByRole("button", { name: /^Autorizar/ })).not.toBeInTheDocument();
    expect(within(detalle("Transferencia T-18")).getByRole("heading", { level: 3 })).toHaveFocus();
    expect(a.decidir).not.toHaveBeenCalled();
    expect(hayTrabajoPendiente()).toBe(true);

    await avanzar(MS_DESHACER - 1);
    expect(a.decidir).not.toHaveBeenCalled();
    await avanzar(1);
    expect(a.decidir).toHaveBeenCalledTimes(1);
    expect(a.decidir).toHaveBeenCalledWith({ tipo: "transferencia", id: "transferencia-18", accion: "autorizar" });
    expect(screen.queryByRole("button", { name: /^Deshacer/ })).not.toBeInTheDocument();
    expect(within(pasos("T-18")).getByText(/^Autorizada/)).toHaveTextContent("Autorizada (hecho)");
    expect(hayTrabajoPendiente()).toBe(false);
  });

  it("«Deshacer» la deja por autorizar otra vez, con el foco en «Autorizar», y no se manda nunca", async () => {
    const { acciones: a } = montar();
    await abrirTransferencias();
    await autorizar("T-18");
    await avanzar(3000);
    await tocar(deshacerDe("T-18"));

    expect(screen.queryByRole("button", { name: /^Deshacer/ })).not.toBeInTheDocument();
    expect(within(pasos("T-18")).getByText(/^Por autorizar/)).toHaveTextContent("Por autorizar (estado actual)");
    const autorizarDeNuevo = within(detalle("Transferencia T-18")).getByRole("button", { name: /^Autorizar/ });
    expect(autorizarDeNuevo).toHaveFocus();
    expect(autorizarDeNuevo).not.toHaveAttribute("aria-disabled", "true");
    await avanzar(MS_DESHACER * 3);
    expect(a.decidir).not.toHaveBeenCalled();
    expect(hayTrabajoPendiente()).toBe(false);
  });

  it("después de deshacer se puede volver a autorizar y esa vez sale", async () => {
    const { acciones: a } = montar();
    await abrirTransferencias();
    await autorizar("T-18");
    await tocar(deshacerDe("T-18"));
    await autorizar("T-18");
    await avanzar(MS_DESHACER);

    expect(a.decidir).toHaveBeenCalledTimes(1);
  });

  it("el plazo no cuenta mientras el foco está en «Deshacer» y sigue con lo que quedaba al salir (Deshacer AA)", async () => {
    const { acciones: a } = montar();
    await abrirTransferencias();
    await autorizar("T-18");
    await avanzar(5000);
    await act(async () => deshacerDe("T-18").focus());
    await avanzar(60_000);
    expect(a.decidir).not.toHaveBeenCalled();
    expect(deshacerDe("T-18")).toBeInTheDocument();

    await act(async () => deshacerDe("T-18").blur());
    await avanzar(2999);
    expect(a.decidir).not.toHaveBeenCalled();
    await avanzar(1);
    expect(a.decidir).toHaveBeenCalledTimes(1);
  });

  it("con lector de pantalla el botón se distingue por lo que deshace y contiene su texto visible", async () => {
    montar();
    await abrirTransferencias();
    await autorizar("T-18");
    const boton = deshacerDe("T-18");
    expect(boton.getAttribute("aria-label")).toContain(boton.textContent ?? "");
    expect(screen.getByText(/^Autorizaste la transferencia T-18/).closest("[aria-live]")).toHaveAttribute("aria-live", "polite");
  });
});

describe("accesibilidad del aviso", () => {
  it("axe (A/AA, sin contraste) no encuentra nada con un aviso de «Deshacer» abierto", async () => {
    const { container } = montar();
    await abrirTransferencias();
    await autorizar("T-18");
    // axe espera con temporizadores reales: el plazo del aviso es de los falsos y no corre.
    vi.useRealTimers();
    const r = await axe.run(container, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      rules: { "color-contrast": { enabled: false } },
    });
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });
});

describe("la deuda vuelve exacta (el piso en cero de quien da)", () => {
  /** Valentina (quien da en T-18) debe $U 1.000, menos que los $U 2.900 que se transfieren: al autorizar queda en 0. */
  const conDeudaChica = () => {
    const base = datosConTransferencias();
    return { ...base, pedidos: base.pedidos.map((p) => (p.numero === "#224" ? { ...p, cuenta: { ...p.cuenta, deuda: 1000 } } : p)) };
  };
  const deudaActualDe = async (numero: string) => {
    await tocar(pestana(/^Todos/));
    await tocar(fila(numero));
    return within(detalle(`Pedido ${numero}`)).getByText("Deuda actual").closest("div")!;
  };

  it("«Deshacer» deja a Valentina en $U 1.000 y a Lucía en $U 14.300", async () => {
    montar(conDeudaChica());
    await abrirTransferencias();
    await autorizar("T-18");
    await tocar(deshacerDe("T-18"));

    expect(await deudaActualDe("#224")).toHaveTextContent("$U 1.000");
    expect(await deudaActualDe("#230")).toHaveTextContent("$U 14.300");
  });

  it("si la decisión no sale, también vuelve a $U 1.000 y $U 14.300", async () => {
    montar(conDeudaChica(), acciones(async () => ({ ok: false, causa: "sin-conexion" })));
    await abrirTransferencias();
    await autorizar("T-18");
    await avanzar(MS_DESHACER);

    expect(await deudaActualDe("#224")).toHaveTextContent("$U 1.000");
    expect(await deudaActualDe("#230")).toHaveTextContent("$U 14.300");
  });

  it("mientras corre el plazo la deuda ya muestra lo decidido", async () => {
    montar(conDeudaChica());
    await abrirTransferencias();
    await autorizar("T-18");

    expect(await deudaActualDe("#224")).toHaveTextContent("$U 0");
    expect(await deudaActualDe("#230")).toHaveTextContent("$U 17.200");
  });
});

describe("42A·04 · rechazar una transferencia («Igual después de rechazar»)", () => {
  it("se ve rechazada con su aviso y el motivo sale a los 8 s", async () => {
    const { acciones: a } = montar();
    await abrirTransferencias();
    await rechazar("T-18", "Sin stock");

    expect(screen.getByText("Rechazaste la transferencia T-18 de Valentina Silva: el colportor recibe el motivo.")).toBeInTheDocument();
    expect(within(pasos("T-18")).getByText(/^Rechazada/)).toHaveTextContent("Rechazada (hecho)");
    expect(within(detalle("Transferencia T-18")).getByText(/Motivo: “Sin stock”/)).toBeInTheDocument();
    expect(a.decidir).not.toHaveBeenCalled();

    await avanzar(MS_DESHACER);
    expect(a.decidir).toHaveBeenCalledWith({ tipo: "transferencia", id: "transferencia-18", accion: "rechazar", motivo: "Sin stock" });
  });

  it("«Deshacer» vuelve al motivo escrito, con el foco ahí, y no se pierde lo que Marta escribió", async () => {
    const { acciones: a } = montar();
    await abrirTransferencias();
    await rechazar("T-18", "Sin stock");
    await tocar(deshacerDe("T-18", "rechazo"));

    const campo = screen.getByRole("textbox", { name: /MOTIVO DEL RECHAZO/ });
    expect(campo).toHaveValue("Sin stock");
    expect(campo).toHaveFocus();
    expect(within(pasos("T-18")).getByText(/^Por autorizar/)).toHaveTextContent("Por autorizar (estado actual)");
    await avanzar(MS_DESHACER * 2);
    expect(a.decidir).not.toHaveBeenCalled();

    await tocar(screen.getByRole("button", { name: "Confirmar rechazo" }));
    await avanzar(MS_DESHACER);
    expect(a.decidir).toHaveBeenCalledTimes(1);
  });

  it("sin motivo no hay nada que deshacer: el error del motivo sigue en su lugar", async () => {
    const { acciones: a } = montar();
    await abrirTransferencias();
    await tocar(within(detalle("Transferencia T-18")).getByRole("button", { name: /^Rechazar/ }));
    await tocar(screen.getByRole("button", { name: "Confirmar rechazo" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Escribí el motivo para rechazar la transferencia.");
    expect(screen.queryByRole("button", { name: /^Deshacer/ })).not.toBeInTheDocument();
    await avanzar(MS_DESHACER * 2);
    expect(a.decidir).not.toHaveBeenCalled();
  });
});

describe("casos límite", () => {
  it("doble toque en «Autorizar»: una sola decisión y un solo aviso", async () => {
    const { acciones: a } = montar();
    await abrirTransferencias();
    const boton = within(detalle("Transferencia T-18")).getByRole("button", { name: /^Autorizar/ });
    await act(async () => {
      fireEvent.click(boton);
      fireEvent.click(boton);
    });

    expect(screen.getAllByRole("button", { name: /^Deshacer/ })).toHaveLength(1);
    await avanzar(MS_DESHACER);
    expect(a.decidir).toHaveBeenCalledTimes(1);
  });

  it("falla a mitad: vuelve a «por autorizar», el aviso dice qué pasó y el botón se puede usar de nuevo", async () => {
    let falla = true;
    const a = acciones(async (d) => (falla ? { ok: false, causa: "rechazado", mensaje: "La transferencia ya la decidió otra persona." } : ok(d)));
    montar(datosConTransferencias(), a);
    await abrirTransferencias();
    await autorizar("T-18");
    await avanzar(MS_DESHACER);

    expect(screen.getByRole("alert")).toHaveTextContent("La transferencia ya la decidió otra persona. Sigue por autorizar.");
    expect(screen.queryByRole("button", { name: /^Deshacer/ })).not.toBeInTheDocument();
    expect(within(pasos("T-18")).getByText(/^Por autorizar/)).toHaveTextContent("Por autorizar (estado actual)");
    const otraVez = within(detalle("Transferencia T-18")).getByRole("button", { name: /^Autorizar/ });
    expect(otraVez).not.toHaveAttribute("aria-disabled", "true");
    expect(hayTrabajoPendiente()).toBe(false);

    falla = false;
    await tocar(otraVez);
    await avanzar(MS_DESHACER);
    expect(a.decidir).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: /^Deshacer/ })).not.toBeInTheDocument();
  });

  it("sin conexión (la acción tira): mismo camino y el aviso guía a revisar la conexión", async () => {
    const a = acciones(async () => {
      throw new Error("sin red");
    });
    montar(datosConTransferencias(), a);
    await abrirTransferencias();
    await autorizar("T-18");
    await avanzar(MS_DESHACER);

    expect(screen.getByRole("alert")).toHaveTextContent(/Necesitás conexión para autorizar la transferencia T-18/);
    expect(screen.getByRole("alert")).toHaveTextContent("Sigue por autorizar.");
    expect(within(detalle("Transferencia T-18")).getByRole("button", { name: /^Autorizar/ })).not.toHaveAttribute("aria-disabled", "true");
  });

  it("un rechazo que falla deja el motivo escrito para reintentar", async () => {
    const a = acciones(async () => ({ ok: false, causa: "sin-conexion" }));
    montar(datosConTransferencias(), a);
    await abrirTransferencias();
    await rechazar("T-18", "Sin stock");
    await avanzar(MS_DESHACER);

    expect(screen.getByRole("textbox", { name: /MOTIVO DEL RECHAZO/ })).toHaveValue("Sin stock");
    expect(screen.getByRole("button", { name: "Confirmar rechazo" })).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(/Necesitás conexión para rechazar la transferencia T-18/);
  });

  it("dos decisiones seguidas antes de que termine la primera: cada una con su plazo, sin pisarse", async () => {
    const { acciones: a } = montar(datosConTransferencias([{ numero: "T-19" }]));
    await abrirTransferencias();
    await autorizar("T-18");
    await avanzar(3000);
    await tocar(fila("T-19"));
    await rechazar("T-19", "No corresponde");
    expect(screen.getAllByRole("button", { name: /^Deshacer/ })).toHaveLength(2);

    await avanzar(5000);
    expect(a.decidir).toHaveBeenCalledTimes(1);
    expect(a.decidir).toHaveBeenLastCalledWith({ tipo: "transferencia", id: "transferencia-18", accion: "autorizar" });
    expect(deshacerDe("T-19", "rechazo")).toBeInTheDocument();

    await avanzar(3000);
    expect(a.decidir).toHaveBeenCalledTimes(2);
    expect(a.decidir).toHaveBeenLastCalledWith({ tipo: "transferencia", id: "transferencia-19", accion: "rechazar", motivo: "No corresponde" });
  });

  it("deshacer una no toca a la otra, que sigue su plazo", async () => {
    const { acciones: a } = montar(datosConTransferencias([{ numero: "T-19" }]));
    await abrirTransferencias();
    await autorizar("T-18");
    await tocar(fila("T-19"));
    await autorizar("T-19");
    await tocar(deshacerDe("T-18"));
    await avanzar(MS_DESHACER);

    expect(a.decidir).toHaveBeenCalledTimes(1);
    expect(a.decidir).toHaveBeenCalledWith({ tipo: "transferencia", id: "transferencia-19", accion: "autorizar" });
    await tocar(fila("T-19"));
    expect(within(pasos("T-19")).getByText(/^Autorizada/)).toHaveTextContent("Autorizada (hecho)");
  });

  it("falla de una mientras la otra sigue en su plazo: solo la que falló vuelve", async () => {
    const a = acciones(async (d) => (d.id === "transferencia-18" ? { ok: false, causa: "sin-conexion" } : ok(d)));
    montar(datosConTransferencias([{ numero: "T-19" }]), a);
    await abrirTransferencias();
    await autorizar("T-18");
    await avanzar(2000);
    await tocar(fila("T-19"));
    await autorizar("T-19");
    await avanzar(6000);

    await tocar(fila("T-18"));
    expect(within(pasos("T-18")).getByText(/^Por autorizar/)).toHaveTextContent("Por autorizar (estado actual)");
    expect(deshacerDe("T-19")).toBeInTheDocument();
    await avanzar(2000);
    await tocar(fila("T-19"));
    expect(within(pasos("T-19")).getByText(/^Autorizada/)).toHaveTextContent("Autorizada (hecho)");
  });

  it("irse de la vista dentro del plazo manda la decisión en ese momento, una sola vez (volver atrás no la pierde)", async () => {
    const { acciones: a, unmount } = montar();
    await abrirTransferencias();
    await autorizar("T-18");
    unmount();

    expect(a.decidir).toHaveBeenCalledTimes(1);
    expect(a.decidir).toHaveBeenCalledWith({ tipo: "transferencia", id: "transferencia-18", accion: "autorizar" });
    await act(async () => {
      vi.advanceTimersByTime(MS_DESHACER * 2);
    });
    expect(a.decidir).toHaveBeenCalledTimes(1);
  });

  it("reentrar a la vista con los datos nuevos muestra lo decidido y no vuelve a mandar nada", async () => {
    const primera = montar();
    await abrirTransferencias();
    await autorizar("T-18");
    primera.unmount();
    reiniciarTrabajoPendiente();

    const base = datosConTransferencias();
    const reentrada = montar({ ...base, transferencias: base.transferencias.map((t) => (t.numero === "T-18" ? { ...t, estado: "AUTORIZADA", resueltaEn: AHORA.toISOString() } : t)) });
    await abrirTransferencias();
    expect(within(pasos("T-18")).getByText(/^Autorizada/)).toHaveTextContent("Autorizada (hecho)");
    expect(screen.queryByRole("button", { name: /^Deshacer/ })).not.toBeInTheDocument();
    await avanzar(MS_DESHACER * 2);
    expect(reentrada.acciones.decidir).not.toHaveBeenCalled();
  });

  it("«Deshacer» desde otra pestaña lleva de vuelta a Transferencias con la transferencia abierta", async () => {
    montar();
    await abrirTransferencias();
    await autorizar("T-18");
    await tocar(pestana(/^Por autorizar/));
    expect(pestana(/^Transferencias/)).toHaveAttribute("aria-selected", "false");

    await tocar(deshacerDe("T-18"));
    expect(pestana(/^Transferencias/)).toHaveAttribute("aria-selected", "true");
    expect(within(detalle("Transferencia T-18")).getByRole("button", { name: /^Autorizar/ })).toHaveFocus();
  });

  it("con el aviso abierto la lista de ciudades cuenta lo decidido y, al deshacer, vuelve a contarla", async () => {
    montar();
    expect(screen.getByText("5 por autorizar · 12 en la campaña")).toBeInTheDocument();
    await abrirTransferencias();
    await autorizar("T-18");
    expect(screen.getByText("4 por autorizar · 12 en la campaña")).toBeInTheDocument();
    await tocar(deshacerDe("T-18"));
    expect(screen.getByText("5 por autorizar · 12 en la campaña")).toBeInTheDocument();
  });

  it("nombres y textos largos no desbordan el aviso", async () => {
    const largo = "María de los Ángeles Fernández de la Cuadra y Rodríguez-Echeverría de las Mercedes";
    const base = datosConTransferencias();
    montar({ ...base, transferencias: base.transferencias.map((t) => (t.numero === "T-18" ? { ...t, deNombre: largo, aNombre: largo } : t)) });
    await abrirTransferencias();
    await autorizar("T-18");

    const texto = screen.getByText(new RegExp(`^Autorizaste la transferencia T-18 de ${largo}`));
    expect(texto).toHaveClass("wrap-anywhere");
    expect(deshacerDe("T-18")).toHaveClass("whitespace-nowrap");
  });

  it("muchas transferencias seguidas: cada una con su aviso y su decisión", async () => {
    const extra = Array.from({ length: 8 }, (_, i) => ({ numero: `T-${100 + i}` }));
    const { acciones: a } = montar(datosConTransferencias(extra));
    await abrirTransferencias();
    await autorizar("T-18");
    for (const e of extra) {
      await tocar(fila(e.numero));
      await autorizar(e.numero);
    }
    expect(screen.getAllByRole("button", { name: /^Deshacer/ })).toHaveLength(9);

    await avanzar(MS_DESHACER);
    expect(a.decidir).toHaveBeenCalledTimes(9);
    expect(new Set(a.decidir.mock.calls.map(([d]) => d.id)).size).toBe(9);
  }, 30_000);
});

describe("lo que no cambia", () => {
  it("un pedido se sigue decidiendo al toque, sin «Deshacer» (el de los pedidos es #93)", async () => {
    const { acciones: a } = montar();
    await tocar(within(screen.getByRole("region", { name: "Pedido #231" })).getByRole("button", { name: /^Autorizar/ }));

    expect(a.decidir).toHaveBeenCalledWith({ tipo: "pedido", id: "pedido-231", accion: "autorizar" });
    expect(screen.queryByRole("button", { name: /^Deshacer/ })).not.toBeInTheDocument();
  });
});
