import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AccionesPrecios, CambioDePrecio, DatosDePrecios, ResultadoDeGuardado } from "@/datos/precios";
import { crearDatosDePreciosSimulados, ITEMS_SIMULADOS } from "@/datos/precios/simulado";
import { CIUDADES_PARA_BUSCAR, ETIQUETA_BUSCAR_CIUDAD, textoSinCoincidencias } from "@/lib/buscar-ciudades";
import { reiniciarTrabajoPendiente } from "@/shell/trabajo-pendiente";

import { PreciosVista } from "./PreciosVista";

/**
 * QA de #217 (buscador de ciudades en las pestañas de Precios, vista 27): los casos límite que el implementador no probó —foco al
 * recorrer con flechas una pestaña que se reordena, texto de solo espacios, caracteres especiales, ids repetidos, cambios sin
 * guardar que sobreviven a Enter y datos límite (0, 1, 9 ciudades).
 */

const navegacion = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: navegacion.push }) }));

const ESPECIALES = ["Paysandú", "Villa Paysandú", "Salto", "San José de Mayo"];

function datosConCiudades(cantidad: number, nombres?: string[]): DatosDePrecios {
  const base = crearDatosDePreciosSimulados();
  const lista = nombres ?? [...Array.from({ length: Math.max(0, cantidad - ESPECIALES.length) }, (_, i) => `Pueblo ${String(i + 1).padStart(3, "0")}`), ...ESPECIALES].slice(0, cantidad);
  return { ...base, ciudades: lista.map((nombre, i) => ({ id: `c-${i}`, nombre })), excepciones: {} };
}

const ok: ResultadoDeGuardado = { ok: true };
function acciones(responder: (c: string, cambios: CambioDePrecio[]) => Promise<ResultadoDeGuardado> | ResultadoDeGuardado = () => ok) {
  const guardarPrecios = vi.fn(async (ciudadId: string, cambios: CambioDePrecio[]) => responder(ciudadId, cambios));
  return { guardarPrecios } satisfies AccionesPrecios;
}
const montar = (datos: DatosDePrecios, a: AccionesPrecios = acciones()) => render(<PreciosVista datos={datos} acciones={a} />);

const buscador = () => screen.getByRole("searchbox", { name: ETIQUETA_BUSCAR_CIUDAD });
const pestanas = () => screen.getAllByRole("tab").map((p) => (p.textContent ?? "").trim());
const escribir = (texto: string) => fireEvent.change(buscador(), { target: { value: texto } });
const SH = ITEMS_SIMULADOS.find((i) => i.codigo === "SH-12")!;

/** Deja a Salto con un cambio sin guardar y a «San José de Mayo» abierta. */
async function conSaltoSinGuardar(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.click(screen.getByRole("tab", { name: /^Salto$/ }));
  await usuario.click(screen.getByRole("button", { name: `+ Excepción: ${SH.nombre}` }));
  fireEvent.change(screen.getByRole("textbox", { name: `Precio de ${SH.nombre} en Salto` }), { target: { value: "2500" } });
}

const original = Element.prototype.scrollIntoView;
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn() as unknown as Element["scrollIntoView"];
});
afterEach(() => {
  Element.prototype.scrollIntoView = original;
  reiniciarTrabajoPendiente();
  navegacion.push.mockReset();
  vi.restoreAllMocks();
});

