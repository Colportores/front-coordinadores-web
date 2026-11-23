import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AccionesDeStock, DatosDeStock, ExistenciaDeStock } from "@/datos/stock/contrato";
import { crearAccionesSimuladas, crearDatosDeStockSimulados } from "@/datos/stock/simulado";

import { StockVista } from "./StockVista";

// «Pedir transferencia de materiales» (HU-STK-005, antes «Pedir prestado»; 42B·01 y decisiones del 28/10): el botón arriba, el
// formulario (resuelto por el implementador, ver pendientes), el aviso de lo armado y los casos límite de la escritura.

const ex = (productoId: string, tiene: number): ExistenciaDeStock => ({ productoId, tiene, porEntregar: 0, entregados: 0, devueltos: 0, porCobrar: 0 });
const chico = (parcial: Partial<DatosDeStock> = {}): DatosDeStock => ({
  campaniaId: "c",
  ciudades: [{ id: "riv", nombre: "Rivera", departamento: "Rivera" }],
  productos: [
    { id: "l1", nombre: "Libro uno", tipo: "LIBRO", nota: null },
    { id: "l2", nombre: "Libro dos", tipo: "LIBRO", nota: null },
  ],
  colportores: [
    { id: "ana", nombre: "Ana", ciudadId: "riv", ultimoDatoAt: null, existencias: [ex("l1", 5), ex("l2", 0)] },
    { id: "beto", nombre: "Beto", ciudadId: "riv", ultimoDatoAt: null, existencias: [ex("l1", 1)] },
    { id: "cris", nombre: "Cris", ciudadId: null, ultimoDatoAt: null, existencias: [] },
  ],
  ...parcial,
});

const acciones = (pedirTransferencia: AccionesDeStock["pedirTransferencia"]): AccionesDeStock => ({ pedirTransferencia });
const boton = () => screen.getByRole("button", { name: "Pedir transferencia de materiales" });
const dialogo = () => screen.getByRole("dialog", { name: "Pedir transferencia de materiales" });
const enDialogo = () => within(dialogo());
const abrir = () => userEvent.click(boton());
const pedir = () => userEvent.click(enDialogo().getByRole("button", { name: "Pedir transferencia" }));

async function llenar(origen = "ana", destino = "beto", producto = "l1", cantidad = "2") {
  await userEvent.selectOptions(enDialogo().getByLabelText("QUIÉN DA LOS LIBROS"), origen);
  await userEvent.selectOptions(enDialogo().getByLabelText("QUIÉN LOS RECIBE"), destino);
  await userEvent.selectOptions(enDialogo().getByLabelText("Producto 1"), producto);
  if (cantidad !== "") await userEvent.type(enDialogo().getByLabelText("Cantidad del producto 1"), cantidad);
}

const ok = (numero = "T-19") => vi.fn<AccionesDeStock["pedirTransferencia"]>(async () => ({ ok: true as const, valor: { id: "t", numero } }));

afterEach(() => vi.restoreAllMocks());

