import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CiudadDeCampania, DatosZonas } from "@/datos/equipo/zonas";
import {
  DATOS_ZONAS_SIMULADO,
  fuenteZonasSimulada,
} from "@/datos/equipo/zonas/simulado";
import {
  BarraDeCiudades,
  CIUDADES_PARA_BUSCAR,
  ciudadesQueCoinciden,
  ETIQUETA_BUSCAR_CIUDAD,
  textoSinCoincidencias,
} from "@/features/equipo/zonas/BarraDeCiudades";
import {
  type AccionesZonas,
  ZonasCampania,
} from "@/features/equipo/zonas/ZonasCampania";

/**
 * QA de #186 (PR #189): casos límite de la barra de ciudades que el implementador no cubrió: borde de 8/9 ciudades, solo espacios,
 * emoji y caracteres de expresión regular, texto pegado largo, la lista que se achica con lo escrito, Enter repetido y agregar una
 * ciudad con el filtro puesto. El comportamiento en navegador (alto de la barra, foco al reordenar, axe) está en el comentario del PR.
 */

vi.mock("@/features/equipo/zonas/MapaZonas", () => ({
  MapaZonas: () => <div data-testid="mapa" />,
}));

function ciudad(i: number, nombre: string): CiudadDeCampania {
  return {
    id: `c${i}`,
    catalogoId: `cat${i}`,
    nombre,
    centro: { lon: -56, lat: -34 },
    zoom: 12,
    zonas: [],
    colportores: [],
  };
}

function ciudades(cantidad: number): CiudadDeCampania[] {
  return Array.from({ length: cantidad }, (_, i) =>
    ciudad(i, `Localidad ${String(i).padStart(3, "0")}`),
  );
}

function montar(
  lista: CiudadDeCampania[],
  ciudadId = lista[0]!.id,
  deshabilitado = false,
) {
  const onElegir = vi.fn();
  const r = render(
    <BarraDeCiudades
      ciudades={lista}
      ciudadId={ciudadId}
      deshabilitado={deshabilitado}
      onElegir={onElegir}
    />,
  );
  return { onElegir, ...r };
}

const caja = () =>
  screen.getByRole("searchbox", { name: ETIQUETA_BUSCAR_CIUDAD });
const botones = () =>
  within(screen.getByTestId("botones-de-ciudades")).getAllByRole("button");

