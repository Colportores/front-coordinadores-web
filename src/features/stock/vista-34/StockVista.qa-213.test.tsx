import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { armarCuentasSimuladas } from "@/datos/cuentas/simulado";
import type { AccionesDeStock, ColportorDeStock, DatosDeStock, ExistenciaDeStock } from "@/datos/stock/contrato";
import { crearDatosDeStockSimulados } from "@/datos/stock/simulado";
import { preseleccionDe } from "@/features/cuentas/preseleccion";

import { hrefPedidos } from "../vista-35/preseleccion";
import { esSincronizacionVieja } from "./modelo";
import { StockVista } from "./StockVista";

// QA del PR #213 (issue #91, HU-STK-010 y HU-STK-005; retoque 42B de Claude Design). Lo que los tests del implementador no
// cubren: el texto literal de «sin conexión» (convención §10), el anuncio de los avisos, los casos límite de la cantidad pegada,
// las acciones superpuestas, la coherencia entre Stock y Cuentas y las ciudades sin colportores con pedidos.

const ex = (productoId: string, tiene: number): ExistenciaDeStock => ({ productoId, tiene, porEntregar: 0, entregados: 0, devueltos: 0, porCobrar: 0 });
const col = (id: string, nombre: string, ciudadId: string | null, ...existencias: ExistenciaDeStock[]): ColportorDeStock => ({
  id,
  nombre,
  ciudadId,
  ultimoDatoAt: null,
  existencias,
});
const chico = (parcial: Partial<DatosDeStock> = {}): DatosDeStock => ({
  campaniaId: "c",
  ciudades: [
    { id: "riv", nombre: "Rivera", departamento: "Rivera" },
    { id: "art", nombre: "Artigas", departamento: "Artigas" },
  ],
  productos: [
    { id: "l1", nombre: "Libro uno", tipo: "LIBRO", nota: null },
    { id: "l2", nombre: "Libro dos", tipo: "LIBRO", nota: null },
  ],
  colportores: [col("ana", "Ana", "riv", ex("l1", 5)), col("beto", "Beto", "riv", ex("l1", 1)), col("cris", "Cris", "art", ex("l1", 2))],
  ...parcial,
});

const acciones = (pedirTransferencia: AccionesDeStock["pedirTransferencia"]): AccionesDeStock => ({ pedirTransferencia });
const ok = (numero = "T-19") => vi.fn<AccionesDeStock["pedirTransferencia"]>(async () => ({ ok: true as const, valor: { id: "t", numero } }));
const boton = () => screen.getByRole("button", { name: "Pedir transferencia de materiales" });
const dialogo = () => screen.getByRole("dialog", { name: "Pedir transferencia de materiales" });
const enDialogo = () => within(dialogo());
const abrir = () => userEvent.click(boton());
const pedir = () => userEvent.click(enDialogo().getByRole("button", { name: /^Pedir transferencia$|^Pidiendo/ }));

async function llenar(origen = "ana", destino = "beto", producto = "l1", cantidad = "2") {
  await userEvent.selectOptions(enDialogo().getByLabelText("QUIÉN DA LOS LIBROS"), origen);
  await userEvent.selectOptions(enDialogo().getByLabelText("QUIÉN LOS RECIBE"), destino);
  await userEvent.selectOptions(enDialogo().getByLabelText("Producto 1"), producto);
  if (cantidad !== "") await userEvent.click(enDialogo().getByLabelText("Cantidad del producto 1"));
  if (cantidad !== "") await userEvent.paste(cantidad);
}

afterEach(() => vi.restoreAllMocks());

describe("QA #213 · sin conexión: el texto de la convención (§10) y el anuncio", () => {
  it.skip("QA #213: con el navegador sin conexión el diálogo dice «Necesitás conexión para pedir la transferencia», como cuando la red falla al enviar (hoy dice «No hay conexión: …»)", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<StockVista datos={chico()} acciones={acciones(ok())} />);
    await abrir();
    expect(enDialogo().getByText(/Necesitás conexión para pedir la transferencia/)).toBeInTheDocument();
  });

  it("la falla de red al enviar sí dice «Necesitás conexión para pedir la transferencia» y se anuncia (role alert)", async () => {
    const pedirTransferencia = vi.fn<AccionesDeStock["pedirTransferencia"]>(async () => ({ ok: false as const, causa: "sin-conexion" as const }));
    render(<StockVista datos={chico()} acciones={acciones(pedirTransferencia)} />);
    await abrir();
    await llenar();
    await pedir();
    expect(enDialogo().getByRole("alert")).toHaveTextContent(/^Necesitás conexión para pedir la transferencia\. /);
  });

  it.skip("QA #213: el aviso de «sin conexión» del diálogo se anuncia al lector de pantalla cuando la conexión se corta con el diálogo abierto (hoy es un <p> sin role ni región viva)", async () => {
    const enLinea = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    render(<StockVista datos={chico()} acciones={acciones(ok())} />);
    await abrir();
    enLinea.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    const aviso = enDialogo().getByText(/conexión/);
    const anunciado = aviso.closest("[role=alert],[role=status],[aria-live]");
    expect(anunciado).not.toBeNull();
  });
});