describe("QA #217 · Precios: buscador, casos límite", () => {
  it("una búsqueda de solo espacios no filtra: todas las pestañas, el recuento sin buscar y Enter no cambia de pestaña", async () => {
    const usuario = userEvent.setup();
    montar(datosConCiudades(150));
    await usuario.click(buscador());
    await usuario.keyboard("    {Enter}");
    expect(screen.getAllByRole("tab")).toHaveLength(151);
    expect(screen.getByText("150 ciudades")).toBeInTheDocument();
    expect(screen.queryByText(/Ninguna ciudad de la campaña coincide/)).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute("aria-selected", "true");
  });

  it.each(["(", "[", "\\", ".*", "a|b", "+", "?", "😀", "Pay%", "<script>", "ñ́"])("el texto «%s» no rompe la búsqueda", (texto) => {
    montar(datosConCiudades(150));
    expect(() => escribir(texto)).not.toThrow();
    expect(screen.getByRole("tablist", { name: "Precios por ciudad" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "General" })).toBeInTheDocument();
  });

  it("un texto de 5000 caracteres pegado no cuelga ni deja pestañas de más", () => {
    montar(datosConCiudades(150));
    const largo = "ab ".repeat(1700);
    escribir(largo);
    expect(screen.getByText(textoSinCoincidencias(largo))).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(1);
  });

  it("las pestañas no repiten ids con la abierta, la que coincide y la de cambios sin guardar a la vez", async () => {
    const usuario = userEvent.setup();
    montar(datosConCiudades(150));
    await conSaltoSinGuardar(usuario);
    await usuario.click(screen.getByRole("tab", { name: /^Paysandú$/ }));
    escribir("san");
    const ids = screen.getAllByRole("tab").map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const paneles = screen.getAllByRole("tabpanel");
    expect(paneles).toHaveLength(1);
    expect(paneles[0].getAttribute("aria-labelledby")).toBe(screen.getByRole("tab", { name: /^Paysandú$/ }).id);
  });

  it("el cambio sin guardar de la ciudad abierta sobrevive a abrir otra con Enter y volver", async () => {
    const usuario = userEvent.setup();
    montar(datosConCiudades(150));
    await conSaltoSinGuardar(usuario);
    await usuario.click(buscador());
    await usuario.keyboard("{Control>}a{/Control}pays{Enter}");
    expect(screen.getByRole("tab", { name: /^Paysandú$/ })).toHaveAttribute("aria-selected", "true");
    // Salto ya no coincide, pero tiene cambios: sigue a la vista con su marca.
    const salto = screen.getByRole("tab", { name: /^Salto 1 sin guardar$/ });
    await usuario.click(salto);
    expect(screen.getByRole("textbox", { name: `Precio de ${SH.nombre} en Salto` })).toHaveValue("2500");
    expect(screen.getByRole("button", { name: /^Guardar cambios$/ })).toBeEnabled();
  });

  it("recorrer con flechas hacia la ciudad de cambios sin guardar (que se reordena) deja el foco en la pestaña, no en el <body>", async () => {
    const usuario = userEvent.setup();
    montar(datosConCiudades(150));
    await conSaltoSinGuardar(usuario);
    await usuario.click(screen.getByRole("tab", { name: /^Paysandú$/ }));
    escribir("villa");
    // Orden visible: General · Paysandú (abierta) · Villa Paysandú · Salto (sin guardar, al final).
    expect(pestanas()).toEqual(["General", "Paysandú", "Villa Paysandú", "Salto 1 sin guardar"]);
    screen.getByRole("tab", { name: /^Paysandú$/ }).focus();
    await usuario.keyboard("{End}");
    const salto = screen.getByRole("tab", { name: /^Salto 1 sin guardar$/ });
    expect(salto).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(salto);
  });

  it("recorrer con flechas no deja dos pestañas en la secuencia de Tab (solo la abierta)", async () => {
    const usuario = userEvent.setup();
    montar(datosConCiudades(150));
    escribir("san");
    screen.getByRole("tab", { name: "General" }).focus();
    await usuario.keyboard("{ArrowRight}");
    const conTab = screen.getAllByRole("tab").filter((t) => t.getAttribute("tabindex") === "0");
    expect(conTab).toHaveLength(1);
    expect(conTab[0]).toHaveAttribute("aria-selected", "true");
  });

  it("al borrar la búsqueda con la ciudad abierta, vuelven todas en el orden de la fuente y la abierta sigue marcada", async () => {
    const usuario = userEvent.setup();
    montar(datosConCiudades(150));
    await usuario.click(buscador());
    await usuario.keyboard("salto{Enter}");
    escribir("");
    const todas = pestanas();
    expect(todas).toHaveLength(151);
    expect(todas[1]).toBe("Pueblo 001");
    expect(screen.getByRole("tab", { name: /^Salto$/ })).toHaveAttribute("aria-selected", "true");
  });

  it("guardar con falla estando buscando deja el botón otra vez habilitado, la búsqueda y lo tipeado", async () => {
    const usuario = userEvent.setup();
    const a = acciones(() => ({ ok: false, causa: "sin-conexion" }));
    montar(datosConCiudades(150), a);
    escribir("salto");
    await conSaltoSinGuardar(usuario);
    const guardar = screen.getByRole("button", { name: /^Guardar cambios$/ });
    await usuario.click(guardar);
    expect(a.guardarPrecios).toHaveBeenCalledTimes(1);
    expect(buscador()).toHaveValue("salto");
    expect(screen.getByRole("textbox", { name: `Precio de ${SH.nombre} en Salto` })).toHaveValue("2500");
    expect(screen.getByRole("button", { name: /^Guardar cambios$/ })).toBeEnabled();
  });

  it("datos límite: 0, 1 y 9 ciudades (una más que el umbral) no rompen la vista", () => {
    const { unmount } = montar(datosConCiudades(0, []));
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.getByText(/todavía no tiene ciudades/)).toBeInTheDocument();
    unmount();
    const uno = montar(datosConCiudades(1, ["Salto"]));
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    uno.unmount();
    montar(datosConCiudades(CIUDADES_PARA_BUSCAR + 1));
    expect(buscador()).toBeInTheDocument();
    expect(screen.getByText(`${CIUDADES_PARA_BUSCAR + 1} ciudades`)).toBeInTheDocument();
  });

  it("dos ciudades con el mismo nombre se distinguen y las dos se ven al buscar", () => {
    montar(datosConCiudades(10, ["Rivera", "Rivera", ...Array.from({ length: 8 }, (_, i) => `Otra ${i}`)]));
    escribir("rivera");
    expect(pestanas()).toEqual(["General", "Rivera", "Rivera"]);
  });

  it("un nombre de ciudad larguísimo sin espacios no deja la pestaña sin su recuento ni rompe el tablist", () => {
    const largo = "Z".repeat(200);
    montar(datosConCiudades(10, [largo, ...Array.from({ length: 9 }, (_, i) => `Otra ${i}`)]));
    escribir("zzz");
    expect(pestanas()).toEqual(["General", largo]);
  });

  it("reentrar (desmontar y montar) empieza sin búsqueda y con todas las pestañas", () => {
    const { unmount } = montar(datosConCiudades(150));
    escribir("salto");
    unmount();
    montar(datosConCiudades(150));
    expect(buscador()).toHaveValue("");
    expect(screen.getAllByRole("tab")).toHaveLength(151);
  });
});
