import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { marcaDeRechazo } from "@/auth/sesion-vencida";
import type { AccionesPrecios, CambioDePrecio, DatosDePrecios, ResultadoDeGuardado } from "@/datos/precios";
import { CIUDADES_SIMULADAS, crearDatosDePreciosSimulados, ITEMS_SIMULADOS } from "@/datos/precios/simulado";
import { hayTrabajoPendiente, reiniciarTrabajoPendiente } from "@/shell/trabajo-pendiente";

import { TEXTO_SALIR_CON_CAMBIOS } from "./BarraDeCambios";
import { textoDeComponentesDeBaja } from "./NombreDeItem";
import { PreciosVista, TEXTO_SIN_CIUDADES, TEXTO_SIN_PRECIOS_GENERALES } from "./PreciosVista";

const navegacion = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: navegacion.push }) }));

const [MONTEVIDEO, LAS_PIEDRAS] = CIUDADES_SIMULADAS;
const por = (codigo: string) => ITEMS_SIMULADOS.find((i) => i.codigo === codigo)!;
const SH = por("SH-12");
const NH = por("NH-04");
const DG = por("DG-01");
const COL1 = por("COL-1");

const ok: ResultadoDeGuardado = { ok: true };

function acciones(responder: (ciudadId: string, cambios: CambioDePrecio[]) => Promise<ResultadoDeGuardado> | ResultadoDeGuardado = () => ok) {
  const guardarPrecios = vi.fn(async (ciudadId: string, cambios: CambioDePrecio[]) => responder(ciudadId, cambios));
  return { guardarPrecios } satisfies AccionesPrecios;
}

/** Una respuesta que se resuelve a mano: sirve para probar lo que pasa mientras el guardado está en camino. */
function diferida() {
  let resolver!: (r: ResultadoDeGuardado) => void;
  const promesa = new Promise<ResultadoDeGuardado>((res) => {
    resolver = res;
  });
  return { promesa, resolver };
}

function montar(datos: DatosDePrecios = crearDatosDePreciosSimulados(), a = acciones()) {
  const vista = render(<PreciosVista datos={datos} acciones={a} />);
  return { ...vista, acciones: a };
}

const pestana = (nombre: RegExp) => screen.getByRole("tab", { name: nombre });
const abrir = (nombre: RegExp) => userEvent.click(pestana(nombre));
const campo = (producto: string, ciudad = "Montevideo") => screen.getByRole("textbox", { name: `Precio de ${producto} en ${ciudad}` });
const accion = (texto: string, producto: string) => screen.getByRole("button", { name: `${texto}: ${producto}` });
const guardar = () => screen.getByRole("button", { name: /^(Guardar cambios|Guardando…|Reintentar)$/ });
const escribir = (producto: string, texto: string, ciudad?: string) => fireEvent.change(campo(producto, ciudad), { target: { value: texto } });
const sinConexion = (en: boolean) => vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(en);

afterEach(() => {
  reiniciarTrabajoPendiente();
  navegacion.push.mockReset();
  vi.restoreAllMocks();
});