describe("BarraDeCiudades · QA #186", () => {
  it(`el campo aparece con ${CIUDADES_PARA_BUSCAR + 1} ciudades y no con ${CIUDADES_PARA_BUSCAR}; y la lista de 8 no tiene alto con scroll`, () => {
    const { unmount } = montar(ciudades(CIUDADES_PARA_BUSCAR));
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.getByTestId("botones-de-ciudades")).not.toHaveClass(
      "overflow-y-auto",
    );
    unmount();

    montar(ciudades(CIUDADES_PARA_BUSCAR + 1));
    expect(caja()).toBeInTheDocument();
    expect(screen.getByTestId("botones-de-ciudades")).toHaveClass(
      "overflow-y-auto",
    );
  });

  it("solo espacios no filtra, no avisa «sin coincidencias» y el recuento sigue en «150 ciudades»", async () => {
    const { onElegir } = montar(ciudades(150));

    await userEvent.type(caja(), "     ");

    expect(botones()).toHaveLength(150);
    expect(screen.getByText("150 ciudades")).toBeInTheDocument();
    expect(
      screen.queryByText(/Ninguna ciudad de la campaña/),
    ).not.toBeInTheDocument();
    await userEvent.type(caja(), "{Enter}");
    expect(onElegir).not.toHaveBeenCalled();
  });

  it("espacios alrededor de lo escrito no cambian el resultado", async () => {
    montar(ciudades(150));

    await userEvent.type(caja(), "   localidad 120   ");

    expect(screen.getByText("1 de 150 ciudades")).toBeInTheDocument();
    expect(botones().map((b) => b.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("Localidad 120")]),
    );
  });

  it("emoji y caracteres de expresión regular se buscan como texto: no rompen y avisan que no hay coincidencias", async () => {
    montar(ciudades(150));

    for (const raro of ["😀", ".*", "[(", "\\", "(?<x", "ñandú 🐮"]) {
      await userEvent.clear(caja());
      await userEvent.type(caja(), raro.replace(/[{[]/g, "$&$&"));
      expect(screen.getByText(textoSinCoincidencias(raro))).toBeInTheDocument();
      expect(screen.getByText("0 de 150 ciudades")).toBeInTheDocument();
    }
  });

  it("un texto pegado de 5000 caracteres no rompe la barra: avisa, se corta en el aviso y Esc lo borra", async () => {
    montar(ciudades(150));
    const pegado = "z".repeat(5000);

    await userEvent.click(caja());
    await userEvent.paste(pegado);

    const aviso = screen.getByText(/Ninguna ciudad de la campaña coincide con/);
    expect(aviso).toHaveClass("wrap-anywhere");
    expect(aviso.textContent).toContain(pegado);
    await userEvent.keyboard("{Escape}");
    expect(caja()).toHaveValue("");
    expect(botones()).toHaveLength(150);
  });

  it("Enter sin coincidencias no elige nada (ni la ciudad que ya estaba elegida)", async () => {
    const { onElegir } = montar(ciudades(150));

    await userEvent.type(caja(), "inexistente{Enter}");

    expect(onElegir).not.toHaveBeenCalled();
  });

  it("Enter con la barra deshabilitada (guardando) no elige, aunque haya coincidencia", async () => {
    const { onElegir } = montar(ciudades(150), "c0", true);

    await userEvent.type(caja(), "localidad 12{Enter}");

    expect(onElegir).not.toHaveBeenCalled();
    for (const b of botones()) expect(b).toBeDisabled();
  });

  it("si la lista se achica a 8 con algo escrito, el campo desaparece y se ven todas, sin aviso colgado", async () => {
    const { rerender, onElegir } = montar(ciudades(20));
    await userEvent.type(caja(), "zzz");
    expect(
      screen.getByText(/Ninguna ciudad de la campaña/),
    ).toBeInTheDocument();

    rerender(
      <BarraDeCiudades
        ciudades={ciudades(8)}
        ciudadId="c0"
        deshabilitado={false}
        onElegir={onElegir}
      />,
    );

    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Ninguna ciudad de la campaña/),
    ).not.toBeInTheDocument();
    expect(botones()).toHaveLength(8);
  });

  it("lo escrito se conserva si la lista cambia de ciudad elegida (no se pierde al elegir)", async () => {
    const lista = ciudades(150);
    const { rerender, onElegir } = montar(lista);
    await userEvent.type(caja(), "localidad 12");

    rerender(
      <BarraDeCiudades
        ciudades={lista}
        ciudadId="c125"
        deshabilitado={false}
        onElegir={onElegir}
      />,
    );

    expect(caja()).toHaveValue("localidad 12");
    expect(botones()[0]).toHaveAttribute("aria-current", "true");
  });

  it("buscar con la ñ y mayúsculas sin tilde encuentra el nombre con tilde y con ñ", () => {
    const lista = [
      ...ciudades(12),
      ciudad(500, "Peñarol"),
      ciudad(501, "ÁGUILA"),
    ];

    expect(ciudadesQueCoinciden(lista, "PENAROL").map((c) => c.nombre)).toEqual(
      ["Peñarol"],
    );
    expect(ciudadesQueCoinciden(lista, "aguila").map((c) => c.nombre)).toEqual([
      "ÁGUILA",
    ]);
  });

  it("el recuento se anuncia con aria-live y no suma un segundo role=status ni role=alert", async () => {
    const { container } = montar(ciudades(150));
    await userEvent.type(caja(), "zzz");

    expect(container.querySelectorAll("[aria-live]")).toHaveLength(1);
    expect(
      container.querySelectorAll('[role="status"], [role="alert"]'),
    ).toHaveLength(0);
  });

  // Menor de la QA: tras elegir buscando y borrar con Esc, la elegida vuelve a su lugar A-Z y queda fuera de la fila con scroll (Chromium, 150).
  it.skip("QA #186: al borrar lo escrito con Esc, la ciudad elegida se trae a la vista dentro de la fila con scroll", async () => {
    const aMover = vi.fn();
    Element.prototype.scrollIntoView = aMover;
    try {
      montar(ciudades(150), "c0");
      await userEvent.type(caja(), "localidad 12");
      aMover.mockClear();

      await userEvent.keyboard("{Escape}");

      expect(aMover).toHaveBeenCalled();
    } finally {
      // @ts-expect-error restaurar el estado de jsdom (no define scrollIntoView)
      delete Element.prototype.scrollIntoView;
    }
  });

  // Menor de la QA: con pocas coincidencias la barra se achica de 196 px a 114 px y el mapa sube; con el aviso largo vuelve a crecer.
  it.skip("QA #186: el alto de la barra no cambia mientras se escribe (el mapa y la lista de zonas no se mueven)", async () => {
    montar(ciudades(150));
    const antes = screen.getByTestId("botones-de-ciudades").className;

    await userEvent.type(caja(), "localidad 120");

    expect(screen.getByTestId("botones-de-ciudades").className).toBe(antes);
    expect(screen.getByTestId("botones-de-ciudades")).toHaveClass(
      "min-h-[132px]",
    );
  });
});

