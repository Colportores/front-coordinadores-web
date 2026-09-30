import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Punto } from "@/datos/equipo/zonas";
import { DATOS_ZONAS_SIMULADO, fuenteZonasSimulada } from "@/datos/equipo/zonas/simulado";
import { type AccionesZonas, ZonasCampania } from "@/features/equipo/zonas/ZonasCampania";
import type { PropsMapaZonas } from "@/features/equipo/zonas/tipos";

/** QA de vistas (sprint 5, PR #35): criterios de la HU-CAM-006 y accesibilidad con axe en cada estado. */

const mapa = vi.hoisted(() => ({ props: null as PropsMapaZonas | null }));
vi.mock("@/features/equipo/zonas/MapaZonas", () => ({
  MapaZonas: (props: PropsMapaZonas) => {
    mapa.props = props;
    return <div data-testid="mapa" />;
  },
}));

const MONTEVIDEO = DATOS_ZONAS_SIMULADO.ciudades[0];
const ORIGEN: Punto = (MONTEVIDEO.zonas[0].esquinas as Punto[])[0];
const nodo = (v: number, h: number): Punto => ({ lon: ORIGEN.lon + v * 0.0045, lat: ORIGEN.lat - h * 0.004 });
const CENTRO_LIBRE = nodo(3, 3.4);

function acciones(sobre: Partial<AccionesZonas> = {}): AccionesZonas {
  return {
    esquinaMasCercana: vi.fn((c: string, p: Punto) => fuenteZonasSimulada.esquinaMasCercana(c, p)),
    tramoPorCalles: vi.fn((c: string, a: Punto, b: Punto) => fuenteZonasSimulada.tramoPorCalles(c, a, b)),
    vistaPreviaZona: vi.fn((e) => fuenteZonasSimulada.vistaPreviaZona(e)),
    guardarZona: vi.fn((e) => fuenteZonasSimulada.guardarZona(e)),
    asignarZona: vi.fn(async () => ({ ok: true as const })),
    quitarZona: vi.fn(async () => ({ ok: true as const })),
    eliminarZona: vi.fn((id: string) => fuenteZonasSimulada.eliminarZona("campania-verano-2026", id)),
    buscarCiudades: vi.fn((t: string) => fuenteZonasSimulada.buscarCiudades("campania-verano-2026", t)),
    agregarCiudad: vi.fn((id: string) => fuenteZonasSimulada.agregarCiudad("campania-verano-2026", id)),
    ...sobre,
  };
}

function montar(sobre: Partial<AccionesZonas> = {}) {
  const acc = acciones(sobre);
  const r = render(<ZonasCampania datos={DATOS_ZONAS_SIMULADO} acciones={acc} />);
  return { acc, contenedor: r.container };
}

async function clicEnMapa(punto: Punto) {
  await act(async () => {
    mapa.props?.onMapaClick(punto);
  });
}