describe("27G·01 · pestaña General", () => {
  it("abre en General: el precio de todo el país, sin campos para editar, y las pestañas de las ciudades con sus excepciones", () => {
    montar();
    expect(screen.getByRole("heading", { level: 2, name: "Precios de venta" })).toBeInTheDocument();
    expect(screen.getByText("El precio de todo el país. Cada ciudad usa este precio salvo que tenga una excepción.")).toBeInTheDocument();
    expect(pestana(/^General$/)).toHaveAttribute("aria-selected", "true");
    expect(pestana(/^Montevideo 3 excepciones$/)).toBeInTheDocument();
    expect(pestana(/^Las Piedras$/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("El precio general lo fija el administrador");

    const tabla = screen.getByRole("table");
    const fila = within(tabla).getByRole("row", { name: /Salud y Hogar/ });
    expect(fila).toHaveTextContent("SH-12");
    expect(fila).toHaveTextContent("$U 2.400");
    expect(fila).toHaveTextContent("1 ciudad");
    expect(within(tabla).getByRole("row", { name: /Nuestros Hijos/ })).toHaveTextContent("—");
    // Los cinco grupos del canvas, en orden.
    expect(within(tabla).getAllByRole("columnheader", { name: /^(LIBROS|REVISTAS|MATERIALES|PRODUCTOS|COLECCIONES)$/ }).map((h) => h.textContent)).toEqual([
      "LIBROS",
      "REVISTAS",
      "COLECCIONES",
    ]);
  });

  it("el hint de teclado solo está en las pestañas de ciudad", async () => {
    montar();
    expect(screen.queryByText(/Esc descarta el valor/)).not.toBeInTheDocument();
    await abrir(/^Montevideo/);
    expect(screen.getByText(/Esc descarta el valor/)).toBeInTheDocument();
  });

  it("las flechas pasan de una pestaña a otra", async () => {
    montar();
    pestana(/^General$/).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(pestana(/^Montevideo/)).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{End}");
    expect(pestana(/^Las Piedras/)).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowRight}");
    expect(pestana(/^General$/)).toHaveAttribute("aria-selected", "true");
  });

  it("alerta en General y en cada ciudad cuando un bonificable no tiene precio general (la de la ciudad: PreciosVista.sin-precio.test)", async () => {
    const datos = crearDatosDePreciosSimulados();
    datos.items = datos.items.map((i) => (i.clave === NH.clave ? { ...i, precioGeneral: null } : i));
    montar(datos);
    expect(screen.getByRole("alert")).toHaveTextContent("Nuestros Hijos es bonificable y no tiene precio general");
    expect(screen.getByRole("row", { name: /Nuestros Hijos/ })).toHaveTextContent("sin precio");

    await abrir(/^Las Piedras/);
    expect(screen.getByRole("alert")).toHaveTextContent("Nuestros Hijos es bonificable y no tiene precio en Las Piedras");
    expect(screen.getByRole("row", { name: /Nuestros Hijos/ })).toHaveTextContent("No se ofrece");
  });
});

describe("27G·02 y 27G·07 · pestaña de ciudad", () => {
  it("Montevideo: las excepciones son campos editables y el resto usa el general", async () => {
    montar();
    await abrir(/^Montevideo/);
    expect(screen.getByText("Se aplican a las ventas nuevas de Montevideo. Sin excepción, la ciudad usa el precio general.")).toBeInTheDocument();
    expect(campo("Salud y Hogar")).toHaveValue("2600");
    expect(campo("El Deseado de todas las gentes")).toHaveValue("400");
    expect(screen.getByRole("row", { name: /Salud y Hogar/ })).toHaveTextContent("▲ +$U 200 · +8 %");
    expect(screen.getByRole("row", { name: /^El Deseado de todas las gentes/ })).toHaveTextContent("▼ −$U 50 · −11 %");
    expect(screen.getByRole("row", { name: /Nuestros Hijos/ })).toHaveTextContent("usa el general");
    expect(screen.queryByRole("button", { name: /Guardar/ })).not.toBeInTheDocument();
  });

  it("27G·07 · Las Piedras sin excepciones: todo usa el general y cada fila ofrece «+ Excepción»", async () => {
    montar();
    await abrir(/^Las Piedras/);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getAllByText("usa el general")).toHaveLength(ITEMS_SIMULADOS.length);
    expect(screen.getAllByRole("button", { name: /^\+ Excepción: / })).toHaveLength(ITEMS_SIMULADOS.length);
  });
});