describe("ZonasCampania · barra de ciudades · QA #186", () => {
  const CAMPANIA = "campania-verano-2026";

  function datos(): DatosZonas {
    const [primera, ...otras] = DATOS_ZONAS_SIMULADO.ciudades;
    const relleno = Array.from(
      { length: 150 - DATOS_ZONAS_SIMULADO.ciudades.length },
      (_, i) => ({
        ...primera!,
        id: `relleno-${i}`,
        catalogoId: `cat-relleno-${i}`,
        nombre: `Localidad ${String(i).padStart(3, "0")}`,
        zonas: [],
        colportores: [],
      }),
    );
    return {
      ...DATOS_ZONAS_SIMULADO,
      ciudades: [primera!, ...otras, ...relleno],
    };
  }

  function acciones(): AccionesZonas {
    return {
      esquinaMasCercana: vi.fn(async () => null),
      tramoPorCalles: vi.fn(async () => null),
      vistaPreviaZona: vi.fn((e) => fuenteZonasSimulada.vistaPreviaZona(e)),
      guardarZona: vi.fn((e) => fuenteZonasSimulada.guardarZona(e)),
      asignarZona: vi.fn(async () => ({ ok: true as const })),
      quitarZona: vi.fn(async () => ({ ok: true as const })),
      eliminarZona: vi.fn((id: string) =>
        fuenteZonasSimulada.eliminarZona(CAMPANIA, id),
      ),
      buscarCiudades: vi.fn((t: string) =>
        fuenteZonasSimulada.buscarCiudades(CAMPANIA, t),
      ),
      agregarCiudad: vi.fn((id: string) =>
        fuenteZonasSimulada.agregarCiudad(CAMPANIA, id),
      ),
      casasDeZonas: vi.fn(async () => []),
    } as unknown as AccionesZonas;
  }

  const barra = () =>
    screen.getByRole("navigation", { name: "Ciudades de la campaña" });

  it("Enter dos veces seguidas en el campo cambia de ciudad una sola vez y deja la vista entera", async () => {
    render(<ZonasCampania datos={datos()} acciones={acciones()} />);

    await userEvent.type(
      within(barra()).getByRole("searchbox"),
      "localidad 120{Enter}{Enter}",
    );

    expect(
      within(barra()).getByRole("button", { name: /Localidad 120/ }),
    ).toHaveAttribute("aria-current", "true");
    expect(
      within(barra()).getAllByRole("button", { current: true }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("region", { name: "Zonas de Localidad 120" }),
    ).toBeInTheDocument();
    expect(within(barra()).getByRole("searchbox")).toHaveFocus();
  });

  it("agregar una ciudad con lo escrito en el filtro: queda elegida, primera y con el foco; el filtro se conserva", async () => {
    render(<ZonasCampania datos={datos()} acciones={acciones()} />);
    await userEvent.type(within(barra()).getByRole("searchbox"), "zz");
    expect(
      screen.getByText(/Ninguna ciudad de la campaña coincide con «zz»/),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "+ Agregar ciudad" }),
    );
    const buscador = screen.getByRole("region", { name: "Agregar ciudad" });
    await userEvent.click(
      await within(buscador).findByRole("button", {
        name: "Agregar Salto, Salto",
      }),
    );

    expect(
      await screen.findByText("«Salto» se agregó a la campaña."),
    ).toBeInTheDocument();
    const botonesDeCiudad = within(
      screen.getByTestId("botones-de-ciudades"),
    ).getAllByRole("button");
    expect(botonesDeCiudad[0]).toHaveTextContent("Salto");
    expect(botonesDeCiudad[0]).toHaveAttribute("aria-current", "true");
    expect(botonesDeCiudad[0]).toHaveFocus();
    expect(within(barra()).getByRole("searchbox")).toHaveValue("zz");
    expect(screen.getByText("0 de 151 ciudades")).toBeInTheDocument();
  });

  it("elegir una ciudad con el botón mientras se filtra no pierde el foco ni lo escrito", async () => {
    render(<ZonasCampania datos={datos()} acciones={acciones()} />);
    await userEvent.type(
      within(barra()).getByRole("searchbox"),
      "localidad 12",
    );

    const boton = within(barra()).getByRole("button", {
      name: /Localidad 125/,
    });
    boton.focus();
    await userEvent.keyboard("{Enter}");

    const elegida = within(barra()).getByRole("button", {
      name: /Localidad 125/,
    });
    expect(elegida).toHaveAttribute("aria-current", "true");
    expect(elegida).toHaveFocus();
    expect(within(barra()).getByRole("searchbox")).toHaveValue("localidad 12");
  });
});
