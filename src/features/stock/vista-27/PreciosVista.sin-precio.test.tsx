import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AccionesPrecios, CambioDePrecio, DatosDePrecios, ResultadoDeGuardado } from "@/datos/precios";
import { CIUDADES_SIMULADAS, crearDatosDePreciosSimulados, ITEMS_SIMULADOS } from "@/datos/precios/simulado";
import { reiniciarTrabajoPendiente } from "@/shell/trabajo-pendiente";

import { PreciosVista } from "./PreciosVista";

/**
 * 27G·05, decisión de Cristian del 05/11 («Sin general»): la alerta de un bonificable sin precio general sale en la pestaña de
 * cada ciudad de la campaña (no solo en General), con la insignia «Falta N precio(s)» en la pestaña y qué hacer: cargar el precio
 * de esa ciudad o pedirle el general a Administración.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.setConfig({ testTimeout: 30_000 });

const [MONTEVIDEO] = CIUDADES_SIMULADAS;
const por = (codigo: string) => ITEMS_SIMULADOS.find((i) => i.codigo === codigo)!;
const NH = por("NH-04");
const SH = por("SH-12");

const ok: ResultadoDeGuardado = { ok: true };

function acciones(responder: (ciudadId: string, cambios: CambioDePrecio[]) => Promise<ResultadoDeGuardado> | ResultadoDeGuardado = () => ok) {
  const guardarPrecios = vi.fn(async (ciudadId: string, cambios: CambioDePrecio[]) => responder(ciudadId, cambios));
  return { guardarPrecios } satisfies AccionesPrecios;
}

/** Los datos simulados con estos productos bonificables sin precio general. */
function sinGeneral(...claves: string[]): DatosDePrecios {
  const datos = crearDatosDePreciosSimulados();
  datos.items = datos.items.map((i) => (claves.includes(i.clave) ? { ...i, precioGeneral: null } : i));
  return datos;
}

function montar(datos: DatosDePrecios, a: AccionesPrecios = acciones()) {
  return { ...render(<PreciosVista datos={datos} acciones={a} />), acciones: a };
}

const pestana = (nombre: RegExp) => screen.getByRole("tab", { name: nombre });
const abrir = (nombre: RegExp) => userEvent.click(pestana(nombre));
const campo = (producto: string, ciudad: string) => screen.getByRole("textbox", { name: `Precio de ${producto} en ${ciudad}` });
const agregarPrecio = () => screen.getByRole("button", { name: "Agregar precio" });
const guardar = () => screen.getByRole("button", { name: /^(Guardar cambios|Guardando…|Reintentar)$/ });

afterEach(() => {
  reiniciarTrabajoPendiente();
  vi.restoreAllMocks();
});

