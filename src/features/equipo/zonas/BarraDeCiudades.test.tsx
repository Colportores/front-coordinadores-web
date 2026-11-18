import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import type { CiudadDeCampania } from "@/datos/equipo/zonas";
import {
  BarraDeCiudades,
  CIUDADES_PARA_BUSCAR,
  ciudadesQueCoinciden,
  ETIQUETA_BUSCAR_CIUDAD,
  ordenarCiudades,
  textoSinCoincidencias,
} from "@/features/equipo/zonas/BarraDeCiudades";

/** Issue #186: con decenas o 150 ciudades la barra tiene que dejar encontrar una escribiendo parte del nombre. */

function ciudad(i: number, nombre: string, zonas = 0): CiudadDeCampania {
  return {
    id: `c${i}`,
    catalogoId: `cat${i}`,
    nombre,
    centro: { lon: -56, lat: -34 },
    zoom: 12,
    zonas: Array.from({ length: zonas }, (_, n) => ({ id: `z${i}-${n}` })) as unknown as CiudadDeCampania["zonas"],
    colportores: [],
  };
}

const NOMBRES_CON_ACENTO = ["Paysandú", "Tacuarembó", "Río Branco", "San José de Mayo", "Ciudad de la Costa"];

function muchas(cantidad = 150): CiudadDeCampania[] {
  const base = NOMBRES_CON_ACENTO.map((n, i) => ciudad(i, n, i));
  const resto = Array.from({ length: cantidad - base.length }, (_, i) => ciudad(i + base.length, `Localidad ${String(i).padStart(3, "0")}`));
  return [...base, ...resto];
}

function montar(ciudades: CiudadDeCampania[], ciudadId = ciudades[0]!.id, extra: { deshabilitado?: boolean } = {}) {
  const onElegir = vi.fn();
  const r = render(<BarraDeCiudades ciudades={ciudades} ciudadId={ciudadId} deshabilitado={extra.deshabilitado ?? false} onElegir={onElegir} />);
  return { onElegir, ...r };
}

const botonesDeCiudad = () => within(screen.getByTestId("botones-de-ciudades")).getAllByRole("button");

describe("ciudadesQueCoinciden · búsqueda blanda", () => {
  const ciudades = muchas();

  it("no distingue mayúsculas ni tildes", () => {
    expect(ciudadesQueCoinciden(ciudades, "PAYSANDU").map((c) => c.nombre)).toEqual(["Paysandú"]);
    expect(ciudadesQueCoinciden(ciudades, "rio branco").map((c) => c.nombre)).toEqual(["Río Branco"]);
    expect(ciudadesQueCoinciden(ciudades, "tacuarembo").map((c) => c.nombre)).toEqual(["Tacuarembó"]);
  });

  it("coincide con una parte cualquiera del nombre y colapsa espacios", () => {
    expect(ciudadesQueCoinciden(ciudades, "jose de").map((c) => c.nombre)).toEqual(["San José de Mayo"]);
    expect(ciudadesQueCoinciden(ciudades, "  costa ").map((c) => c.nombre)).toEqual(["Ciudad de la Costa"]);
  });

  it("vacío devuelve todas; sin coincidencias, ninguna", () => {
    expect(ciudadesQueCoinciden(ciudades, "")).toHaveLength(150);
    expect(ciudadesQueCoinciden(ciudades, "   ")).toHaveLength(150);
    expect(ciudadesQueCoinciden(ciudades, "zzzz")).toEqual([]);
  });
});

describe("BarraDeCiudades · pocas ciudades", () => {
  it(`hasta ${CIUDADES_PARA_BUSCAR} ciudades no hay campo de búsqueda y se ven todas, como antes`, () => {
    montar(muchas(CIUDADES_PARA_BUSCAR));

    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(botonesDeCiudad()).toHaveLength(CIUDADES_PARA_BUSCAR);
    expect(screen.getByTestId("botones-de-ciudades")).not.toHaveClass("overflow-y-auto");
  });
});