describe("el botón «Pedir transferencia de materiales»", () => {
  it("está arriba, con el nombre del 28/10 (nunca «Pedir prestado»), y abre el formulario", async () => {
    render(<StockVista datos={chico()} acciones={acciones(ok())} />);
    expect(screen.queryByText(/prestado/i)).toBeNull();
    await abrir();
    expect(dialogo()).toBeInTheDocument();
    expect(enDialogo().getByRole("heading", { name: "Pedir transferencia de materiales" })).toBeInTheDocument();
    expect(enDialogo().getByText(/hasta que la autorices no se mueve ni el stock ni la deuda/)).toBeInTheDocument();
  });

  it("sin `acciones` la vista es de lectura: no hay botón", () => {
    render(<StockVista datos={chico()} />);
    expect(screen.queryByRole("button", { name: "Pedir transferencia de materiales" })).toBeNull();
  });

  it("el foco arranca en el primer campo y, al cancelar, vuelve al botón", async () => {
    render(<StockVista datos={chico()} acciones={acciones(ok())} />);
    await abrir();
    expect(enDialogo().getByLabelText("QUIÉN DA LOS LIBROS")).toHaveFocus();
    await userEvent.click(enDialogo().getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(boton()).toHaveFocus();
  });

  it("Esc cancela y Tab no sale del diálogo", async () => {
    render(<StockVista datos={chico()} acciones={acciones(ok())} />);
    await abrir();
    await userEvent.tab({ shift: true });
    expect(enDialogo().getByRole("button", { name: "Pedir transferencia" })).toHaveFocus();
    await userEvent.tab();
    expect(enDialogo().getByLabelText("QUIÉN DA LOS LIBROS")).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("al cancelar y volver a abrir, el formulario está vacío", async () => {
    render(<StockVista datos={chico()} acciones={acciones(ok())} />);
    await abrir();
    await llenar();
    await userEvent.click(enDialogo().getByRole("button", { name: "Cancelar" }));
    await abrir();
    expect(enDialogo().getByLabelText("QUIÉN DA LOS LIBROS")).toHaveValue("");
    expect(enDialogo().getByLabelText("Cantidad del producto 1")).toHaveValue("");
  });
});

describe("el formulario valida al pedir y cada error dice qué hacer", () => {
  it("vacío: dice que falta quién da, quién recibe y un producto, y manda el foco al primero", async () => {
    const pedirTransferencia = ok();
    render(<StockVista datos={chico()} acciones={acciones(pedirTransferencia)} />);
    await abrir();
    await pedir();
    expect(enDialogo().getByText("Elegí quién da los libros.")).toBeInTheDocument();
    expect(enDialogo().getByText("Elegí quién los recibe.")).toBeInTheDocument();
    expect(enDialogo().getByText("Sumá al menos un producto con su cantidad.")).toBeInTheDocument();
    expect(enDialogo().getByLabelText("QUIÉN DA LOS LIBROS")).toHaveFocus();
    expect(enDialogo().getByLabelText("QUIÉN DA LOS LIBROS")).toBeInvalid();
    expect(pedirTransferencia).not.toHaveBeenCalled();
  });

  it("quien da no se ofrece como quien recibe; si se lo elige después, el destino se vuelve a pedir", async () => {
    render(<StockVista datos={chico()} acciones={acciones(ok())} />);
    await abrir();
    await userEvent.selectOptions(enDialogo().getByLabelText("QUIÉN DA LOS LIBROS"), "ana");
    expect(within(enDialogo().getByLabelText("QUIÉN LOS RECIBE")).queryByRole("option", { name: /^Ana/ })).toBeNull();
    await userEvent.selectOptions(enDialogo().getByLabelText("QUIÉN LOS RECIBE"), "beto");
    await userEvent.selectOptions(enDialogo().getByLabelText("QUIÉN DA LOS LIBROS"), "beto");
    expect(enDialogo().getByLabelText("QUIÉN LOS RECIBE")).toHaveValue("");
  });

  it.each(["", "0", "-2", "1.5", "1,5", "abc", "2x", " "])("la cantidad %j no sirve: pide un entero mayor que cero y no manda nada", async (cantidad) => {
    const pedirTransferencia = ok();
    render(<StockVista datos={chico()} acciones={acciones(pedirTransferencia)} />);
    await abrir();
    await llenar("ana", "beto", "l1", cantidad);
    await pedir();
    expect(await enDialogo().findByText("Poné una cantidad entera mayor que cero.")).toBeInTheDocument();
    expect(pedirTransferencia).not.toHaveBeenCalled();
  });

  it("un producto sin cantidad o una cantidad sin producto también avisan, en su fila", async () => {
    render(<StockVista datos={chico()} acciones={acciones(ok())} />);
    await abrir();
    await userEvent.selectOptions(enDialogo().getByLabelText("QUIÉN DA LOS LIBROS"), "ana");
    await userEvent.selectOptions(enDialogo().getByLabelText("QUIÉN LOS RECIBE"), "beto");
    await userEvent.type(enDialogo().getByLabelText("Cantidad del producto 1"), "3");
    await pedir();
    expect(enDialogo().getByText("Elegí el producto.")).toBeInTheDocument();
    expect(enDialogo().getByLabelText("Producto 1")).toHaveFocus();
  });

  it("un número descomunal avisa del máximo", async () => {
    render(<StockVista datos={chico()} acciones={acciones(ok())} />);
    await abrir();
    await llenar("ana", "beto", "l1", "100000");
    await pedir();
    expect(enDialogo().getByText("Es mucho: el máximo por producto es 99.999.")).toBeInTheDocument();
  });

  it("un producto ya elegido no se ofrece en la otra fila (no se repite)", async () => {
    render(<StockVista datos={chico()} acciones={acciones(ok())} />);
    await abrir();
    await userEvent.selectOptions(enDialogo().getByLabelText("Producto 1"), "l1");
    await userEvent.click(enDialogo().getByRole("button", { name: "Sumar otro producto" }));
    expect(enDialogo().getByLabelText("Producto 2")).toHaveFocus();
    expect(within(enDialogo().getByLabelText("Producto 2")).queryByRole("option", { name: "Libro uno" })).toBeNull();
    expect(within(enDialogo().getByLabelText("Producto 2")).getByRole("option", { name: "Libro dos" })).toBeInTheDocument();
    await userEvent.selectOptions(enDialogo().getByLabelText("Producto 2"), "l2");
    expect(enDialogo().getByRole("button", { name: "Sumar otro producto" })).toBeDisabled();
  });

  it("se puede sacar una fila (con más de una) y el foco va a «Sumar otro producto»", async () => {
    render(<StockVista datos={chico()} acciones={acciones(ok())} />);
    await abrir();
    expect(enDialogo().queryByRole("button", { name: /^Sacar/ })).toBeNull();
    await userEvent.click(enDialogo().getByRole("button", { name: "Sumar otro producto" }));
    await userEvent.click(enDialogo().getByRole("button", { name: "Sacar el producto 2" }));
    expect(enDialogo().queryByLabelText("Producto 2")).toBeNull();
    expect(enDialogo().getByRole("button", { name: "Sumar otro producto" })).toHaveFocus();
  });

  it("dice cuánto tiene quien da y, si se pide más, avisa que se puede pedir igual", async () => {
    const pedirTransferencia = ok();
    render(<StockVista datos={chico()} acciones={acciones(pedirTransferencia)} />);
    await abrir();
    await llenar("ana", "beto", "l1", "9");
    expect(enDialogo().getByText(/Ana tiene 5, menos de lo que pedís\. Podés pedirla igual/)).toBeInTheDocument();
    await pedir();
    expect(pedirTransferencia).toHaveBeenCalledTimes(1);
  });

  it("con menos de dos colportores o sin productos lo dice y no deja pedir", async () => {
    render(<StockVista datos={chico({ colportores: [chico().colportores[0]] })} acciones={acciones(ok())} />);
    await abrir();
    expect(enDialogo().getByText(/hacen falta al menos dos colportores/)).toBeInTheDocument();
    expect(enDialogo().queryByRole("button", { name: "Pedir transferencia" })).toBeNull();
    expect(enDialogo().getByRole("button", { name: "Cancelar" })).toHaveFocus();
  });
});

describe("pedirla: éxito, falla y casos límite", () => {
  it("manda lo elegido con cantidades enteras, cierra, avisa con el número y lleva a «Ver transferencias»", async () => {
    const pedirTransferencia = ok("T-19");
    render(<StockVista datos={chico()} acciones={acciones(pedirTransferencia)} />);
    await abrir();
    await llenar("ana", "beto", "l1", " 02 ");
    await userEvent.click(enDialogo().getByRole("button", { name: "Sumar otro producto" }));
    await userEvent.selectOptions(enDialogo().getByLabelText("Producto 2"), "l2");
    await userEvent.type(enDialogo().getByLabelText("Cantidad del producto 2"), "1");
    await pedir();

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(pedirTransferencia).toHaveBeenCalledWith({
      origenId: "ana",
      destinoId: "beto",
      lineas: [
        { productoId: "l1", cantidad: 2 },
        { productoId: "l2", cantidad: 1 },
      ],
    });
    const aviso = screen.getByText(/Armaste la transferencia T-19: Ana le da 3 unidades a Beto\. Queda por autorizar en Pedidos y transferencias\./);
    expect(within(aviso).getByRole("link", { name: "Ver transferencias →" })).toHaveAttribute("href", "/stock/pedidos?pestana=transferencias");
    expect(boton()).toHaveFocus();
  });

  it("una sola unidad se dice en singular y el aviso se puede cerrar", async () => {
    render(<StockVista datos={chico()} acciones={acciones(ok("T-20"))} />);
    await abrir();
    await llenar("ana", "beto", "l1", "1");
    await pedir();
    expect(await screen.findByText(/le da 1 unidad a Beto/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cerrar el aviso" }));
    expect(screen.queryByText(/Armaste la transferencia/)).toBeNull();
  });

  it("doble toque: la segunda pulsación mientras está en camino no manda otra", async () => {
    let terminar: (r: Awaited<ReturnType<AccionesDeStock["pedirTransferencia"]>>) => void = () => {};
    const pedirTransferencia = vi.fn(() => new Promise<Awaited<ReturnType<AccionesDeStock["pedirTransferencia"]>>>((res) => (terminar = res)));
    render(<StockVista datos={chico()} acciones={acciones(pedirTransferencia)} />);
    await abrir();
    await llenar();
    const enviar = enDialogo().getByRole("button", { name: "Pedir transferencia" });
    fireEvent.click(enviar);
    fireEvent.click(enviar);
    await userEvent.click(enviar);
    expect(pedirTransferencia).toHaveBeenCalledTimes(1);
    expect(enDialogo().getByRole("button", { name: "Pidiendo…" })).toHaveAttribute("aria-disabled", "true");
    expect(enDialogo().getByRole("button", { name: "Cancelar" })).toBeDisabled();

    await userEvent.keyboard("{Escape}");
    expect(dialogo()).toBeInTheDocument();

    await act(async () => terminar({ ok: true, valor: { id: "t", numero: "T-19" } }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(pedirTransferencia).toHaveBeenCalledTimes(1);
  });

  it("falla a mitad (sin conexión): dice qué hacer, el botón vuelve a poder usarse y lo cargado sigue; el reintento sale", async () => {
    const pedirTransferencia = vi
      .fn<AccionesDeStock["pedirTransferencia"]>()
      .mockRejectedValueOnce(new Error("red"))
      .mockResolvedValueOnce({ ok: true, valor: { id: "t", numero: "T-21" } });
    render(<StockVista datos={chico()} acciones={acciones(pedirTransferencia)} />);
    await abrir();
    await llenar();
    await pedir();

    expect(await enDialogo().findByRole("alert")).toHaveTextContent("Necesitás conexión para pedir la transferencia. Revisá la conexión y probá de nuevo.");
    const enviar = enDialogo().getByRole("button", { name: "Pedir transferencia" });
    expect(enviar).not.toHaveAttribute("aria-disabled");
    expect(enDialogo().getByRole("button", { name: "Cancelar" })).toBeEnabled();
    expect(enDialogo().getByLabelText("Cantidad del producto 1")).toHaveValue("2");
    expect(enDialogo().getByLabelText("QUIÉN DA LOS LIBROS")).toHaveValue("ana");

    await userEvent.click(enviar);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(pedirTransferencia).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/Armaste la transferencia T-21/)).toBeInTheDocument();
  });

  it("la base la rechaza: se ve su texto y se puede corregir y volver a pedir", async () => {
    const pedirTransferencia = vi
      .fn<AccionesDeStock["pedirTransferencia"]>()
      .mockResolvedValueOnce({ ok: false, causa: "rechazado", mensaje: "Hay un libro que ya no está en el catálogo. Sacalo de la transferencia y volvé a intentar." })
      .mockResolvedValueOnce({ ok: true, valor: { id: "t", numero: "T-22" } });
    render(<StockVista datos={chico()} acciones={acciones(pedirTransferencia)} />);
    await abrir();
    await llenar();
    await pedir();
    expect(await enDialogo().findByRole("alert")).toHaveTextContent("Hay un libro que ya no está en el catálogo.");
    await pedir();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("un rechazo sin texto no deja el aviso vacío: dice qué hacer", async () => {
    render(<StockVista datos={chico()} acciones={acciones(vi.fn(async () => ({ ok: false as const, causa: "rechazado" as const })))} />);
    await abrir();
    await llenar();
    await pedir();
    expect(await enDialogo().findByRole("alert")).toHaveTextContent(/No se pudo pedir la transferencia\. Probá de nuevo/);
  });

  it("dos transferencias seguidas: salen las dos, con números distintos, y los dos avisos quedan a la vista", async () => {
    render(<StockVista datos={chico()} acciones={crearAccionesSimuladas(chico())} />);
    await abrir();
    await llenar("ana", "beto", "l1", "1");
    await pedir();
    await screen.findByText(/T-19/);
    await abrir();
    await llenar("beto", "ana", "l1", "1");
    await pedir();
    await screen.findByText(/T-20/);
    expect(screen.getAllByText(/Armaste la transferencia/)).toHaveLength(2);
    expect(screen.getByText(/T-20: Beto le da 1 unidad a Ana/)).toBeInTheDocument();
    expect(screen.getByText(/T-19: Ana le da 1 unidad a Beto/)).toBeInTheDocument();
  });

  it("quedan a la vista solo los últimos tres avisos", async () => {
    render(<StockVista datos={chico()} acciones={crearAccionesSimuladas(chico())} />);
    for (let i = 0; i < 4; i++) {
      await abrir();
      await llenar("ana", "beto", "l1", "1");
      await pedir();
      await screen.findByText(new RegExp(`T-${19 + i}`));
    }
    expect(screen.getAllByText(/Armaste la transferencia/)).toHaveLength(3);
    expect(screen.queryByText(/T-19:/)).toBeNull();
  });

  it("sin conexión del navegador no se manda: avisa, y al volver la conexión sale", async () => {
    const pedirTransferencia = ok();
    const enLinea = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<StockVista datos={chico()} acciones={acciones(pedirTransferencia)} />);
    await abrir();
    expect(enDialogo().getByText(/No hay conexión: la transferencia no se puede pedir hasta que vuelva/)).toBeInTheDocument();
    await llenar();
    await pedir();
    expect(pedirTransferencia).not.toHaveBeenCalled();
    expect(enDialogo().getByLabelText("Cantidad del producto 1")).toHaveValue("2");

    enLinea.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(enDialogo().queryByText(/No hay conexión/)).toBeNull();
    await pedir();
    expect(pedirTransferencia).toHaveBeenCalledTimes(1);
  });

  it("con 300 colportores y nombres larguísimos el formulario sigue andando", async () => {
    const largo = "Nombre larguísimo ".repeat(12).trim();
    const muchos = Array.from({ length: 300 }, (_, i) => ({
      id: `c${i}`,
      nombre: `${largo} ${String(i).padStart(3, "0")}`,
      ciudadId: "riv",
      ultimoDatoAt: null,
      existencias: [ex("l1", i)],
    }));
    const pedirTransferencia = ok();
    render(<StockVista datos={chico({ colportores: muchos })} acciones={acciones(pedirTransferencia)} />);
    await abrir();
    expect(within(enDialogo().getByLabelText("QUIÉN DA LOS LIBROS")).getAllByRole("option")).toHaveLength(301);
    await userEvent.selectOptions(enDialogo().getByLabelText("QUIÉN DA LOS LIBROS"), "c7");
    await userEvent.selectOptions(enDialogo().getByLabelText("QUIÉN LOS RECIBE"), "c9");
    await userEvent.selectOptions(enDialogo().getByLabelText("Producto 1"), "l1");
    await userEvent.type(enDialogo().getByLabelText("Cantidad del producto 1"), "3");
    await pedir();
    expect(pedirTransferencia).toHaveBeenCalledWith({ origenId: "c7", destinoId: "c9", lineas: [{ productoId: "l1", cantidad: 3 }] });
  });

  it("con la fuente simulada completa se arma una transferencia de punta a punta", async () => {
    const datos = crearDatosDeStockSimulados();
    render(<StockVista datos={datos} acciones={crearAccionesSimuladas(datos)} />);
    await abrir();
    await userEvent.selectOptions(enDialogo().getByLabelText("QUIÉN DA LOS LIBROS"), "lucia-fernandez");
    await userEvent.selectOptions(enDialogo().getByLabelText("QUIÉN LOS RECIBE"), "bruno-techera");
    await userEvent.selectOptions(enDialogo().getByLabelText("Producto 1"), "ddg");
    await userEvent.type(enDialogo().getByLabelText("Cantidad del producto 1"), "2");
    await pedir();
    expect(await screen.findByText(/Armaste la transferencia T-19: Lucía Fernández le da 2 unidades a Bruno Techera/)).toBeInTheDocument();
  });
});
