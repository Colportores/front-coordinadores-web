import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TEXTO_ACCION_NO_DISPONIBLE } from "@/components/AccionNoDisponible";
import type { AccionesPedidos, DatosDePedidos, DecisionDeSolicitud, ResultadoDeAccion, SolicitudResuelta } from "@/datos/stock/pedidos";
import { crearDatosDePedidosSimulados } from "@/datos/stock/pedidos/simulado";
import { hayTrabajoPendiente, reiniciarTrabajoPendiente } from "@/shell/trabajo-pendiente";

import { PedidosVista } from "./PedidosVista";

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

/** Una respuesta que se resuelve a mano: sirve para probar lo que pasa mientras la acción está en camino. */
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

const pestana = (nombre: RegExp) => screen.getByRole("tab", { name: nombre });
const fila = (numero: string) => screen.getByRole("button", { name: new RegExp(`^${numero},`) });
const detalle = (titulo: string) => screen.getByRole("region", { name: titulo });
const lista = () => within(screen.getByRole("navigation", { name: "Ciudades" }));
const abrirCiudad = (nombre: RegExp) => userEvent.click(lista().getByRole("button", { name: nombre }));

afterEach(() => {
  reiniciarTrabajoPendiente();
});

describe("artboard 35A·01 · por autorizar, pedido que supera el límite", () => {
  it("abre «Por autorizar» en todas las ciudades con el primer pedido y el aviso del límite", () => {
    montar();

    expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
    expect(screen.getByText("5 por autorizar · 12 en la campaña")).toBeInTheDocument();
    expect(pestana(/^Por autorizar/)).toHaveAttribute("aria-selected", "true");
    expect(pestana(/^Por autorizar/)).toHaveTextContent("4");
    expect(fila("#231")).toHaveAttribute("aria-current", "true");

    const d = detalle("Pedido #231");
    expect(within(d).getByText("△ Supera el límite")).toBeInTheDocument();
    expect(within(d).getByRole("note")).toHaveTextContent(
      "Con este pedido la deuda queda en $U 58.140 y supera el límite de $U 50.000 por $U 8.140. Podés autorizarlo igual.",
    );
    expect(within(d).getByText("Deuda con este pedido").closest("div")).toHaveTextContent("límite $U 50.000");
    expect(within(d).getByText("COSTO CES")).toBeInTheDocument();
    expect(within(d).getByText("Al autorizar se suma $U 36.040 a la deuda de Emiliano.")).toBeInTheDocument();
    expect(within(d).getByRole("button", { name: /^Autorizar/ })).toBeInTheDocument();
    expect(within(d).getByRole("button", { name: /^Rechazar/ })).toBeInTheDocument();
  });

  it("muestra el límite y «Editar límite», que todavía no hace nada y lo explica", async () => {
    montar();

    expect(screen.getByText(/Límite de deuda por colportor:/)).toHaveTextContent("$U 50.000");
    const editar = screen.getByRole("button", { name: "Editar límite" });
    expect(editar).toHaveAttribute("aria-disabled", "true");
    expect(editar).toHaveAttribute("title", TEXTO_ACCION_NO_DISPONIBLE);
  });

  it("«Ver en Cuentas →» tampoco tiene destino todavía", () => {
    montar();
    expect(within(detalle("Pedido #231")).getByRole("button", { name: "Ver en Cuentas →" })).toHaveAttribute("aria-disabled", "true");
  });

  it("sin límite fijado lo dice y no hay aviso", () => {
    montar({ ...simulados(), limiteDeDeuda: null });
    expect(screen.getByText("Sin límite de deuda fijado")).toBeInTheDocument();
    expect(within(detalle("Pedido #231")).queryByRole("note")).not.toBeInTheDocument();
  });

  it("un límite en cero se muestra como cero y avisa (no es «sin límite»)", () => {
    montar({ ...simulados(), limiteDeDeuda: 0 });
    expect(screen.queryByText("Sin límite de deuda fijado")).not.toBeInTheDocument();
    expect(screen.getByText(/Límite de deuda por colportor:/)).toHaveTextContent("$U 0");
    expect(within(detalle("Pedido #231")).getByRole("note")).toHaveTextContent("supera el límite de $U 0");
  });

  it("elegir otro pedido de la lista abre su detalle", async () => {
    montar();
    await userEvent.click(fila("#229"));

    expect(fila("#229")).toHaveAttribute("aria-current", "true");
    expect(fila("#231")).not.toHaveAttribute("aria-current");
    expect(detalle("Pedido #229")).toBeInTheDocument();
    expect(within(detalle("Pedido #229")).getByText("CUENTA DE SOFÍA")).toBeInTheDocument();
  });
});