describe("agregar, modificar, guardar", () => {
  it("«+ Excepción» abre el campo con el general, con el foco; escribir marca el cambio y «Guardar cambios» lo manda", async () => {
    const { acciones: a } = montar();
    await abrir(/^Montevideo/);
    await userEvent.click(accion("+ Excepción", "Nuestros Hijos"));

    expect(campo("Nuestros Hijos")).toHaveFocus();
    expect(campo("Nuestros Hijos")).toHaveValue("1900");
    // Igual al general: nada que guardar todavía.
    expect(screen.queryByText(/cambios? sin guardar/)).not.toBeInTheDocument();

    escribir("Nuestros Hijos", "2000");
    expect(screen.getByRole("row", { name: /Nuestros Hijos/ })).toHaveTextContent("Modificado");
    expect(screen.getByRole("row", { name: /Nuestros Hijos/ })).toHaveTextContent("▲ +$U 100 · +5 %");
    expect(screen.getByText("1 cambio sin guardar")).toBeInTheDocument();
    expect(pestana(/^Montevideo.*1 sin guardar$/)).toBeInTheDocument();

    await userEvent.click(guardar());

    expect(a.guardarPrecios).toHaveBeenCalledTimes(1);
    expect(a.guardarPrecios).toHaveBeenCalledWith(MONTEVIDEO.id, [{ tipo: "PRODUCTO", id: NH.id, precio: 2000 }]);
    expect(await screen.findByText("Guardamos 1 precio de Montevideo. Vale para las ventas nuevas.")).toBeInTheDocument();
    expect(screen.queryByText(/cambio sin guardar/)).not.toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Nuestros Hijos/ })).toHaveTextContent("Excepción");
    expect(pestana(/^Montevideo 4 excepciones$/)).toBeInTheDocument();
    // Lo guardado de una ciudad se ve en la pestaña General.
    await abrir(/^General$/);
    expect(screen.getByRole("row", { name: /Nuestros Hijos/ })).toHaveTextContent("1 ciudad");
  });

  it("«Quitar excepción» marca la fila, «Deshacer» la devuelve, y guardar manda el precio nulo", async () => {
    const { acciones: a } = montar();
    await abrir(/^Montevideo/);
    await userEvent.click(accion("Quitar excepción", "El Deseado de todas las gentes"));
    expect(screen.getByRole("row", { name: /^El Deseado de todas las gentes/ })).toHaveTextContent("Sin excepción");
    expect(screen.getByText("1 cambio sin guardar")).toBeInTheDocument();

    await userEvent.click(accion("Deshacer", "El Deseado de todas las gentes"));
    expect(screen.queryByText(/cambios? sin guardar/)).not.toBeInTheDocument();
    expect(campo("El Deseado de todas las gentes")).toHaveValue("400");

    await userEvent.click(accion("Quitar excepción", "El Deseado de todas las gentes"));
    await userEvent.click(guardar());
    expect(a.guardarPrecios).toHaveBeenCalledWith(MONTEVIDEO.id, [{ tipo: "PRODUCTO", id: DG.id, precio: null }]);
    expect(await screen.findByText("Guardamos 1 cambio de Montevideo. Vale para las ventas nuevas.")).toBeInTheDocument();
    expect(pestana(/^Montevideo 2 excepciones$/)).toBeInTheDocument();
  });

  it("una colección también lleva excepción, con su propio tipo en el cambio", async () => {
    const { acciones: a } = montar();
    await abrir(/^Montevideo/);
    escribir("Colección de 1 libro", "4400");
    await userEvent.click(guardar());
    expect(a.guardarPrecios).toHaveBeenCalledWith(MONTEVIDEO.id, [{ tipo: "COLECCION", id: COL1.id, precio: 4400 }]);
  });

  it("«Revertir» y Esc devuelven la fila a lo guardado", async () => {
    montar();
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "2700");
    await userEvent.click(accion("Revertir", "Salud y Hogar"));
    expect(campo("Salud y Hogar")).toHaveValue("2600");
    expect(screen.queryByText(/cambios? sin guardar/)).not.toBeInTheDocument();

    escribir("Salud y Hogar", "2700");
    campo("Salud y Hogar").focus();
    await userEvent.keyboard("{Escape}");
    expect(campo("Salud y Hogar")).toHaveValue("2600");
    expect(screen.queryByText(/cambios? sin guardar/)).not.toBeInTheDocument();
  });

  it("«Descartar» deja la ciudad como estaba; los cambios de una ciudad no se mezclan con los de otra", async () => {
    montar();
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "2700");
    await abrir(/^Las Piedras/);
    expect(screen.queryByText(/cambios? sin guardar/)).not.toBeInTheDocument();
    await userEvent.click(accion("+ Excepción", "Nuestros Hijos"));
    escribir("Nuestros Hijos", "2000", "Las Piedras");
    expect(pestana(/^Montevideo.*1 sin guardar$/)).toBeInTheDocument();
    expect(pestana(/^Las Piedras.*1 sin guardar$/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(pestana(/^Las Piedras$/)).toBeInTheDocument();
    expect(pestana(/^Montevideo.*1 sin guardar$/)).toBeInTheDocument();
  });
});

