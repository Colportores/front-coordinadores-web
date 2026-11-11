import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Esquina, Punto, VistaPreviaZona } from "@/datos/equipo/zonas";
import { DATOS_ZONAS_SIMULADO, fuenteZonasSimulada } from "@/datos/equipo/zonas/simulado";
import { type AccionesZonas, textoBordeVuelve, textoDeEsquinasCorridas, ZonasCampania } from "@/features/equipo/zonas/ZonasCampania";
import type { PropsMapaZonas } from "@/features/equipo/zonas/tipos";

/**
 * Issue #179, el `CZ008` de las zonas por esquinas: con las calles reales, el camino más corto que llega a una esquina y
 * el que sale de ella suelen compartir una cuadra, y la base rechaza ese borde («se cruza a sí mismo»). El panel corre la
 * esquina al punto donde los dos caminos se separan, lo avisa, y le pide a la base el borde con las esquinas corregidas.
 */

const mapa = vi.hoisted(() => ({ props: null as PropsMapaZonas | null }));
vi.mock("@/features/equipo/zonas/MapaZonas", () => ({
  MapaZonas: (props: PropsMapaZonas) => {
    mapa.props = props;
    return <div data-testid="mapa" />;
  },
}));

const CAMPANIA = "campania-verano-2026";
const p = (lon: number, lat: number): Punto => ({ lon, lat });
const clave = (a: Punto, b: Punto) => `${a.lon},${a.lat}>${b.lon},${b.lat}`;
/** La esquina de un punto de la red de prueba: sus calles se llaman como sus coordenadas. */
const esquinaDe = (punto: Punto): Esquina => ({ ...punto, calleA: `Calle ${punto.lon}`, calleB: `Avenida ${punto.lat}` });

const PREVIA: VistaPreviaZona = {
  poligonoGeojson: { type: "Polygon", coordinates: [[[0, 0], [4, 0], [4, 4], [0, 0]]] },
  ubicacionesIncluidas: 12,
  superposicion: null,
  comparteCalle: null,
};

/** Una red de calles a medida: cada tramo, por sus dos puntas; el que no está, la línea recta. */
function acciones(tramos: Record<string, Punto[]>, sobre: Partial<AccionesZonas> = {}): AccionesZonas {
  return {
    esquinaMasCercana: vi.fn(async (_c: string, punto: Punto) => esquinaDe(punto)),
    tramoPorCalles: vi.fn(async (_c: string, a: Punto, b: Punto) => tramos[clave(a, b)] ?? [p(a.lon, a.lat), p(b.lon, b.lat)]),
    vistaPreviaZona: vi.fn(async () => PREVIA),
    guardarZona: vi.fn((e) => fuenteZonasSimulada.guardarZona(e)),
    asignarZona: vi.fn(async () => ({ ok: true as const })),
    quitarZona: vi.fn(async () => ({ ok: true as const })),
    eliminarZona: vi.fn((id: string) => fuenteZonasSimulada.eliminarZona(CAMPANIA, id)),
    buscarCiudades: vi.fn((t: string) => fuenteZonasSimulada.buscarCiudades(CAMPANIA, t)),
    agregarCiudad: vi.fn((id: string) => fuenteZonasSimulada.agregarCiudad(CAMPANIA, id)),
    casasDeZonas: vi.fn(async () => []),
    ...sobre,
  };
}

async function montarPorEsquinas(tramos: Record<string, Punto[]>, sobre: Partial<AccionesZonas> = {}) {
  const acc = acciones(tramos, sobre);
  render(<ZonasCampania datos={DATOS_ZONAS_SIMULADO} acciones={acc} />);
  await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
  await userEvent.click(screen.getByRole("radio", { name: /Por esquinas/ }));
  return acc;
}

async function clicEnMapa(punto: Punto) {
  await act(async () => {
    mapa.props?.onMapaClick(punto);
  });
}

const posiciones = () => mapa.props?.dibujo?.esquinas.map(({ lon, lat }) => ({ lon, lat }));

const A = p(0, 0);
const B = p(2, 0);
const C = p(1, 2);
/** De A a B por (1,0); de B a C volviendo por (1,0): la cuadra (1,0)–(2,0) va de ida y de vuelta. */
const CON_VUELTA = {
  [clave(A, B)]: [A, p(1, 0), B],
  [clave(B, C)]: [B, p(1, 0), p(1, 1), C],
};
const MOTIVO = "para que el borde no pase dos veces por la misma cuadra";

