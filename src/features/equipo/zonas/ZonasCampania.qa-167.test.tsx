import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatosZonas, Punto } from "@/datos/equipo/zonas";
import {
  DATOS_ZONAS_SIMULADO,
  fuenteZonasSimulada,
} from "@/datos/equipo/zonas/simulado";
import {
  type AccionesZonas,
  TEXTO_ESQUINAS_SIN_CONECTAR,
  TEXTO_SIN_CIUDADES,
  ZonasCampania,
} from "@/features/equipo/zonas/ZonasCampania";
import type { PropsMapaZonas } from "@/features/equipo/zonas/tipos";

/**
 * QA del PR #171 (issue #167), vista 24: casos límite de «campaña sin ciudades» y «zonas por esquinas sin conectar» que
 * los tests del implementador no recorren (doble toque, rechazo del servidor, lo tipeado, foco, avisos que quedan pegados).
 */

const mapa = vi.hoisted(() => ({ props: null as PropsMapaZonas | null }));
vi.mock("@/features/equipo/zonas/MapaZonas", () => ({
  MapaZonas: (props: PropsMapaZonas) => {
    mapa.props = props;
    return <div data-testid="mapa" />;
  },
}));

const CAMPANIA = "campania-verano-2026";
const SIN_CIUDADES: DatosZonas = {
  campaniaId: CAMPANIA,
  campania: "Verano 2026",
  ciudades: [],
};
const SIN_ESQUINAS: DatosZonas = {
  ...DATOS_ZONAS_SIMULADO,
  esquinasDisponibles: false,
};
const PUNTO: Punto = { lon: -56.25, lat: -34.86 };

function acciones(sobre: Partial<AccionesZonas> = {}): AccionesZonas {
  const sinConectar = () =>
    Promise.reject(new Error("todavía no está conectada"));
  return {
    esquinaMasCercana: vi.fn(sinConectar),
    tramoPorCalles: vi.fn(sinConectar),
    vistaPreviaZona: vi.fn((e) => fuenteZonasSimulada.vistaPreviaZona(e)),
    guardarZona: vi.fn((e) =>
      e.forma.tipoForma === "ESQUINAS"
        ? sinConectar()
        : fuenteZonasSimulada.guardarZona(e),
    ),
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
    ...sobre,
  };
}

function montar(datos: DatosZonas, sobre: Partial<AccionesZonas> = {}) {
  const acc = acciones(sobre);
  render(<ZonasCampania datos={datos} acciones={acc} />);
  return acc;
}

afterEach(() => {
  mapa.props = null;
});