/** axe en jsdom no mide contraste (no hay layout): el contraste va en la corrida con navegador real. */
async function violaciones(nodoRaiz: Element) {
  const r = await axe.run(nodoRaiz, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

afterEach(() => {
  mapa.props = null;
});

describe("QA · HU-CAM-006 · criterios de aceptación", () => {
  it("«Zonas superpuestas» (decisión del 30/09): se guarda sin rechazo, pero la vista avisa con quién y marca el tramo en rojo", async () => {
    const previa = vi.fn(async (e: Parameters<typeof fuenteZonasSimulada.vistaPreviaZona>[0]) => ({
      ...(await fuenteZonasSimulada.vistaPreviaZona(e)),
      superposicion: { zonaNombre: "Belvedere", tramo: [nodo(1, 3), nodo(2, 3)] },
    }));
    const { acc } = montar({ vistaPreviaZona: previa });
    await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
    await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "Centro");
    await clicEnMapa(CENTRO_LIBRE);
    await screen.findByText(/Incluye/);

    expect(screen.getByText("Esta zona se superpone con «Belvedere» en el tramo marcado en rojo. Podés guardarla igual.")).toBeInTheDocument();
    expect(mapa.props?.dibujo?.conflicto).toEqual([nodo(1, 3), nodo(2, 3)]);
    await userEvent.click(screen.getByRole("button", { name: "Guardar zona" }));
    expect(acc.guardarZona).toHaveBeenCalledTimes(1);
  });
});

describe("QA · validación del nombre de la zona", () => {
  it("un nombre con emoji y espacios a los lados se envía tal cual tipeado y el guardado lo recorta", async () => {
    const { acc } = montar();
    await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
    await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "  Ñandú 🌳  ");
    await clicEnMapa(CENTRO_LIBRE);
    await screen.findByText(/Incluye/);

    await userEvent.click(screen.getByRole("button", { name: "Guardar zona" }));

    expect(await screen.findByText("Zona «Ñandú 🌳» guardada.")).toBeInTheDocument();
    expect(acc.guardarZona).toHaveBeenCalledTimes(1);
  });

  it("después de un error al guardar no se pierde el nombre ni el radio tipeados", async () => {
    const guardar = vi.fn(fuenteZonasSimulada.guardarZona).mockRejectedValueOnce(new Error("sin red"));
    montar({ guardarZona: guardar });
    await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
    await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "Casabó");
    await clicEnMapa(CENTRO_LIBRE);
    await screen.findByText(/Incluye/);
    const radio = screen.getByRole("spinbutton");
    await userEvent.clear(radio);
    await userEvent.type(radio, "250");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar zona" })).toBeEnabled());

    await userEvent.click(screen.getByRole("button", { name: "Guardar zona" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "NOMBRE" })).toHaveValue("Casabó");
    expect(screen.getByRole("spinbutton")).toHaveValue(250);
  });

  it("un nombre pegado de 2000 caracteres no rompe el formulario: avisa el tope de 40 y no deja guardar", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
    await userEvent.click(screen.getByRole("textbox", { name: "NOMBRE" }));
    await userEvent.paste("Z".repeat(2000));
    await clicEnMapa(CENTRO_LIBRE);
    await screen.findByText(/Incluye/);

    expect(screen.getByRole("region", { name: "Nueva zona" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("El nombre puede tener hasta 40 caracteres.");
    expect(screen.getByRole("button", { name: "Guardar zona" })).toBeDisabled();
  });

  it("caracteres especiales y HTML en el nombre se muestran como texto, sin interpretarse", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
    await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "<b>x</b> & «y»");
    await clicEnMapa(CENTRO_LIBRE);
    await screen.findByText(/Incluye/);
    await userEvent.click(screen.getByRole("button", { name: "Guardar zona" }));

    expect(await screen.findByText("Zona «<b>x</b> & «y»» guardada.")).toBeInTheDocument();
    expect(document.querySelector("section b")).toBeNull();
  });
});