describe("artboard 35A·02 · Rivera, transferencia por autorizar", () => {
  it("la pestaña Transferencias de Rivera abre T-18 con el stock de los dos y la deuda que pasa", async () => {
    montar();
    await abrirCiudad(/^Rivera/);
    await userEvent.click(pestana(/^Transferencias/));

    expect(screen.getByRole("heading", { level: 2, name: "Rivera" })).toBeInTheDocument();
    const d = detalle("Transferencia T-18");
    expect(within(d).getByText("LO QUE SE TRANSFIERE")).toBeInTheDocument();
    expect(within(d).getByText("STOCK DE LOS DOS")).toBeInTheDocument();
    expect(within(d).getByText("Valentina tiene").closest("div")).toHaveTextContent("le quedan 1");
    expect(within(d).getByText("Lucía debe entregar").closest("div")).toHaveTextContent("tiene 0");
    expect(within(d).getByText("Deuda que pasa a Lucía").closest("div")).toHaveTextContent("$U 2.900");
    expect(within(d).getByText("Al autorizar, la deuda de $U 2.900 pasa de Valentina a Lucía.")).toBeInTheDocument();
  });

  it("la transferencia ya autorizada no tiene botones y dice cuándo", async () => {
    montar();
    await userEvent.click(pestana(/^Transferencias/));
    await userEvent.click(fila("T-17"));

    const d = detalle("Transferencia T-17");
    expect(within(d).queryByRole("button", { name: /^Autorizar/ })).not.toBeInTheDocument();
    expect(within(d).getByText("Autorizada el 14/10.")).toBeInTheDocument();
  });
});

describe("artboard 35A·03 · despachados, seguimiento", () => {
  it("abre #219 con los pasos y la nota de que la coordinadora no tiene nada que hacer", async () => {
    montar();
    await userEvent.click(pestana(/^Despachados/));

    expect(fila("#219")).toHaveAttribute("aria-current", "true");
    const d = detalle("Pedido #219");
    expect(within(d).queryByRole("button", { name: /^Autorizar/ })).not.toBeInTheDocument();
    expect(within(d).getByText(/La casa editora lo despachó el 12\/10\. Natalia lo marca como recibido/)).toBeInTheDocument();
    const pasos = within(within(d).getByRole("list", { name: "Estado del pedido" })).getAllByRole("listitem");
    expect(pasos.map((p) => p.textContent)).toEqual([
      "✓Por autorizar (hecho)",
      "✓Autorizado (hecho)",
      "Despachado (estado actual)",
      "Recibido (falta)",
    ]);
    expect(pasos[2]).toHaveAttribute("aria-current", "step");
  });
});