describe("QA #213 · acciones superpuestas y falla a mitad", () => {
  it("mientras la primera está en camino: Enter repetido, Esc y Cancelar no mandan ni cierran; al fallar todo vuelve a poder usarse con lo cargado", async () => {
    let soltar: (() => void) | undefined;
    const pedirTransferencia = vi.fn<AccionesDeStock["pedirTransferencia"]>(
      () =>
        new Promise((resolver) => {
          soltar = () => resolver({ ok: false, causa: "rechazado", mensaje: "TR001: no se puede." });
        }),
    );
    render(<StockVista datos={chico()} acciones={acciones(pedirTransferencia)} />);
    await abrir();
    await llenar("ana", "beto", "l1", "2");
    const enviar = enDialogo().getByRole("button", { name: "Pedir transferencia" });
    enviar.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Escape}");
    expect(pedirTransferencia).toHaveBeenCalledTimes(1);
    expect(dialogo()).toBeInTheDocument();
    expect(enDialogo().getByRole("button", { name: "Pidiendo…" })).toHaveAttribute("aria-disabled", "true");
    expect(enDialogo().getByRole("button", { name: "Cancelar" })).toBeDisabled();

    await act(async () => soltar?.());
    expect(enDialogo().getByRole("alert")).toHaveTextContent("TR001: no se puede.");
    expect(enDialogo().getByRole("button", { name: "Pedir transferencia" })).not.toHaveAttribute("aria-disabled");
    expect(enDialogo().getByRole("button", { name: "Cancelar" })).toBeEnabled();
    expect(enDialogo().getByLabelText("Cantidad del producto 1")).toHaveValue("2");
    expect(enDialogo().getByLabelText("QUIÉN DA LOS LIBROS")).toHaveValue("ana");
  });

  it("la acción que revienta (promesa rechazada) no deja «Pidiendo…» trabado y el reintento sale", async () => {
    const pedirTransferencia = vi
      .fn<AccionesDeStock["pedirTransferencia"]>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ ok: true, valor: { id: "t", numero: "T-20" } });
    render(<StockVista datos={chico()} acciones={acciones(pedirTransferencia)} />);
    await abrir();
    await llenar();
    await pedir();
    expect(enDialogo().getByRole("alert")).toHaveTextContent(/Necesitás conexión para pedir la transferencia/);
    expect(enDialogo().getByRole("button", { name: "Pedir transferencia" })).toBeEnabled();
    await pedir();
    expect(pedirTransferencia).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(/Armaste la transferencia T-20/)).toBeInTheDocument();
  });

  it("falla, se cancela y se vuelve a entrar: el formulario está vacío y sin el error anterior", async () => {
    const pedirTransferencia = vi.fn<AccionesDeStock["pedirTransferencia"]>(async () => ({ ok: false as const, causa: "sin-conexion" as const }));
    render(<StockVista datos={chico()} acciones={acciones(pedirTransferencia)} />);
    await abrir();
    await llenar();
    await pedir();
    expect(enDialogo().getByRole("alert")).toBeInTheDocument();
    await userEvent.click(enDialogo().getByRole("button", { name: "Cancelar" }));
    await abrir();
    expect(enDialogo().queryByRole("alert")).toBeNull();
    expect(enDialogo().getByLabelText("QUIÉN DA LOS LIBROS")).toHaveValue("");
    expect(enDialogo().getByLabelText("Cantidad del producto 1")).toHaveValue("");
    expect(enDialogo().getByLabelText("QUIÉN DA LOS LIBROS")).toHaveFocus();
  });

  it("tras un éxito, abrir otra vez da el formulario vacío y con el foco en el primer campo; el aviso anterior sigue", async () => {
    render(<StockVista datos={chico()} acciones={acciones(ok("T-19"))} />);
    await abrir();
    await llenar();
    await pedir();
    expect(boton()).toHaveFocus();
    await abrir();
    expect(enDialogo().getByLabelText("Cantidad del producto 1")).toHaveValue("");
    expect(enDialogo().getByLabelText("QUIÉN DA LOS LIBROS")).toHaveFocus();
    expect(screen.getByText(/Armaste la transferencia T-19/)).toBeInTheDocument();
  });
});