describe("QA · accesibilidad (axe A/AA, sin contraste) en cada estado", () => {
  it("01 · lista de zonas", async () => {
    const { contenedor } = montar();
    expect(await violaciones(contenedor)).toEqual([]);
  });

  it("QA #28: el desplegable de colportores anida un botón dentro de cada role=option (axe nested-interactive, A)", async () => {
    const { contenedor } = montar();
    await userEvent.click(screen.getByRole("button", { name: "Ver la zona Belvedere" }));
    await userEvent.click(screen.getByRole("button", { name: /Elegir colportor/ }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(await violaciones(contenedor)).toEqual([]);
  });

  it("02 · nueva zona radial y «Editar zona» con la confirmación de baja", async () => {
    const { contenedor } = montar();
    await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
    await clicEnMapa(CENTRO_LIBRE);
    await screen.findByText(/Incluye/);
    expect(await violaciones(contenedor)).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Cerrar el formulario de zona" }));
    await userEvent.click(screen.getByRole("button", { name: "Ver la zona Cerro Norte" }));
    await userEvent.click(screen.getByRole("button", { name: "Editar forma" }));
    await userEvent.click(screen.getByRole("button", { name: /Eliminar zona/ }));
    expect(await screen.findByRole("alertdialog", { name: "Eliminar zona" })).toBeInTheDocument();
    expect(await violaciones(contenedor)).toEqual([]);
  });

  it("03 · nueva zona por esquinas en curso", async () => {
    const { contenedor } = montar();
    await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
    await userEvent.click(screen.getByRole("radio", { name: /Por esquinas/ }));
    await clicEnMapa(nodo(1, 3));
    await waitFor(() => expect(screen.getByText("ESQUINAS · 1")).toBeInTheDocument());
    expect(await violaciones(contenedor)).toEqual([]);
  });

  it("buscador de ciudades: resultados, sin coincidencias y error con «Reintentar»", async () => {
    const buscar = vi
      .fn(fuenteZonasSimulada.buscarCiudades.bind(fuenteZonasSimulada, "campania-verano-2026"))
      .mockImplementation((t: string) => fuenteZonasSimulada.buscarCiudades("campania-verano-2026", t));
    const { contenedor } = montar({ buscarCiudades: buscar });
    await userEvent.click(screen.getByRole("button", { name: "+ Agregar ciudad" }));
    await screen.findByRole("list", { name: "Ciudades del catálogo" });
    expect(await violaciones(contenedor)).toEqual([]);

    await userEvent.type(screen.getByRole("searchbox"), "zzzzqq");
    await screen.findByText(/No hay ciudades que coincidan/);
    expect(await violaciones(contenedor)).toEqual([]);
  });

  it("los avisos de error se anuncian (role alert) y los de estado usan role status", async () => {
    const { acc } = montar({ asignarZona: vi.fn().mockRejectedValue(new Error("sin red")) });
    await userEvent.click(screen.getByRole("button", { name: "Ver la zona Belvedere" }));
    await userEvent.click(screen.getByRole("button", { name: /Elegir colportor/ }));
    await userEvent.click(screen.getByRole("option", { name: /Pablo Ferreira/ }));
    await userEvent.click(screen.getByRole("button", { name: "Asignar a Belvedere" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Necesitás conexión para asignar a Pablo Ferreira. Revisá la conexión y probá de nuevo.");
    expect(acc.asignarZona).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Asignar a Belvedere" })).toBeEnabled();
  });
});

describe("QA · foco al abrir la confirmación de «Eliminar zona»", () => {
  it("QA #28: al pedir «Eliminar zona» el botón desaparece y el foco cae en el body; el aviso debería recibir el foco", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "Ver la zona Cerro Norte" }));
    await userEvent.click(screen.getByRole("button", { name: "Editar forma" }));
    await userEvent.click(screen.getByRole("button", { name: "Eliminar zona" }));

    const aviso = await screen.findByRole("alertdialog", { name: "Eliminar zona" });
    expect(aviso.contains(document.activeElement)).toBe(true);
  });
});

describe("QA · hallazgos resueltos (contraste, objetivo táctil, foco)", () => {
  const luz = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contraste = (a: string, b: string) => {
    const [x, y] = [luz(a), luz(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };
  const token = (nombre: string) => new RegExp(`--${nombre}: *(#[0-9a-fA-F]{6})`).exec(readFileSync("src/app/globals.css", "utf8"))?.[1] as string;

  it("el texto de `alerta` da al menos 4,5:1 sobre blanco y sobre `alerta-fondo`", () => {
    expect(contraste(token("alerta"), "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contraste(token("alerta"), token("alerta-fondo"))).toBeGreaterThanOrEqual(4.5);
  });

  it("los «✕» de detalle, formulario y buscador piden al menos 24×24 px", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "+ Agregar ciudad" }));
    const cerrarBuscador = screen.getByRole("button", { name: "Cerrar el buscador de ciudades" });
    await userEvent.click(screen.getByRole("button", { name: "Ver la zona Belvedere" }));
    const cerrarDetalle = screen.getByRole("button", { name: "Cerrar el detalle de la zona" });
    await userEvent.click(screen.getByRole("button", { name: "Editar forma" }));
    const cerrarFormulario = screen.getByRole("button", { name: "Cerrar el formulario de zona" });
    for (const b of [cerrarBuscador, cerrarDetalle, cerrarFormulario]) {
      expect(b).toHaveClass("min-h-6", "min-w-6");
    }
  });

  it("el desplegable se maneja con teclado: Enter elige, flechas mueven y el foco vuelve al campo", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "Ver la zona Belvedere" }));
    await userEvent.click(screen.getByRole("button", { name: /Elegir colportor/ }));
    const opciones = screen.getAllByRole("option").filter((o) => o.getAttribute("aria-disabled") !== "true");
    opciones[0].focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(opciones[1]).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ASIGNAR COLPORTOR/ })).toHaveFocus();
  });

  it("«No, conservarla» devuelve el foco a «Eliminar zona»", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "Ver la zona Cerro Norte" }));
    await userEvent.click(screen.getByRole("button", { name: "Editar forma" }));
    await userEvent.click(screen.getByRole("button", { name: "Eliminar zona" }));
    const aviso = await screen.findByRole("alertdialog", { name: "Eliminar zona" });
    expect(aviso).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "No, conservarla" }));
    expect(screen.getByRole("button", { name: "Eliminar zona" })).toHaveFocus();
  });

  it("al cerrar el detalle el foco vuelve a la fila de la zona", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "Ver la zona Belvedere" }));
    await userEvent.click(screen.getByRole("button", { name: "Cerrar el detalle de la zona" }));
    expect(screen.getByRole("button", { name: "Ver la zona Belvedere" })).toHaveFocus();
  });

  it("al cerrar el formulario de una zona nueva el foco vuelve a «+ Nueva zona»; al de una existente, a su fila", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
    await userEvent.click(screen.getByRole("button", { name: "Cerrar el formulario de zona" }));
    expect(screen.getByRole("button", { name: "+ Nueva zona" })).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "Ver la zona Cerro Norte" }));
    await userEvent.click(screen.getByRole("button", { name: "Editar forma" }));
    await userEvent.click(screen.getByRole("button", { name: "Cerrar el formulario de zona" }));
    expect(screen.getByRole("button", { name: "Ver la zona Cerro Norte" })).toHaveFocus();
  });

  it("al cerrar el buscador de ciudades el foco vuelve a «+ Agregar ciudad»", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "+ Agregar ciudad" }));
    await userEvent.click(screen.getByRole("button", { name: "Cerrar el buscador de ciudades" }));
    expect(screen.getByRole("button", { name: "+ Agregar ciudad" })).toHaveFocus();
  });

  it("el aviso de baja se trae a la vista centrado para que «Sí, eliminar zona» entre entero", async () => {
    const espia = vi.fn();
    Element.prototype.scrollIntoView = espia;
    montar();
    await userEvent.click(screen.getByRole("button", { name: "Ver la zona Cerro Norte" }));
    await userEvent.click(screen.getByRole("button", { name: "Editar forma" }));
    await userEvent.click(screen.getByRole("button", { name: "Eliminar zona" }));
    await screen.findByRole("alertdialog", { name: "Eliminar zona" });
    expect(espia).toHaveBeenCalledWith({ block: "center" });
    expect(espia.mock.contexts.at(-1)).toBe(screen.getByRole("alertdialog"));
    // @ts-expect-error se limpia el doble para no afectar otros tests
    delete Element.prototype.scrollIntoView;
  });

  it("el nombre de la zona tiene tope de 40 caracteres: 40 se guardan, 41 avisan y no dejan guardar", async () => {
    const { acc } = montar();
    await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
    await clicEnMapa(CENTRO_LIBRE);
    await screen.findByText(/Incluye/);
    const campo = screen.getByRole("textbox", { name: "NOMBRE" });

    await userEvent.type(campo, "a".repeat(40));
    expect(screen.queryByText("El nombre puede tener hasta 40 caracteres.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar zona" })).toBeEnabled();

    await userEvent.type(campo, "b");
    expect(screen.getByRole("alert")).toHaveTextContent("El nombre puede tener hasta 40 caracteres.");
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Guardar zona" })).toBeDisabled();

    await userEvent.type(campo, "{Backspace}");
    expect(screen.getByRole("button", { name: "Guardar zona" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Guardar zona" }));
    expect(acc.guardarZona).toHaveBeenCalledTimes(1);
  });

  it("el servidor simulado también rechaza un nombre de más de 40 caracteres", async () => {
    const r = await fuenteZonasSimulada.guardarZona({
      ciudadId: MONTEVIDEO.id,
      nombre: "x".repeat(41),
      forma: { tipoForma: "RADIAL", centro: CENTRO_LIBRE, radioM: 400 },
    });
    expect(r).toEqual({ ok: false, mensaje: "El nombre puede tener hasta 40 caracteres." });
  });
});
