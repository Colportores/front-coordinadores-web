import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AccionesPrecios, CambioDePrecio, DatosDePrecios, ResultadoDeGuardado } from "@/datos/precios";
import { crearDatosDePreciosSimulados, ITEMS_SIMULADOS } from "@/datos/precios/simulado";
import { CIUDADES_PARA_BUSCAR, ETIQUETA_BUSCAR_CIUDAD, textoSinCoincidencias } from "@/lib/buscar-ciudades";
import { reiniciarTrabajoPendiente } from "@/shell/trabajo-pendiente";

import { pestanasVisibles } from "./modelo";
import { PreciosVista } from "./PreciosVista";

/**
 * Issue #217 (Cristian, «Buscar precios», 24/11): el buscador de ciudades de Ciudades (#189) arriba de las pestañas de ciudad de
 * Precios (vista 27). Mismo umbral, mismo texto, mismo orden y mismo «sin resultados». Retoque chico, sin artboard nuevo.
 */

const navegacion = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: navegacion.push }) }));

const TOTAL = 150;
const ESPECIALES = ["Paysandú", "Villa Paysandú", "Salto", "San José de Mayo"];
const NOMBRES = [...Array.from({ length: TOTAL - ESPECIALES.length }, (_, i) => `Pueblo ${String(i + 1).padStart(3, "0")}`), ...ESPECIALES];

function datosConCiudades(cantidad: number): DatosDePrecios {
  const base = crearDatosDePreciosSimulados();
  const nombres = [...NOMBRES.slice(0, cantidad - ESPECIALES.length), ...ESPECIALES].slice(0, cantidad);
  return { ...base, ciudades: nombres.map((nombre, i) => ({ id: `c-${i}`, nombre })), excepciones: {} };
}

const ok: ResultadoDeGuardado = { ok: true };
function acciones(responder: (c: string, cambios: CambioDePrecio[]) => Promise<ResultadoDeGuardado> | ResultadoDeGuardado = () => ok) {
  const guardarPrecios = vi.fn(async (ciudadId: string, cambios: CambioDePrecio[]) => responder(ciudadId, cambios));
  return { guardarPrecios } satisfies AccionesPrecios;
}

function montar(datos: DatosDePrecios, a: AccionesPrecios = acciones()) {
  return render(<PreciosVista datos={datos} acciones={a} />);
}

const buscador = () => screen.getByRole("searchbox", { name: ETIQUETA_BUSCAR_CIUDAD });
const pestanas = () => screen.getAllByRole("tab").map((p) => (p.textContent ?? "").trim());
const nombresVisibles = () => pestanas().filter((t) => t !== "General");
const escribir = (texto: string) => fireEvent.change(buscador(), { target: { value: texto } });
const SH = ITEMS_SIMULADOS.find((i) => i.codigo === "SH-12")!;

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