describe("QA #213 · la cantidad: lo que se acepta y lo que no", () => {
  it.each([
    ["con espacios alrededor", "  5  ", 5],
    ["con ceros a la izquierda", "0005", 5],
  ])("%s se manda como el entero que es", async (_nombre, escrito, esperado) => {
    const pedirTransferencia = ok();
    render(<StockVista datos={chico()} acciones={acciones(pedirTransferencia)} />);
    await abrir();
    await llenar("ana", "beto", "l1", escrito);
    await pedir();
    expect(pedirTransferencia).toHaveBeenCalledWith({ origenId: "ana", destinoId: "beto", lineas: [{ productoId: "l1", cantidad: esperado }] });
  });

  it.each(["abc", "1e3", "+5", "-3", "0x10", "2,5", "2.5", "0", "00", "٣", "５", "🙂", "5 libros", "NaN", "Infinity", "9".repeat(400)])(
    "«%s» no se manda: el error está en su fila, dice qué hacer y lo escrito se queda",
    async (escrito) => {
      const pedirTransferencia = ok();
      render(<StockVista datos={chico()} acciones={acciones(pedirTransferencia)} />);
      await abrir();
      await llenar("ana", "beto", "l1", escrito);
      await pedir();
      expect(pedirTransferencia).not.toHaveBeenCalled();
      const campo = enDialogo().getByLabelText("Cantidad del producto 1");
      expect(campo).toHaveAttribute("aria-invalid", "true");
      expect(campo).toHaveFocus();
      expect(enDialogo().getByText(/entera mayor que cero|Es mucho/)).toBeInTheDocument();
      expect(campo).toHaveValue(escrito);
    },
  );

  it("un texto pegado larguísimo (emoji y dígitos) no rompe nada ni se manda", async () => {
    const pedirTransferencia = ok();
    render(<StockVista datos={chico()} acciones={acciones(pedirTransferencia)} />);
    await abrir();
    await llenar("ana", "beto", "l1", "😀".repeat(3000) + "9".repeat(5000));
    await pedir();
    expect(pedirTransferencia).not.toHaveBeenCalled();
    expect(enDialogo().getByText(/entera mayor que cero/)).toBeInTheDocument();
  });

  it("el límite: 99.999 se manda y 100.000 avisa del máximo con el número en miles", async () => {
    const pedirTransferencia = ok();
    render(<StockVista datos={chico()} acciones={acciones(pedirTransferencia)} />);
    await abrir();
    await llenar("ana", "beto", "l1", "100000");
    await pedir();
    expect(pedirTransferencia).not.toHaveBeenCalled();
    expect(enDialogo().getByText("Es mucho: el máximo por producto es 99.999.")).toBeInTheDocument();
    await userEvent.clear(enDialogo().getByLabelText("Cantidad del producto 1"));
    await userEvent.click(enDialogo().getByLabelText("Cantidad del producto 1"));
    await userEvent.paste("99999");
    await pedir();
    expect(pedirTransferencia).toHaveBeenCalledTimes(1);
  });

  it("dos productos: sacar la primera fila no pierde lo cargado en la otra y se manda solo esa", async () => {
    const pedirTransferencia = ok();
    render(<StockVista datos={chico()} acciones={acciones(pedirTransferencia)} />);
    await abrir();
    await llenar("ana", "beto", "l1", "2");
    await userEvent.click(enDialogo().getByRole("button", { name: "Sumar otro producto" }));
    await userEvent.selectOptions(enDialogo().getByLabelText("Producto 2"), "l2");
    await userEvent.click(enDialogo().getByLabelText("Cantidad del producto 2"));
    await userEvent.paste("7");
    await userEvent.click(enDialogo().getByRole("button", { name: "Sacar el producto 1" }));
    expect(enDialogo().getByLabelText("Producto 1")).toHaveValue("l2");
    expect(enDialogo().getByLabelText("Cantidad del producto 1")).toHaveValue("7");
    await pedir();
    expect(pedirTransferencia).toHaveBeenCalledWith({ origenId: "ana", destinoId: "beto", lineas: [{ productoId: "l2", cantidad: 7 }] });
  });
});