describe("27G·04 · precio inválido", () => {
  it.each([
    ["1900,50", "Ingresá un precio mayor a 0, sin centavos."],
    ["0", "Ingresá un precio mayor a 0, sin centavos."],
    ["-3", "Ingresá un precio mayor a 0, sin centavos."],
    ["abc", "Ingresá un precio mayor a 0, sin centavos."],
    ["", "Ingresá un precio mayor a 0, sin centavos."],
    ["21474837", "El precio no puede pasar de $U 21.474.836."],
  ])("«%s» marca la fila, dice cómo corregirla y frena el guardado", async (texto, mensaje) => {
    const { acciones: a } = montar();
    await abrir(/^Montevideo/);
    await userEvent.click(accion("+ Excepción", "Nuestros Hijos"));
    escribir("Nuestros Hijos", texto);

    expect(screen.getByRole("textbox", { name: "Precio de Nuestros Hijos en Montevideo" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("row", { name: /Nuestros Hijos/ })).toHaveTextContent("Inválido");
    expect(screen.getByText(mensaje)).toBeInTheDocument();
    expect(screen.getByText("Corregí 1 precio para poder guardar.")).toBeInTheDocument();
    expect(guardar()).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(guardar());
    expect(a.guardarPrecios).not.toHaveBeenCalled();
  });

  it("con un cambio válido y uno inválido no se guarda ninguno; al corregir, se guardan los dos juntos", async () => {
    const { acciones: a } = montar();
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "2700");
    await userEvent.click(accion("+ Excepción", "Nuestros Hijos"));
    escribir("Nuestros Hijos", "1900,50");
    expect(screen.getByText("2 cambios sin guardar")).toBeInTheDocument();
    await userEvent.click(guardar());
    expect(a.guardarPrecios).not.toHaveBeenCalled();

    escribir("Nuestros Hijos", "2.000");
    await userEvent.click(guardar());
    expect(a.guardarPrecios).toHaveBeenCalledTimes(1);
    expect(a.guardarPrecios.mock.calls[0][1]).toEqual(
      expect.arrayContaining([
        { tipo: "PRODUCTO", id: SH.id, precio: 2700 },
        { tipo: "PRODUCTO", id: NH.id, precio: 2000 },
      ]),
    );
  });
});

describe("27A·03 · cambio grande: confirmación", () => {
  async function conCambioGrande() {
    const r = montar();
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "3600");
    await userEvent.click(guardar());
    return r;
  }

  it("un cambio de más del 20 % pide confirmar antes de guardar, con el foco en la acción segura", async () => {
    const { acciones: a } = await conCambioGrande();
    const dialogo = screen.getByRole("dialog", { name: "Revisá los cambios grandes" });
    expect(dialogo).toHaveTextContent("El cambio supera el 20 % respecto del precio anterior.");
    expect(dialogo).toHaveTextContent("Salud y Hogar");
    expect(dialogo).toHaveTextContent("$U 2.600 → $U 3.600");
    expect(within(dialogo).getByRole("button", { name: "Volver a editar" })).toHaveFocus();
    expect(a.guardarPrecios).not.toHaveBeenCalled();
  });

  it("Esc y «Volver a editar» vuelven a la edición con el foco en «Guardar cambios» y sin perder nada", async () => {
    const { acciones: a } = await conCambioGrande();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(guardar()).toHaveFocus();
    expect(campo("Salud y Hogar")).toHaveValue("3600");
    expect(a.guardarPrecios).not.toHaveBeenCalled();

    await userEvent.click(guardar());
    await userEvent.click(screen.getByRole("button", { name: "Volver a editar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Tab no sale del diálogo", async () => {
    await conCambioGrande();
    const volver = screen.getByRole("button", { name: "Volver a editar" });
    const igual = screen.getByRole("button", { name: "Guardar igual" });
    igual.focus();
    await userEvent.tab();
    expect(volver).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(igual).toHaveFocus();
  });

  it("«Guardar igual» guarda; un doble toque manda un solo guardado", async () => {
    const { acciones: a } = await conCambioGrande();
    await userEvent.dblClick(screen.getByRole("button", { name: "Guardar igual" }));
    expect(a.guardarPrecios).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Guardamos 1 precio de Montevideo/)).toBeInTheDocument();
  });

  it("un cambio de exactamente 20 % no pide confirmación", async () => {
    const { acciones: a } = montar();
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "3120");
    await userEvent.click(guardar());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(a.guardarPrecios).toHaveBeenCalledTimes(1);
  });
});

describe("casos límite del guardado", () => {
  it("doble toque en «Guardar cambios»: un solo guardado, el botón dice «Guardando…» y se libera al terminar", async () => {
    const d = diferida();
    const { acciones: a } = montar(undefined, acciones(() => d.promesa));
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "2700");
    await userEvent.dblClick(guardar());

    expect(a.guardarPrecios).toHaveBeenCalledTimes(1);
    expect(guardar()).toHaveTextContent("Guardando…");
    expect(guardar()).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Descartar" })).toBeDisabled();

    await act(async () => d.resolver(ok));
    expect(await screen.findByText(/Guardamos 1 precio/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Guardando/ })).not.toBeInTheDocument();
  });

  it("rechazo del servidor a mitad del guardado: muestra su texto, los cambios siguen marcados y el botón vuelve como «Reintentar»", async () => {
    let intento = 0;
    const { acciones: a } = montar(
      undefined,
      acciones(() => (++intento === 1 ? { ok: false, causa: "rechazado", mensaje: "Algún precio no es válido. Revisá los cambios marcados." } : ok)),
    );
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "2700");
    await userEvent.click(guardar());

    expect(await screen.findByRole("alert")).toHaveTextContent("Algún precio no es válido. Revisá los cambios marcados.");
    expect(screen.getByText("1 cambio sin guardar")).toBeInTheDocument();
    expect(guardar()).toHaveTextContent("Reintentar");
    expect(guardar()).not.toHaveAttribute("aria-disabled");
    expect(campo("Salud y Hogar")).toHaveValue("2700");

    await userEvent.click(guardar());
    expect(a.guardarPrecios).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/Guardamos 1 precio/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("falla inesperada (la acción revienta): texto genérico, nada trabado y se puede reintentar", async () => {
    let intento = 0;
    montar(
      undefined,
      acciones(() => {
        if (++intento === 1) throw new Error("boom");
        return ok;
      }),
    );
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "2700");
    await userEvent.click(guardar());
    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos guardar los cambios. Siguen marcados: probá de nuevo.");
    expect(guardar()).toHaveTextContent("Reintentar");
    await userEvent.click(guardar());
    expect(await screen.findByText(/Guardamos 1 precio/)).toBeInTheDocument();
  });

  it("sesión vencida: avisa y ofrece entrar de nuevo, sin perder los cambios", async () => {
    montar(
      undefined,
      acciones(() => {
        throw new Error(marcaDeRechazo("vencida"));
      }),
    );
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "2700");
    await userEvent.click(guardar());
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Tu sesión venció. Volvé a entrar para seguir.");
    expect(within(alerta).getByRole("link")).toBeInTheDocument();
    expect(campo("Salud y Hogar")).toHaveValue("2700");
    expect(guardar()).not.toHaveAttribute("aria-disabled");
  });

  it("sesión vencida que la base devuelve como resultado: el mismo aviso, el enlace y los cambios marcados", async () => {
    montar(
      undefined,
      acciones(() => ({ ok: false, causa: "rechazado", mensaje: "Tu sesión venció. Volvé a entrar para seguir.", sesionVencida: true })),
    );
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "2700");
    await userEvent.click(guardar());
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Tu sesión venció. Volvé a entrar para seguir.");
    expect(within(alerta).getByRole("link")).toBeInTheDocument();
    expect(campo("Salud y Hogar")).toHaveValue("2700");
    expect(guardar()).not.toHaveAttribute("aria-disabled");
  });

  it("27G·09 · sin conexión al guardar: avisa, deja los cambios y reintenta solo cuando vuelve internet", async () => {
    let intento = 0;
    const { acciones: a } = montar(
      undefined,
      acciones(() => (++intento === 1 ? { ok: false, causa: "sin-conexion" } : ok)),
    );
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "2700");
    await userEvent.click(guardar());

    expect(await screen.findByText(/Sin conexión\. Tus cambios quedan marcados en esta pestaña; se guardan cuando vuelva internet\./)).toBeInTheDocument();
    expect(screen.getByText("1 cambio sin guardar")).toBeInTheDocument();
    expect(guardar()).not.toHaveAttribute("aria-disabled");

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(a.guardarPrecios).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/Guardamos 1 precio/)).toBeInTheDocument();
    expect(screen.queryByText(/Sin conexión/)).not.toBeInTheDocument();
  });

  it("sin conexión: lo que se edita después de la falla NO sale solo al volver internet; se guarda a mano y un cambio grande pide su confirmación", async () => {
    let intento = 0;
    const { acciones: a } = montar(
      undefined,
      acciones(() => (++intento === 1 ? { ok: false, causa: "sin-conexion" } : ok)),
    );
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "2700");
    await userEvent.click(guardar());
    await screen.findByText(/se guardan cuando vuelva internet/);

    // Mientras no hay internet se cambia a un valor que pasa del 20 %.
    escribir("Salud y Hogar", "3600");
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(a.guardarPrecios).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Sin conexión/)).not.toBeInTheDocument();
    expect(campo("Salud y Hogar")).toHaveValue("3600");
    expect(screen.getByText("1 cambio sin guardar")).toBeInTheDocument();

    // A mano: pasa por la confirmación del cambio grande, y recién ahí se manda.
    await userEvent.click(guardar());
    expect(screen.getByRole("dialog", { name: "Revisá los cambios grandes" })).toBeInTheDocument();
    expect(a.guardarPrecios).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Guardar igual" }));
    expect(a.guardarPrecios).toHaveBeenCalledTimes(2);
    expect(a.guardarPrecios.mock.calls[1][1]).toEqual([{ tipo: "PRODUCTO", id: SH.id, precio: 3600 }]);
  });

  it("sin conexión: un valor a medio tipear después de la falla tampoco sale solo", async () => {
    let intento = 0;
    const { acciones: a } = montar(
      undefined,
      acciones(() => (++intento === 1 ? { ok: false, causa: "sin-conexion" } : ok)),
    );
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "2700");
    await userEvent.click(guardar());
    await screen.findByText(/se guardan cuando vuelva internet/);

    escribir("Salud y Hogar", "27");
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(a.guardarPrecios).toHaveBeenCalledTimes(1);
    expect(campo("Salud y Hogar")).toHaveValue("27");
  });

  it("sin conexión: un cambio grande ya confirmado se reintenta solo, sin pedir otra confirmación, y manda lo mismo", async () => {
    let intento = 0;
    const { acciones: a } = montar(
      undefined,
      acciones(() => (++intento === 1 ? { ok: false, causa: "sin-conexion" } : ok)),
    );
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "3600");
    await userEvent.click(guardar());
    await userEvent.click(screen.getByRole("button", { name: "Guardar igual" }));
    await screen.findByText(/se guardan cuando vuelva internet/);

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(a.guardarPrecios).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(a.guardarPrecios.mock.calls[1][1]).toEqual(a.guardarPrecios.mock.calls[0][1]);
    expect(await screen.findByText(/Guardamos 1 precio/)).toBeInTheDocument();
  });

  it("sin conexión: si se vuelve al valor mandado antes de que vuelva internet, se reintenta solo", async () => {
    let intento = 0;
    const { acciones: a } = montar(
      undefined,
      acciones(() => (++intento === 1 ? { ok: false, causa: "sin-conexion" } : ok)),
    );
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "2700");
    await userEvent.click(guardar());
    await screen.findByText(/se guardan cuando vuelva internet/);

    escribir("Salud y Hogar", "2800");
    escribir("Salud y Hogar", "2700");
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(a.guardarPrecios).toHaveBeenCalledTimes(2));
  });

  it("sin conexión desde antes: el botón se frena y el aviso lo explica; al volver, se puede guardar", async () => {
    const { acciones: a } = montar();
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "2700");
    sinConexion(false);
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByText(/Sin conexión\. Tus cambios quedan marcados en esta pestaña; cuando vuelva internet, guardalos con «Guardar cambios»\./)).toBeInTheDocument();
    await userEvent.click(guardar());
    expect(a.guardarPrecios).not.toHaveBeenCalled();

    sinConexion(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByText(/Sin conexión/)).not.toBeInTheDocument();
    await userEvent.click(guardar());
    expect(a.guardarPrecios).toHaveBeenCalledTimes(1);
  });

  it("dos acciones seguidas: lo que se edita mientras otro guardado está en camino no se pierde ni se pisa", async () => {
    const d = diferida();
    let intento = 0;
    const { acciones: a } = montar(
      undefined,
      acciones(() => (++intento === 1 ? d.promesa : ok)),
    );
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "2700");
    await userEvent.click(guardar());
    // Mientras el primero viaja: se toca otra fila, se toca la misma otra vez y se intenta guardar de nuevo.
    await userEvent.click(accion("+ Excepción", "Nuestros Hijos"));
    escribir("Nuestros Hijos", "2000");
    escribir("Salud y Hogar", "2800");
    await userEvent.click(guardar());
    expect(a.guardarPrecios).toHaveBeenCalledTimes(1);

    await act(async () => d.resolver(ok));
    expect(await screen.findByText(/Guardamos 1 precio/)).toBeInTheDocument();
    // Salud y Hogar quedó con lo último que se escribió, y Nuestros Hijos con lo suyo: dos cambios sin guardar.
    expect(campo("Salud y Hogar")).toHaveValue("2800");
    expect(campo("Nuestros Hijos")).toHaveValue("2000");
    expect(screen.getByText("2 cambios sin guardar")).toBeInTheDocument();

    await userEvent.click(guardar());
    expect(a.guardarPrecios).toHaveBeenCalledTimes(2);
    expect(a.guardarPrecios.mock.calls[1][1]).toEqual(
      expect.arrayContaining([
        { tipo: "PRODUCTO", id: SH.id, precio: 2800 },
        { tipo: "PRODUCTO", id: NH.id, precio: 2000 },
      ]),
    );
    await waitFor(() => expect(screen.queryByText(/cambios? sin guardar/)).not.toBeInTheDocument());
  });

  it("al terminar el guardado la fila queda con el valor guardado y sin cambios fantasma", async () => {
    const d = diferida();
    montar(undefined, acciones(() => d.promesa));
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "2700");
    await userEvent.click(guardar());
    await act(async () => d.resolver(ok));
    await screen.findByText(/Guardamos 1 precio/);
    expect(screen.queryByText(/cambios? sin guardar/)).not.toBeInTheDocument();
    expect(campo("Salud y Hogar")).toHaveValue("2700");
  });
});