describe("27G·05 · alerta en cada ciudad", () => {
  it("sale en Las Piedras con la frase del canvas, qué hacer y la insignia en la pestaña", async () => {
    montar(sinGeneral(NH.clave));
    expect(pestana(/^Las Piedras Falta 1 precio$/)).toBeInTheDocument();
    await abrir(/^Las Piedras/);
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent(
      "Nuestros Hijos es bonificable y no tiene precio en Las Piedras: no tiene precio general ni excepción, así que los colportores no lo pueden vender ahí. Cargá su precio en Las Piedras o pedile el general a Administración.",
    );
    expect(within(alerta).getByRole("button", { name: "Agregar precio" })).toBeInTheDocument();
  });

  it("sale también en Montevideo (todas las ciudades de la campaña) y en General sigue la suya", async () => {
    montar(sinGeneral(NH.clave));
    expect(screen.getByRole("alert")).toHaveTextContent("no tiene precio general:");
    expect(screen.queryByRole("button", { name: "Agregar precio" })).not.toBeInTheDocument();
    // Montevideo tiene 3 excepciones, pero ninguna es de Nuestros Hijos: la falta pesa más que el conteo en la insignia.
    await abrir(/^Montevideo Falta 1 precio$/);
    expect(screen.getByRole("alert")).toHaveTextContent("Nuestros Hijos es bonificable y no tiene precio en Montevideo");
  });

  it("una ciudad con excepción para el producto no tiene alerta ni insignia de falta", async () => {
    const datos = sinGeneral(NH.clave);
    datos.excepciones[MONTEVIDEO.id] = { ...datos.excepciones[MONTEVIDEO.id], [NH.clave]: 2000 };
    montar(datos);
    expect(pestana(/^Montevideo 4 excepciones$/)).toBeInTheDocument();
    expect(pestana(/^Las Piedras Falta 1 precio$/)).toBeInTheDocument();
    await abrir(/^Montevideo/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agregar precio" })).not.toBeInTheDocument();
  });

  it("con precio general en todo no hay alerta en ninguna ciudad", async () => {
    montar(crearDatosDePreciosSimulados());
    await abrir(/^Las Piedras$/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await abrir(/^Montevideo/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("un solo producto sin general que no es bonificable no dispara la alerta", async () => {
    const datos = crearDatosDePreciosSimulados();
    datos.items = datos.items.map((i) => (i.esBonificable ? i : { ...i, precioGeneral: null }));
    montar(datos);
    await abrir(/^Las Piedras/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("dos productos: texto en plural con los nombres, «Faltan 2 precios» y qué hacer", async () => {
    const datos = sinGeneral(NH.clave, SH.clave);
    expect(SH.esBonificable).toBe(true);
    montar(datos);
    await abrir(/^Las Piedras Faltan 2 precios$/);
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent("2 productos bonificables no tienen precio en Las Piedras (");
    expect(alerta).toHaveTextContent(NH.nombre);
    expect(alerta).toHaveTextContent(SH.nombre);
    expect(alerta).toHaveTextContent("Cargá el precio de cada uno en Las Piedras o pedile el general a Administración.");
  });

  it("un nombre larguísimo no rompe la alerta (se ajusta dentro del aviso)", async () => {
    const largo = "Producto con un nombre larguísimo ".repeat(12).trim();
    const datos = sinGeneral(NH.clave);
    datos.items = datos.items.map((i) => (i.clave === NH.clave ? { ...i, nombre: largo } : i));
    montar(datos);
    await abrir(/^Las Piedras/);
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent(`${largo} es bonificable y no tiene precio en Las Piedras`);
    expect(alerta.querySelector("p")).toHaveClass("wrap-anywhere");
  });
});

describe("27G·05 · «Agregar precio»", () => {
  it("abre el campo del producto con el foco, vacío, y la fila queda con el campo abierto", async () => {
    montar(sinGeneral(NH.clave));
    await abrir(/^Las Piedras/);
    await userEvent.click(agregarPrecio());
    const entrada = campo("Nuestros Hijos", "Las Piedras");
    expect(entrada).toHaveValue("");
    expect(entrada).toHaveFocus();
  });

  it("un segundo toque no pisa lo que ya se escribió: lleva el foco al campo", async () => {
    montar(sinGeneral(NH.clave));
    await abrir(/^Las Piedras/);
    await userEvent.click(agregarPrecio());
    fireEvent.change(campo("Nuestros Hijos", "Las Piedras"), { target: { value: "2100" } });
    screen.getByRole("heading", { level: 2 }).focus();
    await userEvent.dblClick(agregarPrecio());
    expect(campo("Nuestros Hijos", "Las Piedras")).toHaveValue("2100");
    expect(campo("Nuestros Hijos", "Las Piedras")).toHaveFocus();
  });

  it("con dos productos, cada toque abre el siguiente sin pisar al anterior", async () => {
    montar(sinGeneral(NH.clave, SH.clave));
    await abrir(/^Las Piedras/);
    await userEvent.click(agregarPrecio());
    const primero = screen.getAllByRole("textbox");
    expect(primero).toHaveLength(1);
    fireEvent.change(primero[0], { target: { value: "1500" } });
    await userEvent.click(agregarPrecio());
    const abiertos = screen.getAllByRole("textbox");
    expect(abiertos).toHaveLength(2);
    expect(abiertos.map((c) => (c as HTMLInputElement).value).sort()).toEqual(["", "1500"]);
  });

  it("volver a otra pestaña y reentrar conserva la alerta y lo escrito", async () => {
    montar(sinGeneral(NH.clave));
    await abrir(/^Las Piedras/);
    await userEvent.click(agregarPrecio());
    fireEvent.change(campo("Nuestros Hijos", "Las Piedras"), { target: { value: "2100" } });
    await abrir(/^General$/);
    await abrir(/^Las Piedras/);
    expect(campo("Nuestros Hijos", "Las Piedras")).toHaveValue("2100");
    expect(screen.getByRole("alert")).toHaveTextContent("no tiene precio en Las Piedras");
    // Mientras no se guarda, la pestaña dice «sin guardar» y no «Falta».
    expect(pestana(/^Las Piedras 1 sin guardar$/)).toBeInTheDocument();
  });

  it("guardar el precio saca la alerta y la insignia; si falla, siguen y el botón vuelve a quedar usable", async () => {
    let fallar = true;
    const a = acciones(() => (fallar ? { ok: false, causa: "rechazado", mensaje: "Algún precio no es válido. Revisá los cambios marcados." } : ok));
    montar(sinGeneral(NH.clave), a);
    await abrir(/^Las Piedras/);
    await userEvent.click(agregarPrecio());
    fireEvent.change(campo("Nuestros Hijos", "Las Piedras"), { target: { value: "2100" } });
    await userEvent.click(guardar());
    expect(await screen.findByText(/Algún precio no es válido/)).toBeInTheDocument();
    expect(screen.getAllByRole("alert").some((x) => /no tiene precio en Las Piedras/.test(x.textContent ?? ""))).toBe(true);
    expect(agregarPrecio()).toBeEnabled();

    fallar = false;
    await userEvent.click(guardar());
    await vi.waitFor(() => expect(a.guardarPrecios).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(screen.queryByRole("button", { name: "Agregar precio" })).not.toBeInTheDocument());
    expect(pestana(/^Las Piedras 1 excepción$/)).toBeInTheDocument();
  });
});

describe("27G·05 · accesibilidad", () => {
  it("sin violaciones de axe con la alerta, el botón y la insignia", async () => {
    const { container } = montar(sinGeneral(NH.clave));
    await abrir(/^Las Piedras/);
    const r = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });
});