describe("BarraDeCiudades · 150 ciudades", () => {
  it("suma el campo, el recuento y un alto con scroll para no empujar el mapa", () => {
    montar(muchas());

    expect(screen.getByRole("searchbox", { name: ETIQUETA_BUSCAR_CIUDAD })).toBeInTheDocument();
    expect(screen.getByText("150 ciudades")).toBeInTheDocument();
    expect(screen.getByTestId("botones-de-ciudades")).toHaveClass("max-h-[132px]", "overflow-y-auto");
    expect(botonesDeCiudad()).toHaveLength(150);
  });

  it("escribir parte del nombre, sin tildes ni mayúsculas, deja esa ciudad y se elige con un clic", async () => {
    const { onElegir } = montar(muchas());

    await userEvent.type(screen.getByRole("searchbox"), "paysandu");

    expect(screen.getByText("1 de 150 ciudades")).toBeInTheDocument();
    // La elegida (Paysandú es la primera) y nada más.
    expect(botonesDeCiudad()).toHaveLength(1);
    expect(botonesDeCiudad()[0]).toHaveTextContent("Paysandú");

    await userEvent.clear(screen.getByRole("searchbox"));
    await userEvent.type(screen.getByRole("searchbox"), "localidad 07");
    expect(screen.getByText("10 de 150 ciudades")).toBeInTheDocument();
    await userEvent.click(within(screen.getByTestId("botones-de-ciudades")).getByRole("button", { name: /Localidad 073/ }));
    expect(onElegir).toHaveBeenCalledWith("c78");
  });

  it("Enter elige la primera que coincide", async () => {
    const { onElegir } = montar(muchas());

    await userEvent.type(screen.getByRole("searchbox"), "tacuarem{Enter}");

    expect(onElegir).toHaveBeenCalledWith("c1");
  });

  it("Enter sin nada escrito, o con la barra deshabilitada, no elige nada", async () => {
    const { onElegir, rerender } = montar(muchas());
    await userEvent.type(screen.getByRole("searchbox"), "{Enter}");
    expect(onElegir).not.toHaveBeenCalled();

    rerender(<BarraDeCiudades ciudades={muchas()} ciudadId="c0" deshabilitado onElegir={onElegir} />);
    await userEvent.type(screen.getByRole("searchbox"), "tacuarem{Enter}");
    expect(onElegir).not.toHaveBeenCalled();
    for (const b of botonesDeCiudad()) expect(b).toBeDisabled();
  });

  it("sin coincidencias avisa qué hacer; Esc borra lo escrito y vuelven todas", async () => {
    montar(muchas());
    const campo = screen.getByRole("searchbox");

    await userEvent.type(campo, "xyzxyz");

    expect(screen.getByText(textoSinCoincidencias("xyzxyz"))).toBeInTheDocument();
    expect(screen.getByText("0 de 150 ciudades")).toBeInTheDocument();
    // La elegida sigue a la vista: no se pierde ni el foco que le pasa «+ Agregar ciudad».
    expect(botonesDeCiudad()).toHaveLength(1);
    expect(botonesDeCiudad()[0]).toHaveAttribute("aria-current", "true");

    await userEvent.type(campo, "{Escape}");

    expect(campo).toHaveValue("");
    expect(botonesDeCiudad()).toHaveLength(150);
    expect(screen.queryByText(textoSinCoincidencias("xyzxyz"))).not.toBeInTheDocument();
  });

  it("la ciudad elegida va primera aunque no coincida con lo escrito", async () => {
    montar(muchas(), "c40");

    await userEvent.type(screen.getByRole("searchbox"), "paysandu");

    const botones = botonesDeCiudad();
    expect(botones).toHaveLength(2);
    expect(botones[0]).toHaveAttribute("aria-current", "true");
    expect(botones[0]).toHaveTextContent("Localidad 035");
    expect(botones[1]).toHaveTextContent("Paysandú");
  });

  it("un nombre larguísimo sin espacios no desborda el botón", () => {
    const largo = "X".repeat(200);
    montar([...muchas(20).slice(0, 19), ciudad(99, largo)]);

    expect(screen.getByText(largo)).toHaveClass("wrap-anywhere");
  });

  it("con teclado: el campo es lo primero que se alcanza y las ciudades siguen en el orden del DOM", async () => {
    montar(muchas());

    await userEvent.tab();

    expect(screen.getByRole("searchbox")).toHaveFocus();
    await userEvent.tab();
    expect(botonesDeCiudad()[0]).toHaveFocus();
  });

  it("no tiene violaciones de accesibilidad (axe) con 150 ciudades ni buscando", async () => {
    const { container } = montar(muchas());
    const opciones = { runOnly: { type: "tag" as const, values: ["wcag2a", "wcag2aa", "wcag21aa"] }, rules: { "color-contrast": { enabled: false } } };

    expect((await axe.run(container, opciones)).violations).toEqual([]);
    await userEvent.type(screen.getByRole("searchbox"), "xyz");
    expect((await axe.run(container, opciones)).violations).toEqual([]);
  });
});