describe("volver atrás y reentrar", () => {
  it("con cambios sin guardar, «‹ Stock» no sale: avisa; al descartar, sale", async () => {
    montar();
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "2700");
    expect(hayTrabajoPendiente()).toBe(true);

    await userEvent.click(screen.getByRole("link", { name: "‹ Stock" }));
    expect(navegacion.push).not.toHaveBeenCalled();
    expect(await screen.findByText(TEXTO_SALIR_CON_CAMBIOS)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(screen.queryByText(TEXTO_SALIR_CON_CAMBIOS)).not.toBeInTheDocument();
    expect(hayTrabajoPendiente()).toBe(false);
  });

  it("sin cambios, «‹ Stock» es un enlace común a /stock", () => {
    montar();
    expect(screen.getByRole("link", { name: "‹ Stock" })).toHaveAttribute("href", "/stock");
  });

  it("al reentrar la vista arranca limpia y no deja trabajo pendiente del paso anterior", async () => {
    const primera = montar();
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "2700");
    primera.unmount();
    expect(hayTrabajoPendiente()).toBe(false);

    montar();
    expect(pestana(/^General$/)).toHaveAttribute("aria-selected", "true");
    await abrir(/^Montevideo/);
    expect(campo("Salud y Hogar")).toHaveValue("2600");
    expect(screen.queryByText(/cambios? sin guardar/)).not.toBeInTheDocument();
  });

  it("guardar cambia lo pendiente: después de guardar ya no se frena la salida", async () => {
    montar();
    await abrir(/^Montevideo/);
    escribir("Salud y Hogar", "2700");
    await userEvent.click(guardar());
    await screen.findByText(/Guardamos 1 precio/);
    expect(hayTrabajoPendiente()).toBe(false);
  });
});