describe("QA #167 · campaña sin ciudades", () => {
  it("dos toques seguidos en la misma ciudad la agregan una sola vez", async () => {
    let resolver: (
      r: Awaited<ReturnType<AccionesZonas["agregarCiudad"]>>,
    ) => void = () => {};
    const acc = montar(SIN_CIUDADES, {
      agregarCiudad: vi.fn(
        () =>
          new Promise<Awaited<ReturnType<AccionesZonas["agregarCiudad"]>>>(
            (r) => {
              resolver = r;
            },
          ),
      ),
    });

    await userEvent.click(
      screen.getByRole("button", { name: "+ Agregar ciudad" }),
    );
    const buscador = screen.getByRole("region", { name: "Agregar ciudad" });
    const opcion = await within(buscador).findByRole("button", {
      name: "Agregar Salto, Salto",
    });
    await userEvent.click(opcion);
    await userEvent.click(opcion);

    expect(acc.agregarCiudad).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolver({ ok: false, mensaje: "Probá de nuevo." });
    });
  });

  it("si el servidor rechaza agregar, el aviso de la campaña sin ciudades sigue, el rechazo dice qué hacer y se puede elegir otra vez", async () => {
    montar(SIN_CIUDADES, {
      agregarCiudad: vi.fn(async () => ({
        ok: false as const,
        mensaje: "Esa ciudad ya está en la campaña. Elegí otra.",
      })),
    });

    await userEvent.click(
      screen.getByRole("button", { name: "+ Agregar ciudad" }),
    );
    const buscador = screen.getByRole("region", { name: "Agregar ciudad" });
    await userEvent.click(
      await within(buscador).findByRole("button", {
        name: "Agregar Salto, Salto",
      }),
    );

    await within(buscador).findByText(
      "Esa ciudad ya está en la campaña. Elegí otra.",
    );
    expect(screen.getByText(TEXTO_SIN_CIUDADES)).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Ciudades de la campaña" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("mapa")).not.toBeInTheDocument();
    expect(
      within(buscador).getByRole("button", { name: "Agregar Salto, Salto" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "+ Agregar ciudad" }),
    ).toBeEnabled();
  });

  it("sin conexión al buscar: el aviso de la campaña sin ciudades sigue y el buscador ofrece «Reintentar»", async () => {
    montar(SIN_CIUDADES, {
      buscarCiudades: vi.fn(() =>
        Promise.reject(new TypeError("fetch failed")),
      ),
    });

    await userEvent.click(
      screen.getByRole("button", { name: "+ Agregar ciudad" }),
    );
    const buscador = screen.getByRole("region", { name: "Agregar ciudad" });

    await within(buscador).findByText(/No se pudo buscar en el catálogo/);
    expect(
      within(buscador).getByRole("button", { name: /Reintentar/ }),
    ).toBeEnabled();
    expect(screen.getByText(TEXTO_SIN_CIUDADES)).toBeInTheDocument();
  });

  it("cerrar el buscador con Escape devuelve el foco a «+ Agregar ciudad» (no cae al <body>)", async () => {
    montar(SIN_CIUDADES);

    await userEvent.click(
      screen.getByRole("button", { name: "+ Agregar ciudad" }),
    );
    await screen.findByRole("region", { name: "Agregar ciudad" });
    await userEvent.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Agregar ciudad" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "+ Agregar ciudad" }),
    ).toHaveFocus();
  });

  it("el aviso de la campaña sin ciudades y el de «se agregó» nunca están a la vez, y el aviso de éxito se anuncia", async () => {
    montar(SIN_CIUDADES);

    await userEvent.click(
      screen.getByRole("button", { name: "+ Agregar ciudad" }),
    );
    const buscador = screen.getByRole("region", { name: "Agregar ciudad" });
    await userEvent.click(
      await within(buscador).findByRole("button", {
        name: "Agregar Salto, Salto",
      }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "«Salto» se agregó a la campaña.",
    );
    expect(screen.queryByText(TEXTO_SIN_CIUDADES)).not.toBeInTheDocument();
    // Con la primera ciudad ya se puede empezar una zona.
    expect(screen.getByRole("button", { name: "+ Nueva zona" })).toBeEnabled();
  });
});