describe("#217 · buscador de ciudades en las pestañas de Precios", () => {
  it("hasta el umbral (8 ciudades) no hay campo: se ven todas de un vistazo", () => {
    montar(datosConCiudades(CIUDADES_PARA_BUSCAR));
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(CIUDADES_PARA_BUSCAR + 1);
  });

  it("con más del umbral suma el campo y el recuento, y sin escribir muestra todas las pestañas en el orden de la fuente", () => {
    montar(datosConCiudades(TOTAL));
    expect(buscador()).toHaveValue("");
    expect(screen.getByText("150 ciudades")).toBeInTheDocument();
    const todas = pestanas();
    expect(todas[0]).toBe("General");
    expect(todas).toHaveLength(TOTAL + 1);
    expect(todas.slice(1, 4)).toEqual(["Pueblo 001", "Pueblo 002", "Pueblo 003"]);
    expect(todas.at(-1)).toBe("San José de Mayo");
  });

  it("búsqueda blanda: sin tildes ni mayúsculas, primero las que empiezan con lo escrito y después las que lo contienen, cada grupo A-Z", () => {
    montar(datosConCiudades(TOTAL));
    escribir("PAYSANDU");
    expect(nombresVisibles()).toEqual(["Paysandú", "Villa Paysandú"]);
    expect(screen.getByText("2 de 150 ciudades")).toBeInTheDocument();
  });

  it("buscando se ven «General», la pestaña abierta (aunque no coincida) y las que coinciden", async () => {
    montar(datosConCiudades(TOTAL));
    await userEvent.click(screen.getByRole("tab", { name: /^Salto$/ }));
    escribir("paysandu");
    expect(pestanas()).toEqual(["General", "Salto", "Paysandú", "Villa Paysandú"]);
    expect(screen.getByRole("tab", { name: /^Salto$/ })).toHaveAttribute("aria-selected", "true");
  });

  it("sin coincidencias lo dice con el mismo texto de Ciudades y deja «General» y la abierta; borrar vuelve a todas", async () => {
    montar(datosConCiudades(TOTAL));
    escribir("zzz");
    expect(screen.getByText(textoSinCoincidencias("zzz"))).toBeInTheDocument();
    expect(pestanas()).toEqual(["General"]);
    escribir("");
    expect(screen.queryByText(textoSinCoincidencias("zzz"))).not.toBeInTheDocument();
    expect(pestanas()).toHaveLength(TOTAL + 1);
  });

  it("Enter abre la primera que coincide y Esc borra lo escrito y nada más", async () => {
    const usuario = userEvent.setup();
    montar(datosConCiudades(TOTAL));
    await usuario.click(buscador());
    await usuario.keyboard("san jo{Enter}");
    expect(screen.getByRole("tab", { name: /^San José de Mayo$/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { level: 2, name: "Precios de venta" })).toBeInTheDocument();
    await usuario.keyboard("{Escape}");
    expect(buscador()).toHaveValue("");
    // El Esc de la búsqueda no cambia la pestaña abierta.
    expect(screen.getByRole("tab", { name: /^San José de Mayo$/ })).toHaveAttribute("aria-selected", "true");
  });

  it("Enter sin coincidencias no cambia de pestaña", async () => {
    const usuario = userEvent.setup();
    montar(datosConCiudades(TOTAL));
    await usuario.click(buscador());
    await usuario.keyboard("zzz{Enter}");
    expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute("aria-selected", "true");
  });

  it("las flechas, Inicio y Fin recorren solo las pestañas que se ven", async () => {
    const usuario = userEvent.setup();
    montar(datosConCiudades(TOTAL));
    escribir("paysandu");
    screen.getByRole("tab", { name: "General" }).focus();
    await usuario.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /^Paysandú$/ })).toHaveAttribute("aria-selected", "true");
    await usuario.keyboard("{End}");
    expect(screen.getByRole("tab", { name: /^Villa Paysandú$/ })).toHaveAttribute("aria-selected", "true");
    await usuario.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute("aria-selected", "true");
  });

  it("una ciudad con cambios sin guardar no desaparece al buscar otra: sigue a la vista con su «N sin guardar»", async () => {
    const usuario = userEvent.setup();
    montar(datosConCiudades(TOTAL));
    await usuario.click(screen.getByRole("tab", { name: /^Salto$/ }));
    await usuario.click(screen.getByRole("button", { name: `+ Excepción: ${SH.nombre}` }));
    fireEvent.change(screen.getByRole("textbox", { name: `Precio de ${SH.nombre} en Salto` }), { target: { value: "2500" } });
    await usuario.click(screen.getByRole("tab", { name: /^Paysandú$/ }));
    escribir("villa");
    expect(pestanas()).toEqual(["General", "Paysandú", "Villa Paysandú", "Salto 1 sin guardar"]);
    // Volver a ella y guardar sigue andando.
    await usuario.click(screen.getByRole("tab", { name: /^Salto 1 sin guardar$/ }));
    expect(screen.getByRole("button", { name: /^Guardar cambios$/ })).toBeEnabled();
  });

  it("guardar mientras hay una búsqueda activa guarda la ciudad abierta y la búsqueda queda como estaba", async () => {
    const usuario = userEvent.setup();
    const a = acciones();
    montar(datosConCiudades(TOTAL), a);
    escribir("salto");
    await usuario.click(screen.getByRole("tab", { name: /^Salto$/ }));
    await usuario.click(screen.getByRole("button", { name: `+ Excepción: ${SH.nombre}` }));
    fireEvent.change(screen.getByRole("textbox", { name: `Precio de ${SH.nombre} en Salto` }), { target: { value: "2500" } });
    await usuario.click(screen.getByRole("button", { name: /^Guardar cambios$/ }));
    expect(a.guardarPrecios).toHaveBeenCalledTimes(1);
    expect(a.guardarPrecios.mock.calls[0][0]).toBe("c-148");
    expect(buscador()).toHaveValue("salto");
  });

  it("un texto larguísimo sin espacios y 150 ciudades no rompen la vista: el aviso se ajusta y la fila de pestañas tiene alto fijo con scroll", () => {
    montar(datosConCiudades(TOTAL));
    const largo = "x".repeat(300);
    escribir(largo);
    expect(screen.getByText(textoSinCoincidencias(largo))).toHaveClass("wrap-anywhere");
    expect(screen.getByRole("tablist", { name: "Precios por ciudad" })).toHaveClass("max-h-[132px]", "overflow-y-auto");
  });

  it("trae a la vista la pestaña abierta cuando la fila tiene alto fijo", async () => {
    montar(datosConCiudades(TOTAL));
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    scroll.mockClear();
    await userEvent.click(screen.getByRole("tab", { name: /^Salto$/ }));
    expect(scroll).toHaveBeenCalled();
  });

  it("sin conexión el buscador sigue sirviendo: solo busca entre lo que ya está en pantalla", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    montar(datosConCiudades(TOTAL));
    escribir("salto");
    expect(nombresVisibles()).toEqual(["Salto"]);
  });

  it("textScaler 2.0 (fuente al doble): el campo y el recuento siguen en la vista y no tapan las pestañas", () => {
    document.documentElement.style.fontSize = "32px";
    try {
      montar(datosConCiudades(TOTAL));
      expect(buscador()).toBeVisible();
      expect(screen.getByRole("tablist")).toBeVisible();
    } finally {
      document.documentElement.style.fontSize = "";
    }
  });

  it("accesibilidad (axe) con el buscador y una búsqueda hecha", async () => {
    const { container } = montar(datosConCiudades(TOTAL));
    escribir("paysandu");
    const resultados = await axe.run(container, { rules: { region: { enabled: false } } });
    expect(resultados.violations).toEqual([]);
  });

  it("la lista de pestañas con el buscador sigue siendo un solo tablist con su etiqueta", () => {
    montar(datosConCiudades(TOTAL));
    const lista = screen.getByRole("tablist", { name: "Precios por ciudad" });
    expect(within(lista).getAllByRole("tab")).toHaveLength(TOTAL + 1);
  });
});