describe("estados vacíos y datos límite", () => {
  it("27G·06b · sin precios generales: el texto dice por qué los colportores no ven productos", () => {
    const datos = crearDatosDePreciosSimulados();
    datos.items = datos.items.map((i) => ({ ...i, precioGeneral: null }));
    montar(datos);
    expect(screen.getByText(TEXTO_SIN_PRECIOS_GENERALES)).toBeInTheDocument();
    expect(screen.getByText("El precio de todo el país.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("sin productos en el catálogo: el mismo estado vacío, sin romper", async () => {
    const datos = crearDatosDePreciosSimulados();
    datos.items = [];
    datos.excepciones = { [MONTEVIDEO.id]: {}, [LAS_PIEDRAS.id]: {} };
    montar(datos);
    expect(screen.getByText(TEXTO_SIN_PRECIOS_GENERALES)).toBeInTheDocument();
    await abrir(/^Montevideo/);
    expect(screen.getByText(TEXTO_SIN_PRECIOS_GENERALES)).toBeInTheDocument();
  });

  it("campaña sin ciudades: lo dice y manda a Ciudades, sin pestañas", () => {
    const datos = crearDatosDePreciosSimulados();
    datos.ciudades = [];
    datos.excepciones = {};
    montar(datos);
    expect(screen.getByText(TEXTO_SIN_CIUDADES)).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "‹ Stock" })).toBeInTheDocument();
  });

  it("nombres larguísimos y muchas filas se muestran enteros", async () => {
    const largo = "Un título larguísimo ".repeat(12).trim();
    const datos = crearDatosDePreciosSimulados();
    const base = ITEMS_SIMULADOS[0];
    datos.items = [
      { ...base, nombre: largo },
      ...Array.from({ length: 150 }, (_, n) => ({ ...base, id: `x-${n}`, clave: `PRODUCTO:x-${n}`, nombre: `Producto ${n}`, codigo: `P-${n}` })),
    ];
    datos.excepciones = { [MONTEVIDEO.id]: {}, [LAS_PIEDRAS.id]: {} };
    montar(datos);
    expect(screen.getByText(largo)).toBeInTheDocument();
    expect(screen.getAllByRole("row").length).toBeGreaterThan(150);
    await abrir(/^Montevideo/);
    expect(screen.getByRole("button", { name: `+ Excepción: ${largo}` })).toBeInTheDocument();
  });

  it("un producto bonificable sin general y sin excepción «No se ofrece»; con excepción se vende", async () => {
    const datos = crearDatosDePreciosSimulados();
    datos.items = datos.items.map((i) => (i.clave === NH.clave ? { ...i, precioGeneral: null } : i));
    const { acciones: a } = montar(datos);
    await abrir(/^Las Piedras/);
    const fila = screen.getByRole("row", { name: /Nuestros Hijos/ });
    expect(fila).toHaveTextContent("No se ofrece");
    await userEvent.click(accion("+ Excepción", "Nuestros Hijos"));
    expect(campo("Nuestros Hijos", "Las Piedras")).toHaveValue("");
    escribir("Nuestros Hijos", "2100", "Las Piedras");
    expect(screen.getByRole("row", { name: /Nuestros Hijos/ })).toHaveTextContent("Modificado");
    await userEvent.click(guardar());
    expect(a.guardarPrecios).toHaveBeenCalledWith(LAS_PIEDRAS.id, [{ tipo: "PRODUCTO", id: NH.id, precio: 2100 }]);
  });

  it("un combo con componentes dados de baja avisa que no se ofrece", () => {
    const datos = crearDatosDePreciosSimulados();
    datos.items = datos.items.map((i) => (i.clave === COL1.clave ? { ...i, componentesDeBaja: 2 } : i));
    montar(datos);
    expect(screen.getByText("2 componentes están dados de baja: el combo no se ofrece hasta que Administración lo corrija.")).toBeInTheDocument();
    expect(textoDeComponentesDeBaja(1)).toBe("1 componente está dado de baja: el combo no se ofrece hasta que Administración lo corrija.");
  });
});