describe("QA #167 · zonas por esquinas sin conectar", () => {
  async function nuevaZona() {
    await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
  }

  it("lo tipeado en «NOMBRE» no se pierde al elegir «Por esquinas» ni al volver a «Radial»", async () => {
    montar(SIN_ESQUINAS);
    await nuevaZona();
    const nombre = screen.getByRole("textbox", { name: /NOMBRE/ });
    await userEvent.type(nombre, "Loma Verde");

    await userEvent.click(screen.getByRole("radio", { name: /Por esquinas/ }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      TEXTO_ESQUINAS_SIN_CONECTAR,
    );
    expect(screen.getByRole("textbox", { name: /NOMBRE/ })).toHaveValue(
      "Loma Verde",
    );

    await userEvent.click(screen.getByRole("radio", { name: /Radial/ }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /NOMBRE/ })).toHaveValue(
      "Loma Verde",
    );
  });

  it("«Guardar zona» no se habilita en «Por esquinas» (nada que guardar) y el aviso queda a la vista con su salida", async () => {
    const acc = montar(SIN_ESQUINAS);
    await nuevaZona();
    await userEvent.type(
      screen.getByRole("textbox", { name: /NOMBRE/ }),
      "Loma Verde",
    );
    await userEvent.click(screen.getByRole("radio", { name: /Por esquinas/ }));

    expect(screen.getByRole("button", { name: "Guardar zona" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/elegí «Radial»/);
    expect(screen.getByRole("radio", { name: /Radial/ })).toBeEnabled();
    expect(acc.guardarZona).not.toHaveBeenCalled();
  });

  it("repetir clics y movimientos del mouse deja UN solo aviso (no se apilan)", async () => {
    montar(SIN_ESQUINAS);
    await nuevaZona();
    await userEvent.click(screen.getByRole("radio", { name: /Por esquinas/ }));

    await act(async () => {
      for (let i = 0; i < 5; i++) mapa.props?.onMapaClick(PUNTO);
    });

    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(1));
  });

  it("cerrar el formulario y abrir una zona nueva (Radial) no arrastra el aviso de esquinas", async () => {
    montar(SIN_ESQUINAS);
    await nuevaZona();
    await userEvent.click(screen.getByRole("radio", { name: /Por esquinas/ }));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Cerrar el formulario de zona" }),
    );
    await nuevaZona();

    expect(
      screen.queryByText(TEXTO_ESQUINAS_SIN_CONECTAR),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("editar una zona por esquinas y cancelar; después editar una radial: el aviso de esquinas no queda pegado", async () => {
    montar(SIN_ESQUINAS);
    await userEvent.click(
      screen.getByRole("button", { name: "Ver la zona Cerro Norte" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Editar forma" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      TEXTO_ESQUINAS_SIN_CONECTAR,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Cerrar el formulario de zona" }),
    );
    expect(
      screen.queryByText(TEXTO_ESQUINAS_SIN_CONECTAR),
    ).not.toBeInTheDocument();

    // Una zona radial de la misma campaña: se abre sin el aviso.
    const radial = DATOS_ZONAS_SIMULADO.ciudades
      .flatMap((c) => c.zonas)
      .find((z) => z.tipoForma === "RADIAL");
    expect(radial).toBeDefined();
    if (!radial) return;
    await userEvent.click(
      screen.getByRole("button", { name: `Ver la zona ${radial.nombre}` }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Editar forma" }));
    expect(
      screen.queryByText(TEXTO_ESQUINAS_SIN_CONECTAR),
    ).not.toBeInTheDocument();
  });

  it("con la fuente simulada (sin el flag) elegir «Por esquinas» no culpa ni a la conexión ni a la función sin conectar", async () => {
    montar(DATOS_ZONAS_SIMULADO, {
      esquinaMasCercana: vi.fn((c: string, p: Punto) =>
        fuenteZonasSimulada.esquinaMasCercana(c, p),
      ),
    });
    await nuevaZona();
    await userEvent.click(screen.getByRole("radio", { name: /Por esquinas/ }));

    await act(async () => {
      mapa.props?.onMapaClick(PUNTO);
    });

    expect(
      screen.queryByText(TEXTO_ESQUINAS_SIN_CONECTAR),
    ).not.toBeInTheDocument();
  });
});

describe("QA #167 · zonas por esquinas sin conectar: coherencia del formulario", () => {
  it.skip("QA #167: con el aviso de esquinas sin conectar, el formulario no sigue indicando «Hacé clic en las esquinas en orden»", async () => {
    montar(SIN_ESQUINAS);
    await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
    await userEvent.click(screen.getByRole("radio", { name: /Por esquinas/ }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      TEXTO_ESQUINAS_SIN_CONECTAR,
    );
    expect(
      screen.queryByText(/Hacé clic en las esquinas en orden/),
    ).not.toBeInTheDocument();
  });
});