describe("pestanasVisibles (modelo)", () => {
  const pestana = (id: string, nombre: string, sinGuardar = 0) => ({ id, nombre, excepciones: null, faltan: null, sinGuardar });
  const lista = [pestana("general", "General"), pestana("a", "Zárate"), pestana("b", "Casa Blanca"), pestana("c", "Blanca")];

  it("sin texto devuelve todas en el orden de la fuente", () => {
    expect(pestanasVisibles(lista, "  ", "general").map((p) => p.id)).toEqual(["general", "a", "b", "c"]);
  });

  it("empiezan antes que contienen; la abierta va primero aunque no coincida", () => {
    expect(pestanasVisibles(lista, "blanca", "general").map((p) => p.id)).toEqual(["general", "c", "b"]);
    expect(pestanasVisibles(lista, "blanca", "a").map((p) => p.id)).toEqual(["general", "a", "c", "b"]);
  });

  it("la abierta no se repite si coincide y queda en su lugar entre las que coinciden", () => {
    expect(pestanasVisibles(lista, "blanca", "b").map((p) => p.id)).toEqual(["general", "c", "b"]);
  });

  it("una ciudad con cambios sin guardar va al final aunque no coincida", () => {
    const con = [pestana("general", "General"), pestana("a", "Zárate", 2), pestana("b", "Casa Blanca")];
    expect(pestanasVisibles(con, "casa", "general").map((p) => p.id)).toEqual(["general", "b", "a"]);
  });
});