describe("QA #213 · datos límite de la vista", () => {
  it("con exactamente dos colportores y un solo producto el formulario se puede completar y mandar", async () => {
    const datos = chico({
      productos: [{ id: "l1", nombre: "Libro uno", tipo: "LIBRO", nota: null }],
      colportores: [col("ana", "Ana", "riv", ex("l1", 5)), col("beto", "Beto", "riv")],
    });
    const pedirTransferencia = ok();
    render(<StockVista datos={datos} acciones={acciones(pedirTransferencia)} />);
    await abrir();
    await llenar("ana", "beto", "l1", "1");
    expect(enDialogo().getByRole("button", { name: "Sumar otro producto" })).toBeDisabled();
    await pedir();
    expect(pedirTransferencia).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Armaste la transferencia T-19: Ana le da 1 unidad a Beto/)).toBeInTheDocument();
  });

  it("un colportor sin ciudad aparece en el formulario y se puede elegir", async () => {
    const datos = chico({ colportores: [col("ana", "Ana", "riv", ex("l1", 5)), col("sin", "Sofía", null, ex("l1", 1))] });
    render(<StockVista datos={datos} acciones={acciones(ok())} />);
    await abrir();
    expect(within(enDialogo().getByLabelText("QUIÉN LOS RECIBE")).getByRole("option", { name: "Sofía" })).toBeInTheDocument();
  });

  it("los avisos de «Armaste…» no pisan el foco ni se pierden al cambiar de ciudad", async () => {
    render(<StockVista datos={chico()} acciones={acciones(ok("T-19"))} />);
    await abrir();
    await llenar();
    await pedir();
    await userEvent.click(within(screen.getByRole("navigation", { name: "Ciudades" })).getByRole("button", { name: /^Artigas/ }));
    expect(screen.getByText(/Armaste la transferencia T-19/)).toBeInTheDocument();
  });
});

describe("QA #213 · coherencia entre Stock y las vistas a las que lleva", () => {
  it("todos los «Ver en Cuentas →» de la fuente simulada llevan a un colportor que Cuentas tiene (sin el aviso de «No encontramos»)", () => {
    const stock = crearDatosDeStockSimulados();
    const cuentas = armarCuentasSimuladas();
    const sinCuentas = stock.colportores.filter((c) => c.ciudadId !== null).filter((c) => preseleccionDe(cuentas, c.id).aviso !== null).map((c) => c.nombre);
    expect(sinCuentas).toEqual([]);
  });

  it("«Ver pedidos» escapa el id de la ciudad y sin ciudad abre la vista sin parámetro", () => {
    expect(hrefPedidos("a b/ñ")).toBe("/stock/pedidos?ciudad=a%20b%2F%C3%B1");
    expect(hrefPedidos(null)).toBe("/stock/pedidos");
    expect(hrefPedidos("")).toBe("/stock/pedidos?ciudad=");
  });

  it.skip("QA #213: una ciudad con pedidos por autorizar y sin colportores muestra el aviso «Ver pedidos» (hoy dice «sin colportores» en el vacío y el aviso no aparece, aunque la lista diga «2 por autorizar»)", async () => {
    const datos = chico({
      ciudades: [
        { id: "riv", nombre: "Rivera", departamento: "Rivera" },
        { id: "art", nombre: "Artigas", departamento: "Artigas" },
        { id: "bu", nombre: "Bella Unión", departamento: "Artigas" },
      ],
      pedidosPorAutorizar: [{ ciudadId: "bu", pedidos: 2 }],
    });
    render(<StockVista datos={datos} />);
    await userEvent.click(within(screen.getByRole("navigation", { name: "Ciudades" })).getByRole("button", { name: /^Bella Unión/ }));
    expect(screen.getByRole("link", { name: /Ver pedidos por autorizar en Bella Unión/ })).toBeInTheDocument();
  });
});

describe("QA #213 · «Sincronizó…» en rojo: el borde de los dos días", () => {
  const ahora = new Date("2026-11-23T12:00:00Z");
  const dosDias = 48 * 3_600_000;

  it("justo dos días no es rojo; un milisegundo más, sí", () => {
    expect(esSincronizacionVieja(new Date(ahora.getTime() - dosDias).toISOString(), ahora)).toBe(false);
    expect(esSincronizacionVieja(new Date(ahora.getTime() - dosDias - 1).toISOString(), ahora)).toBe(true);
  });

  it("sin fecha, con fecha ilegible o futura no es rojo", () => {
    expect(esSincronizacionVieja(null, ahora)).toBe(false);
    expect(esSincronizacionVieja("ayer a la tarde", ahora)).toBe(false);
    expect(esSincronizacionVieja(new Date(ahora.getTime() + dosDias).toISOString(), ahora)).toBe(false);
  });
});