describe("pestañas, estados y casos vacíos", () => {
  it("las siete pestañas cuentan lo del canvas", () => {
    montar();
    const cuentas = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(cuentas).toEqual(["Todos10", "Por autorizar4", "Autorizados1", "Despachados2", "Recibidos2", "Rechazados1", "Transferencias2"]);
  });

  it.each([
    [/^Todos/, "#231", "Pedido #231"],
    [/^Autorizados/, "#224", "Pedido #224"],
    [/^Recibidos/, "#214", "Pedido #214"],
    [/^Rechazados/, "#205", "Pedido #205"],
  ])("la pestaña %s abre %s", async (nombre, numero, titulo) => {
    montar();
    await userEvent.click(pestana(nombre));

    expect(fila(numero)).toHaveAttribute("aria-current", "true");
    expect(detalle(titulo)).toBeInTheDocument();
  });

  it("un rechazado muestra el motivo y no deja decidir", async () => {
    montar();
    await userEvent.click(pestana(/^Rechazados/));

    const d = detalle("Pedido #205");
    expect(within(d).getByText(/Rechazado el 30\/09\. Motivo: “Tenía un depósito pendiente de validar/)).toBeInTheDocument();
    expect(within(d).queryByRole("button", { name: /^Autorizar/ })).not.toBeInTheDocument();
  });

  it("un autorizado ya lleva el pedido en la deuda: no se cuenta dos veces", async () => {
    montar();
    await userEvent.click(pestana(/^Autorizados/));

    const d = detalle("Pedido #224");
    expect(within(d).queryByText("Deuda con este pedido")).not.toBeInTheDocument();
    expect(within(d).getByText("Deuda actual").closest("div")).toHaveTextContent("incluye este pedido");
  });

  it("las flechas, Inicio y Fin mueven entre pestañas", async () => {
    montar();
    pestana(/^Por autorizar/).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(pestana(/^Autorizados/)).toHaveAttribute("aria-selected", "true");
    expect(pestana(/^Autorizados/)).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(pestana(/^Transferencias/)).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowRight}");
    expect(pestana(/^Todos/)).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{Home}{ArrowLeft}");
    expect(pestana(/^Transferencias/)).toHaveAttribute("aria-selected", "true");
  });

  it("una pestaña sin nada dice qué pasa y deja el detalle con una pista", async () => {
    montar();
    await abrirCiudad(/^Bella Unión/);
    await userEvent.click(pestana(/^Transferencias/));

    expect(screen.getByRole("status")).toHaveTextContent("No hay transferencias en Bella Unión.");
    expect(screen.getByText(/Acá vas a ver el detalle del pedido o de la transferencia/)).toBeInTheDocument();
  });

  it("una campaña sin pedidos lo dice en vez de mostrar una bandeja vacía", () => {
    montar({ ...simulados(), pedidos: [], transferencias: [] });

    expect(screen.getByRole("status")).toHaveTextContent("Todavía no hay pedidos ni transferencias en esta campaña.");
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("al cambiar de ciudad se abre el primero de esa ciudad", async () => {
    montar();
    await userEvent.click(fila("#229"));
    await abrirCiudad(/^Rivera/);

    expect(fila("#231")).toHaveAttribute("aria-current", "true");
    expect(screen.queryByRole("button", { name: /^#229,/ })).not.toBeInTheDocument();
  });

  it("con la lista de ciudades contraída queda el riel y sigue eligiendo", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "Contraer ciudades" }));
    const riel = within(screen.getByRole("navigation", { name: "Ciudades" }));
    await userEvent.click(riel.getByRole("button", { name: "Bella Unión" }));

    expect(screen.getByRole("heading", { level: 2, name: "Bella Unión" })).toBeInTheDocument();
    expect(fila("#228")).toBeInTheDocument();
  });

  it("una lista larga (300 pedidos) se muestra entera y se puede recorrer", () => {
    const base = simulados();
    const modelo = base.pedidos[0];
    const muchos = Array.from({ length: 300 }, (_, i) => ({ ...modelo, id: `p${i}`, numero: `#${1000 + i}`, enviadoEn: new Date(AHORA.getTime() - i * 60_000).toISOString() }));
    montar({ ...base, pedidos: muchos });

    expect(screen.getByRole("list", { name: "Pedidos de Todas las ciudades" }).children).toHaveLength(300);
    expect(pestana(/^Por autorizar/)).toHaveTextContent("300");
  });

  it("nombres y productos larguísimos no rompen la vista", () => {
    const base = simulados();
    const largo = "Nombre larguísimo ".repeat(20).trim();
    const pedido = { ...base.pedidos[0], colportorNombre: largo, lineas: [{ nombre: largo, cantidad: 1, costoUnitario: 100 }] };
    montar({ ...base, pedidos: [pedido, ...base.pedidos.slice(1)] });

    expect(screen.getByRole("heading", { level: 3, name: "Pedido #231" })).toBeInTheDocument();
    expect(fila("#231")).toHaveAccessibleName(expect.stringContaining(largo));
  });

  it("al volver a entrar la vista arranca de nuevo con lo que traen los datos", () => {
    const primera = montar();
    primera.unmount();
    montar();

    expect(pestana(/^Por autorizar/)).toHaveAttribute("aria-selected", "true");
    expect(fila("#231")).toHaveAttribute("aria-current", "true");
  });
});