afterEach(() => {
  mapa.props = null;
});

describe("zonas por esquinas: el borde no va y vuelve por la misma cuadra (#179)", () => {
  it("corre la esquina al punto donde los dos caminos se separan, recorta el borde dibujado y lo avisa", async () => {
    const acc = await montarPorEsquinas(CON_VUELTA);

    await clicEnMapa(A);
    await clicEnMapa(B);
    expect(posiciones()).toEqual([A, B]);
    expect(screen.queryByText(new RegExp(MOTIVO))).not.toBeInTheDocument();

    await clicEnMapa(C);

    expect(posiciones()).toEqual([A, p(1, 0), C]);
    expect(mapa.props?.dibujo?.linea).toEqual([A, p(1, 0), p(1, 0), p(1, 1), C]);
    expect(screen.getByText(`Movimos la esquina 2 a «Calle 1 y Avenida 0» ${MOTIVO}.`)).toBeInTheDocument();
    expect(screen.getByText("ESQUINAS · 3")).toBeInTheDocument();
    expect(screen.getByText("Calle 1 y Avenida 0")).toBeInTheDocument();
    expect(screen.queryByText("Calle 2 y Avenida 0")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // Las calles de la esquina corrida se le preguntan a la base, en el punto nuevo.
    expect(acc.esquinaMasCercana).toHaveBeenLastCalledWith(expect.any(String), p(1, 0));
  });

  it("el aviso se va con la esquina siguiente si esa no corre nada, y con «Quitar»", async () => {
    await montarPorEsquinas(CON_VUELTA);
    for (const punto of [A, B, C]) await clicEnMapa(punto);
    expect(screen.getByText(new RegExp(MOTIVO))).toBeInTheDocument();

    await clicEnMapa(p(0, 3));

    expect(screen.queryByText(new RegExp(MOTIVO))).not.toBeInTheDocument();
    expect(posiciones()).toEqual([A, p(1, 0), C, p(0, 3)]);

    await userEvent.click(screen.getByRole("button", { name: "Quitar" }));

    expect(screen.queryByText(new RegExp(MOTIVO))).not.toBeInTheDocument();
    await waitFor(() => expect(posiciones()).toEqual([A, p(1, 0), C]));
  });

  it("al cerrar corrige también la última esquina y la esquina 1, y pide la vista previa con las corregidas", async () => {
    const b = p(4, 0);
    const c = p(4, 4);
    const acc = await montarPorEsquinas({
      [clave(A, b)]: [A, p(1, 0), p(2, 0), b],
      [clave(b, c)]: [b, p(4, 2), c],
      // La vuelta a la esquina 1 baja por (4,2) y entra por (1,0): comparte una cuadra con el tramo de antes y con el primero.
      [clave(c, A)]: [c, p(4, 2), p(2, 2), p(1, 0), A],
    });
    for (const punto of [A, b, c]) await clicEnMapa(punto);
    expect(posiciones()).toEqual([A, b, c]);

    await clicEnMapa(A);

    expect(posiciones()).toEqual([p(1, 0), b, p(4, 2)]);
    expect(screen.getByText(`Movimos las esquinas 1 y 3 ${MOTIVO}.`)).toBeInTheDocument();
    await screen.findByText("Incluye 12 ubicaciones.");
    expect(acc.vistaPreviaZona).toHaveBeenCalledTimes(1);
    expect(acc.vistaPreviaZona).toHaveBeenCalledWith(
      expect.objectContaining({
        forma: { tipoForma: "ESQUINAS", esquinas: [esquinaDe(p(1, 0)), esquinaDe(b), esquinaDe(p(4, 2))], cerrada: true },
      }),
    );
  });

  it("la zona se guarda con las esquinas corregidas", async () => {
    const b = p(4, 0);
    const c = p(4, 4);
    const acc = await montarPorEsquinas(
      { [clave(A, b)]: [A, p(2, 0), b], [clave(b, c)]: [b, p(2, 0), p(2, 2), c] },
      { guardarZona: vi.fn(async () => ({ ok: false as const, mensaje: "no importa acá" })) },
    );
    await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "Cordón");
    for (const punto of [A, b, c, A]) await clicEnMapa(punto);
    await screen.findByText("Incluye 12 ubicaciones.");

    await userEvent.click(screen.getByRole("button", { name: "Guardar zona" }));

    expect(acc.guardarZona).toHaveBeenCalledWith(
      expect.objectContaining({ forma: expect.objectContaining({ esquinas: [esquinaDe(A), esquinaDe(p(2, 0)), esquinaDe(c)], cerrada: true }) }),
    );
  });

  it("un borde sin idas y vueltas queda como se marcó, sin aviso", async () => {
    await montarPorEsquinas({});

    for (const punto of [A, p(4, 0), p(4, 4), A]) await clicEnMapa(punto);

    expect(posiciones()).toEqual([A, p(4, 0), p(4, 4)]);
    expect(screen.queryByText(new RegExp(MOTIVO))).not.toBeInTheDocument();
    expect(await screen.findByText("Incluye 12 ubicaciones.")).toBeInTheDocument();
  });

  it("la esquina corrida es el cruce que da la base para ese punto, con sus coordenadas y sus calles", async () => {
    const acc = await montarPorEsquinas(CON_VUELTA);
    await clicEnMapa(A);
    await clicEnMapa(B);
    // El cruce queda a unos centímetros del punto del tramo: es el mismo cruce.
    const cruce: Esquina = { lon: 1.0000005, lat: 0, calleA: "Constituyente", calleB: "Magallanes" };
    vi.mocked(acc.esquinaMasCercana).mockResolvedValueOnce(esquinaDe(C)).mockResolvedValueOnce(cruce);

    await clicEnMapa(C);

    expect(mapa.props?.dibujo?.esquinas).toEqual([esquinaDe(A), cruce, esquinaDe(C)]);
    expect(screen.getByText(`Movimos la esquina 2 a «Constituyente y Magallanes» ${MOTIVO}.`)).toBeInTheDocument();
  });

  it("si donde los caminos se separan no hay un cruce (el más cercano es otro), no corre nada: la base dirá si el borde sirve", async () => {
    const acc = await montarPorEsquinas(CON_VUELTA);
    await clicEnMapa(A);
    await clicEnMapa(B);
    vi.mocked(acc.esquinaMasCercana).mockResolvedValueOnce(esquinaDe(C)).mockResolvedValueOnce(esquinaDe(p(1.01, 0)));

    await clicEnMapa(C);

    expect(posiciones()).toEqual([A, B, C]);
    expect(mapa.props?.dibujo?.linea).toEqual([A, p(1, 0), B, B, p(1, 0), p(1, 1), C]);
    expect(screen.queryByText(new RegExp(MOTIVO))).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("si la base rechaza la consulta del cruce, muestra su aviso y las esquinas quedan como se marcaron", async () => {
    const acc = await montarPorEsquinas(CON_VUELTA);
    await clicEnMapa(A);
    await clicEnMapa(B);
    const rechazo = "La campaña ya terminó y su mapa queda como estaba. Dibujá las zonas en una campaña activa o futura.";
    vi.mocked(acc.esquinaMasCercana).mockResolvedValueOnce(esquinaDe(C)).mockResolvedValueOnce({ rechazo });

    await clicEnMapa(C);

    expect(screen.getByRole("alert")).toHaveTextContent(rechazo);
    expect(posiciones()).toEqual([A, B, C]);
    expect(screen.queryByText(new RegExp(MOTIVO))).not.toBeInTheDocument();
  });

  it("si la red se cae al buscar el cruce, lo dice, las esquinas quedan y «Reintentar» termina el cálculo", async () => {
    const acc = await montarPorEsquinas(CON_VUELTA);
    await clicEnMapa(A);
    await clicEnMapa(B);
    vi.mocked(acc.esquinaMasCercana).mockResolvedValueOnce(esquinaDe(C)).mockRejectedValueOnce(new TypeError("fetch failed"));

    await clicEnMapa(C);

    expect(screen.getByRole("alert")).toHaveTextContent("Necesitás conexión para calcular la zona");
    expect(posiciones()).toEqual([A, B, C]);

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await waitFor(() => expect(posiciones()).toEqual([A, p(1, 0), C]));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(new RegExp(MOTIVO))).toBeInTheDocument();
  });

  it("si en una esquina el borde desanda todo el tramo anterior, dice cuál es y qué hacer, sin borrar ninguna", async () => {
    await montarPorEsquinas({
      [clave(A, B)]: [A, p(1, 0), B],
      // De B a C pasando otra vez por A: el camino de A a B entero, de vuelta.
      [clave(B, C)]: [B, p(1, 0), A, p(0, 1), C],
    });
    await clicEnMapa(A);
    await clicEnMapa(B);

    await clicEnMapa(C);

    expect(screen.getByRole("alert")).toHaveTextContent(textoBordeVuelve(2, 3));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "En la esquina 2 el borde vuelve por la misma calle por la que llegó. Quitá la esquina 2 o la 3 con su «×» en el mapa y marcá otra.",
    );
    expect(posiciones()).toEqual([A, B, C]);
    expect(screen.getByText("ESQUINAS · 3")).toBeInTheDocument();

    // Con la «×» de la esquina 3 el aviso se va; otra esquina, que no vuelve sobre nada, entra sin aviso.
    await act(async () => mapa.props?.onQuitarEsquina?.(2));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(posiciones()).toEqual([A, B]);
    await clicEnMapa(p(2, 3));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(posiciones()).toEqual([A, B, p(2, 3)]);
  });

  it("si la esquina nueva cae sobre el tramo anterior (el borde volvería hasta ella), también lo avisa", async () => {
    await montarPorEsquinas({ [clave(A, B)]: [A, p(1, 0), B], [clave(B, p(1, 0))]: [B, p(1, 0)] });
    await clicEnMapa(A);
    await clicEnMapa(B);

    await clicEnMapa(p(1, 0));

    expect(screen.getByRole("alert")).toHaveTextContent(textoBordeVuelve(2, 3));
    expect(posiciones()).toEqual([A, B, p(1, 0)]);
  });

  it("cancelar mientras se averiguan las calles de la esquina corrida no deja nada a medias", async () => {
    let contestar: (esquina: Esquina) => void = () => undefined;
    const acc = await montarPorEsquinas(CON_VUELTA);
    await clicEnMapa(A);
    await clicEnMapa(B);
    vi.mocked(acc.esquinaMasCercana)
      .mockResolvedValueOnce(esquinaDe(C))
      .mockImplementationOnce(() => new Promise<Esquina>((listo) => (contestar = listo)));
    await clicEnMapa(C);
    // La esquina ya está marcada; lo que sigue en vuelo es el cálculo del borde.
    expect(posiciones()).toEqual([A, B, C]);

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await act(async () => contestar(esquinaDe(p(1, 0))));

    expect(mapa.props?.dibujo).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
    await userEvent.click(screen.getByRole("radio", { name: /Por esquinas/ }));
    expect(posiciones()).toEqual([]);
    expect(screen.queryByText(new RegExp(MOTIVO))).not.toBeInTheDocument();
  });

  it("dos clics seguidos se atienden de a uno: el segundo ve la esquina que el primero corrió", async () => {
    await montarPorEsquinas(CON_VUELTA);
    await clicEnMapa(A);
    await clicEnMapa(B);

    await act(async () => {
      mapa.props?.onMapaClick(C);
      mapa.props?.onMapaClick(p(0, 3));
    });

    await waitFor(() => expect(posiciones()).toEqual([A, p(1, 0), C, p(0, 3)]));
    expect(mapa.props?.dibujo?.linea).toEqual([A, p(1, 0), p(1, 0), p(1, 1), C, C, p(0, 3)]);
  });
});

describe("textoDeEsquinasCorridas", () => {
  const esquinas = [esquinaDe(A), { ...p(1, 0), calleA: "", calleB: "" }, { ...p(1, 2), calleA: "Rusia", calleB: "" }];

  it.each([
    [[], null],
    [[0], `Movimos la esquina 1 a «Calle 0 y Avenida 0» ${MOTIVO}.`],
    [[1], `Movimos la esquina 2 ${MOTIVO}.`],
    [[2], `Movimos la esquina 3 a «Rusia» ${MOTIVO}.`],
    [[0, 2], `Movimos las esquinas 1 y 3 ${MOTIVO}.`],
    [[0, 1, 2], `Movimos las esquinas 1, 2 y 3 ${MOTIVO}.`],
  ])("%j → %s", (corridas, texto) => {
    expect(textoDeEsquinasCorridas(corridas, esquinas)).toBe(texto);
  });
});