describe("Orden de la barra · A-Z y, buscando, primero lo que empieza con lo escrito (decisión P4 de #186, 18/11)", () => {
  const nombres = (cs: readonly CiudadDeCampania[]) => cs.map((c) => c.nombre);
  const desordenadas = () =>
    ["Treinta y Tres", "rocha", "Ciudad de la Costa", "Río Branco", "Artigas", "Colonia del Sacramento", "Las Piedras", "Costa Azul", "Ñangapiré"].map(
      (n, i) => ciudad(i, n),
    );

  it("ordenarCiudades va A-Z sin mirar tildes ni mayúsculas, y no toca la lista que recibe", () => {
    const ciudades = desordenadas();
    const antes = nombres(ciudades);

    expect(nombres(ordenarCiudades(ciudades))).toEqual([
      "Artigas",
      "Ciudad de la Costa",
      "Colonia del Sacramento",
      "Costa Azul",
      "Las Piedras",
      "Ñangapiré",
      "Río Branco",
      "rocha",
      "Treinta y Tres",
    ]);
    expect(nombres(ciudades)).toEqual(antes);
  });

  it("dos ciudades con el mismo nombre quedan por id, siempre en el mismo orden", () => {
    const a = ciudad(2, "Santa Lucía");
    const b = ciudad(1, "Santa Lucia");
    expect(ordenarCiudades([a, b]).map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(ordenarCiudades([b, a]).map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("ciudadesQueCoinciden: primero las que empiezan con lo escrito, después las que lo contienen, cada grupo A-Z", () => {
    expect(nombres(ciudadesQueCoinciden(desordenadas(), "COSTA"))).toEqual(["Costa Azul", "Ciudad de la Costa"]);
    expect(nombres(ciudadesQueCoinciden(desordenadas(), "co"))).toEqual(["Colonia del Sacramento", "Costa Azul", "Ciudad de la Costa", "Río Branco"]);
    expect(nombres(ciudadesQueCoinciden(desordenadas(), ""))).toEqual(nombres(ordenarCiudades(desordenadas())));
  });

  it("sin buscar, los botones van A-Z aunque la fuente mande otro orden (también con pocas ciudades)", () => {
    montar(desordenadas().slice(0, 4), "c0");

    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(botonesDeCiudad().map((b) => b.querySelector("span")?.textContent)).toEqual([
      "Ciudad de la Costa",
      "Río Branco",
      "rocha",
      "Treinta y Tres",
    ]);
    // La elegida queda en su lugar A-Z, marcada.
    expect(botonesDeCiudad()[3]).toHaveAttribute("aria-current", "true");
  });

  it("buscando, la elegida sigue primera; después las que empiezan y las que contienen, y Enter elige la primera que coincide", async () => {
    const { onElegir } = montar(desordenadas(), "c0");

    await userEvent.type(screen.getByRole("searchbox"), "co");

    expect(botonesDeCiudad().map((b) => b.querySelector("span")?.textContent)).toEqual([
      "Treinta y Tres",
      "Colonia del Sacramento",
      "Costa Azul",
      "Ciudad de la Costa",
      "Río Branco",
    ]);
    expect(botonesDeCiudad()[0]).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("4 de 9 ciudades")).toBeInTheDocument();

    await userEvent.type(screen.getByRole("searchbox"), "{Enter}");
    expect(onElegir).toHaveBeenCalledWith("c5");
  });
});