describe("autorizar", () => {
  it("manda la decisión, avisa lo que pasó con la deuda y pasa al siguiente con el foco en su detalle", async () => {
    const { acciones: a } = montar();
    await userEvent.click(within(detalle("Pedido #231")).getByRole("button", { name: /^Autorizar/ }));

    expect(a.decidir).toHaveBeenCalledExactlyOnceWith({ tipo: "pedido", id: "pedido-231", accion: "autorizar" });
    expect(await screen.findByText("✓ Pedido #231 de Emiliano Sosa autorizado: se sumaron $U 36.040 a su deuda.")).toBeInTheDocument();
    // Salió de «Por autorizar»: la lista y los conteos se corrigen y se abre el que sigue.
    expect(screen.queryByRole("button", { name: /^#231,/ })).not.toBeInTheDocument();
    expect(pestana(/^Por autorizar/)).toHaveTextContent("3");
    expect(pestana(/^Autorizados/)).toHaveTextContent("2");
    expect(screen.getByText("4 por autorizar · 12 en la campaña")).toBeInTheDocument();
    expect(fila("#230")).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("heading", { level: 3, name: "Pedido #230" })).toHaveFocus();
  });

  it("desde «Todos» el pedido se queda abierto, ahora autorizado y sin botones", async () => {
    montar();
    await userEvent.click(pestana(/^Todos/));
    await userEvent.click(within(detalle("Pedido #231")).getByRole("button", { name: /^Autorizar/ }));

    await screen.findByText(/autorizado: se sumaron/);
    const d = detalle("Pedido #231");
    expect(within(within(d).getByRole("list", { name: "Estado del pedido" })).getByText(/^Autorizado/)).toHaveTextContent("Autorizado (estado actual)");
    expect(within(d).queryByRole("button", { name: /^Autorizar/ })).not.toBeInTheDocument();
    expect(within(d).getByRole("heading", { level: 3 })).toHaveFocus();
  });

  it("al autorizar, la deuda actual del detalle ya lleva el pedido (22.100 + 36.040)", async () => {
    montar();
    await userEvent.click(pestana(/^Todos/));
    await userEvent.click(within(detalle("Pedido #231")).getByRole("button", { name: /^Autorizar/ }));

    await screen.findByText(/autorizado: se sumaron/);
    const fila = within(detalle("Pedido #231")).getByText("Deuda actual").closest("div")!;
    expect(fila).toHaveTextContent("$U 58.140");
    expect(fila).toHaveTextContent("incluye este pedido");
  });

  it("autoriza una transferencia", async () => {
    const { acciones: a } = montar();
    await userEvent.click(pestana(/^Transferencias/));
    await userEvent.click(within(detalle("Transferencia T-18")).getByRole("button", { name: /^Autorizar/ }));

    expect(await screen.findByText("✓ Transferencia T-18 de Valentina Silva autorizada: la deuda de $U 2.900 pasó a Lucía.")).toBeInTheDocument();
    expect(a.decidir).toHaveBeenCalledWith({ tipo: "transferencia", id: "transferencia-18", accion: "autorizar" });
    expect(within(within(detalle("Transferencia T-18")).getByRole("list", { name: "Estado de la transferencia" })).getByText(/^Autorizada/)).toHaveTextContent("Autorizada (hecho)");
  });

  it("el último de la lista pasa al anterior; si no queda ninguno, el foco va a la pestaña", async () => {
    const base = simulados();
    montar({ ...base, pedidos: base.pedidos.filter((p) => p.numero === "#231"), transferencias: [] });
    await userEvent.click(within(detalle("Pedido #231")).getByRole("button", { name: /^Autorizar/ }));

    await screen.findByText(/autorizado: se sumaron/);
    expect(screen.getByText("No hay pedidos por autorizar en la campaña.")).toBeInTheDocument();
    expect(pestana(/^Por autorizar/)).toHaveFocus();
  });
});

describe("«Por autorizar» vacía con transferencias por autorizar (decisión de la revisión, P1 §2)", () => {
  it("dice cuántas transferencias hay y el botón abre la pestaña Transferencias con el foco", async () => {
    const base = simulados();
    montar({ ...base, pedidos: base.pedidos.filter((p) => p.estado !== "POR_AUTORIZAR") });

    expect(screen.getByText("No hay pedidos por autorizar en la campaña. Tenés 1 transferencia por autorizar.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ver transferencias" }));

    expect(pestana(/^Transferencias/)).toHaveAttribute("aria-selected", "true");
    expect(pestana(/^Transferencias/)).toHaveFocus();
    expect(screen.getByRole("heading", { level: 3, name: "Transferencia T-18" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver transferencias" })).not.toBeInTheDocument();
  });

  it("sin transferencias por autorizar el vacío es el de siempre y no ofrece nada", () => {
    const base = simulados();
    montar({ ...base, pedidos: base.pedidos.filter((p) => p.estado !== "POR_AUTORIZAR"), transferencias: [] });

    expect(screen.getByText("No hay pedidos por autorizar en la campaña.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver transferencias" })).not.toBeInTheDocument();
  });

  it("al autorizar el último pedido queda el aviso de la transferencia que sigue", async () => {
    const base = simulados();
    montar({ ...base, pedidos: base.pedidos.filter((p) => p.numero === "#231") });
    await userEvent.click(within(detalle("Pedido #231")).getByRole("button", { name: /^Autorizar/ }));

    await screen.findByText(/autorizado: se sumaron/);
    expect(screen.getByText(/Tenés 1 transferencia por autorizar/)).toBeInTheDocument();
  });
});

describe("doble toque, falla y acciones seguidas", () => {
  it("doble toque en Autorizar: sale una sola vez y el botón avisa que está guardando", async () => {
    const espera = diferida();
    const a = acciones(() => espera.promesa);
    montar(simulados(), a);
    const boton = within(detalle("Pedido #231")).getByRole("button", { name: /^Autorizar/ });

    await userEvent.dblClick(boton);

    expect(a.decidir).toHaveBeenCalledTimes(1);
    expect(boton).toHaveAttribute("aria-disabled", "true");
    expect(boton).toHaveTextContent("Guardando…");
    expect(within(detalle("Pedido #231")).getByRole("button", { name: /^Rechazar/ })).toHaveAttribute("aria-disabled", "true");

    await act(async () => espera.resolver(ok({ tipo: "pedido", id: "pedido-231", accion: "autorizar" })));
    await screen.findByText(/autorizado: se sumaron/);
    expect(a.decidir).toHaveBeenCalledTimes(1);
  });

  it("mientras está en camino cuenta como trabajo pendiente (cerrar la pestaña avisa) y al terminar deja de contar", async () => {
    const espera = diferida();
    montar(simulados(), acciones(() => espera.promesa));
    await userEvent.click(within(detalle("Pedido #231")).getByRole("button", { name: /^Autorizar/ }));

    expect(hayTrabajoPendiente()).toBe(true);
    await act(async () => espera.resolver(ok({ tipo: "pedido", id: "pedido-231", accion: "autorizar" })));
    await screen.findByText(/autorizado: se sumaron/);
    await waitFor(() => expect(hayTrabajoPendiente()).toBe(false));
  });

  it("si falla por falta de conexión avisa qué hacer, el botón vuelve a poder usarse y el pedido sigue por autorizar", async () => {
    const respuestas: Resultado[] = [{ ok: false, causa: "sin-conexion" }];
    const a = acciones((d) => respuestas.shift() ?? ok(d));
    montar(simulados(), a);
    const boton = () => within(detalle("Pedido #231")).getByRole("button", { name: /^Autorizar/ });

    await userEvent.click(boton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Necesitás conexión para autorizar el pedido #231. Revisá la conexión y probá de nuevo.");
    expect(boton()).toHaveAttribute("aria-disabled", "false");
    expect(boton()).toHaveTextContent("Autorizar");
    expect(pestana(/^Por autorizar/)).toHaveTextContent("4");

    await userEvent.click(boton());
    await screen.findByText(/autorizado: se sumaron/);
    expect(a.decidir).toHaveBeenCalledTimes(2);
    expect(pestana(/^Por autorizar/)).toHaveTextContent("3");
  });

  it("si la acción tira una excepción también cuenta como falla de conexión y no deja nada trabado", async () => {
    const a = acciones(() => {
      throw new Error("se cayó");
    });
    montar(simulados(), a);
    await userEvent.click(within(detalle("Pedido #231")).getByRole("button", { name: /^Autorizar/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Necesitás conexión para autorizar el pedido #231");
    expect(within(detalle("Pedido #231")).getByRole("button", { name: /^Autorizar/ })).toHaveAttribute("aria-disabled", "false");
    await waitFor(() => expect(hayTrabajoPendiente()).toBe(false));
  });

  it("si el servidor lo rechaza muestra su texto (por ejemplo, que otro ya lo resolvió)", async () => {
    montar(simulados(), acciones(() => ({ ok: false, causa: "rechazado", mensaje: "Este pedido ya no está por autorizar." })));
    await userEvent.click(within(detalle("Pedido #231")).getByRole("button", { name: /^Autorizar/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Este pedido ya no está por autorizar.");
  });

  it("un aviso se puede cerrar", async () => {
    montar(simulados(), acciones(() => ({ ok: false, causa: "sin-conexion" })));
    await userEvent.click(within(detalle("Pedido #231")).getByRole("button", { name: /^Autorizar/ }));
    await screen.findByRole("alert");

    await userEvent.click(screen.getByRole("button", { name: "Cerrar el aviso" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("dos pedidos seguidos antes de que termine el primero: el segundo espera su turno y no se pierde ninguno", async () => {
    const primera = diferida();
    const orden: string[] = [];
    const a = acciones((d) => {
      orden.push(d.id);
      return d.id === "pedido-231" ? primera.promesa : ok(d);
    });
    montar(simulados(), a);

    await userEvent.click(within(detalle("Pedido #231")).getByRole("button", { name: /^Autorizar/ }));
    await userEvent.click(fila("#230"));
    await userEvent.click(within(detalle("Pedido #230")).getByRole("button", { name: /^Autorizar/ }));

    // El primero sigue en camino: el segundo está anotado pero todavía no salió.
    expect(orden).toEqual(["pedido-231"]);
    expect(within(detalle("Pedido #230")).getByRole("button", { name: /^Autorizar/ })).toHaveAttribute("aria-disabled", "true");

    await act(async () => primera.resolver(ok({ tipo: "pedido", id: "pedido-231", accion: "autorizar" })));

    await screen.findByText(/Pedido #230 de Lucía Fernández autorizado/);
    expect(orden).toEqual(["pedido-231", "pedido-230"]);
    expect(screen.getByText(/Pedido #231 de Emiliano Sosa autorizado/)).toBeInTheDocument();
    expect(pestana(/^Por autorizar/)).toHaveTextContent("2");
    expect(pestana(/^Autorizados/)).toHaveTextContent("3");
  });

  it("si el primero falla, el segundo sale igual y el error queda a la vista", async () => {
    const a = acciones((d) => (d.id === "pedido-231" ? { ok: false, causa: "sin-conexion" } : ok(d)));
    montar(simulados(), a);

    await userEvent.click(within(detalle("Pedido #231")).getByRole("button", { name: /^Autorizar/ }));
    await userEvent.click(fila("#230"));
    await userEvent.click(within(detalle("Pedido #230")).getByRole("button", { name: /^Autorizar/ }));

    await screen.findByText(/Pedido #230 de Lucía Fernández autorizado/);
    expect(screen.getByRole("alert")).toHaveTextContent("autorizar el pedido #231");
    expect(pestana(/^Por autorizar/)).toHaveTextContent("3");
  });

  it("si mientras tanto se pasó a mirar otro pedido, no se le roba el foco ni se le cambia la selección", async () => {
    const espera = diferida();
    montar(simulados(), acciones(() => espera.promesa));
    await userEvent.click(within(detalle("Pedido #231")).getByRole("button", { name: /^Autorizar/ }));
    await userEvent.click(fila("#229"));

    await act(async () => espera.resolver(ok({ tipo: "pedido", id: "pedido-231", accion: "autorizar" })));

    await screen.findByText(/Pedido #231 de Emiliano Sosa autorizado/);
    expect(fila("#229")).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("heading", { level: 3, name: "Pedido #229" })).not.toHaveFocus();
  });
});

describe("rechazar", () => {
  const abrir = async (titulo = "Pedido #231") => {
    await userEvent.click(within(detalle(titulo)).getByRole("button", { name: /^Rechazar/ }));
    return screen.getByRole("textbox", { name: /MOTIVO DEL RECHAZO/ });
  };

  it("el primer «Rechazar» no rechaza: abre el motivo en el mismo lugar con el foco en el campo", async () => {
    const { acciones: a } = montar();
    const campo = await abrir();

    expect(a.decidir).not.toHaveBeenCalled();
    expect(campo).toHaveFocus();
    expect(campo).toHaveAttribute("placeholder", "Contale al colportor por qué no se autoriza el pedido");
    expect(screen.getByText("MOTIVO DEL RECHAZO · OBLIGATORIO")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar rechazo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Autorizar/ })).not.toBeInTheDocument();
  });

  it("con el motivo vacío o en blanco no rechaza: avisa, marca el campo y lo enfoca", async () => {
    const { acciones: a } = montar();
    const campo = await abrir();
    await userEvent.type(campo, "   ");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));

    expect(a.decidir).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Escribí el motivo para rechazar el pedido.");
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(campo).toHaveFocus();

    await userEvent.type(campo, "Excede la capacidad de pago");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("confirma con el motivo sin espacios de más, avisa que el colportor lo recibe y pasa al siguiente", async () => {
    const { acciones: a } = montar();
    const campo = await abrir();
    await userEvent.type(campo, "  Excede la capacidad de pago actual ");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));

    expect(await screen.findByText("✓ Pedido #231 de Emiliano Sosa rechazado: el colportor recibe el motivo.")).toBeInTheDocument();
    expect(a.decidir).toHaveBeenCalledExactlyOnceWith({ tipo: "pedido", id: "pedido-231", accion: "rechazar", motivo: "Excede la capacidad de pago actual" });
    expect(fila("#230")).toHaveAttribute("aria-current", "true");
    expect(pestana(/^Rechazados/)).toHaveTextContent("2");

    await userEvent.click(pestana(/^Rechazados/));
    await userEvent.click(fila("#231"));
    expect(within(detalle("Pedido #231")).getByText(/Motivo: “Excede la capacidad de pago actual”/)).toBeInTheDocument();
  });

  it("el motivo no pasa del tope", async () => {
    montar();
    const campo = await abrir();
    expect(campo).toHaveAttribute("maxlength", "500");
  });

  it("«Cancelar» cierra el motivo, vuelve a «Rechazar» con el foco y descarta lo escrito", async () => {
    montar();
    const campo = await abrir();
    await userEvent.type(campo, "algo");
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(detalle("Pedido #231")).getByRole("button", { name: /^Rechazar/ })).toHaveFocus();
    expect(await abrir()).toHaveValue("");
  });

  it("Esc en el campo hace lo mismo que cancelar", async () => {
    montar();
    await abrir();
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(detalle("Pedido #231")).getByRole("button", { name: /^Rechazar/ })).toHaveFocus();
  });

  it("si falla a mitad del rechazo, el motivo escrito se conserva y se puede reintentar", async () => {
    const respuestas: Resultado[] = [{ ok: false, causa: "sin-conexion" }];
    const a = acciones((d) => respuestas.shift() ?? ok(d));
    montar(simulados(), a);
    const campo = await abrir();
    await userEvent.type(campo, "No corresponde");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Necesitás conexión para rechazar el pedido #231");
    expect(campo).toHaveValue("No corresponde");
    const confirmar = screen.getByRole("button", { name: "Confirmar rechazo" });
    expect(confirmar).toHaveAttribute("aria-disabled", "false");

    await userEvent.click(confirmar);
    await screen.findByText(/rechazado: el colportor recibe el motivo/);
    expect(a.decidir).toHaveBeenCalledTimes(2);
  });

  it("doble toque en «Confirmar rechazo»: sale una sola vez", async () => {
    const espera = diferida();
    const a = acciones(() => espera.promesa);
    montar(simulados(), a);
    const campo = await abrir();
    await userEvent.type(campo, "No corresponde");
    await userEvent.dblClick(screen.getByRole("button", { name: "Confirmar rechazo" }));

    expect(a.decidir).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Guardando…" })).toHaveAttribute("aria-disabled", "true");
    await act(async () => espera.resolver(ok({ tipo: "pedido", id: "pedido-231", accion: "rechazar", motivo: "No corresponde" })));
    await screen.findByText(/rechazado: el colportor recibe el motivo/);
  });

  it("el borrador es de cada pedido: al ir y volver se conserva", async () => {
    montar();
    const campo = await abrir();
    await userEvent.type(campo, "borrador del uno");
    await userEvent.click(fila("#230"));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    await userEvent.click(fila("#231"));
    expect(screen.getByRole("textbox", { name: /MOTIVO DEL RECHAZO/ })).toHaveValue("borrador del uno");
  });

  it("rechaza una transferencia con sus textos", async () => {
    const { acciones: a } = montar();
    await userEvent.click(pestana(/^Transferencias/));
    const campo = await abrir("Transferencia T-18");
    expect(campo).toHaveAttribute("placeholder", "Contale al colportor por qué no se autoriza la transferencia");

    await userEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Escribí el motivo para rechazar la transferencia.");

    await userEvent.type(campo, "Sin stock");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));
    expect(await screen.findByText("✓ Transferencia T-18 de Valentina Silva rechazada: el colportor recibe el motivo.")).toBeInTheDocument();
    expect(a.decidir).toHaveBeenCalledWith({ tipo: "transferencia", id: "transferencia-18", accion: "rechazar", motivo: "Sin stock" });
    expect(within(within(detalle("Transferencia T-18")).getByRole("list", { name: "Estado de la transferencia" })).getByText(/^Rechazada/)).toHaveTextContent("Rechazada (hecho)");
  });
});
