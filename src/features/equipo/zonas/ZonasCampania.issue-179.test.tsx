import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Esquina, PoligonoGeojson, Punto, ResultadoGuardarZona, VistaPreviaZona } from "@/datos/equipo/zonas";
import { distanciaM, vertices } from "@/datos/equipo/zonas/geometria";
import { DATOS_ZONAS_SIMULADO, fuenteZonasSimulada } from "@/datos/equipo/zonas/simulado";
import { AYUDA_MOVER_CENTRO, AYUDA_RADIAL } from "@/features/equipo/zonas/PanelFormularioZona";
import { type AccionesZonas, ZonasCampania } from "@/features/equipo/zonas/ZonasCampania";
import type { PropsMapaZonas } from "@/features/equipo/zonas/tipos";

/**
 * Issue #179 (pedido de Cristian, 11/11): el radio de la zona radial se ve en vivo mientras se mueve el deslizador, el
 * centro se puede mover (arrastrándolo o con el teclado) y las zonas por esquinas muestran el aviso de la base cuando ella
 * rechaza una esquina o un tramo (la ciudad sin calles cargadas, dos esquinas sin camino entre ellas).
 */

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
/** Un centro donde un círculo de 400 m no toca ninguna zona existente. */
const CENTRO_LIBRE = nodo(3, 3.4);
const DESTINO = nodo(3.6, 3.7);

const SIN_CALLES = "Todavía no están cargadas las calles de esta ciudad. Pedile a un administrador que las cargue y volvé a intentar.";
const SIN_CAMINO = "No hay un camino por las calles entre «Pororó y Heredia» y «Rusia». Elegí otra esquina que esté sobre la misma red de calles.";

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
    casasDeZonas: vi.fn(async () => []),
    ...sobre,
  };
}

function montar(sobre: Partial<AccionesZonas> = {}) {
  const acc = acciones(sobre);
  render(<ZonasCampania datos={DATOS_ZONAS_SIMULADO} acciones={acc} />);
  return acc;
}

async function clicEnMapa(punto: Punto) {
  await act(async () => {
    mapa.props?.onMapaClick(punto);
  });
}

/** El centro movido a mano desde el mapa: `soltado` es `false` mientras se arrastra. */
async function moverCentro(punto: Punto, soltado: boolean) {
  await act(async () => {
    mapa.props?.onCentro?.(punto, soltado);
  });
}

const esperar = (ms: number) => act(async () => new Promise<void>((listo) => setTimeout(listo, ms)));

async function nuevaZonaRadialConCentro() {
  await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
  await clicEnMapa(CENTRO_LIBRE);
  await screen.findByText(/^Incluye \d+ ubicaciones\.$/);
}

async function empezarPorEsquinas() {
  await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
  await userEvent.click(screen.getByRole("radio", { name: /Por esquinas/ }));
}

const deslizador = () => screen.getByRole("slider", { name: /RADIO/ });
const campoRadio = () => screen.getByRole("spinbutton", { name: /RADIO/ });

/** El radio del círculo que el mapa tiene dibujado: de su centro a su primer vértice (hacia el este). */
function radioDibujado(centro: Punto): number {
  const poligono = mapa.props?.dibujo?.poligono as PoligonoGeojson;
  return distanciaM(centro, vertices(poligono)[0]);
}

afterEach(() => {
  mapa.props = null;
});

describe("radio en vivo con el deslizador (#179)", () => {
  it("cada paso redibuja el círculo y el número en el mapa al instante, aunque la base todavía no haya contestado", async () => {
    let pedidos = 0;
    // Después de la primera, la vista previa no contesta nunca: lo que se ve en el mapa no depende de ella.
    const vistaPreviaZona = vi.fn((e: Parameters<AccionesZonas["vistaPreviaZona"]>[0]) =>
      ++pedidos === 1 ? fuenteZonasSimulada.vistaPreviaZona(e) : new Promise<VistaPreviaZona>(() => undefined),
    );
    montar({ vistaPreviaZona });
    await nuevaZonaRadialConCentro();

    for (const valor of [500, 650, 800, 120]) {
      fireEvent.change(deslizador(), { target: { value: String(valor) } });

      expect(mapa.props?.dibujo?.radioM).toBe(valor);
      expect(mapa.props?.dibujo?.rotuloCentro?.detalle).toBe(`${valor} m`);
      expect(mapa.props?.dibujo?.poligono).not.toBeNull();
      expect(radioDibujado(CENTRO_LIBRE)).toBeCloseTo(valor, 0);
      expect(campoRadio()).toHaveValue(valor);
      expect(deslizador()).toHaveAttribute("aria-valuetext", `${valor} m`);
    }
  });

  it("el asa del borde del mapa también lo cambia en vivo", async () => {
    montar();
    await nuevaZonaRadialConCentro();

    await act(async () => mapa.props?.onRadio(930));

    expect(radioDibujado(CENTRO_LIBRE)).toBeCloseTo(930, 0);
    expect(deslizador()).toHaveValue("930");
  });

  it("arrastrarlo muchos pasos seguidos pide una sola vista previa, la del lugar donde quedó", async () => {
    const acc = montar();
    await nuevaZonaRadialConCentro();
    expect(acc.vistaPreviaZona).toHaveBeenCalledTimes(1);

    for (let valor = 401; valor <= 460; valor++) fireEvent.change(deslizador(), { target: { value: String(valor) } });

    await screen.findByText(/^Incluye \d+ ubicaciones\.$/);
    expect(acc.vistaPreviaZona).toHaveBeenCalledTimes(2);
    expect(acc.vistaPreviaZona).toHaveBeenLastCalledWith(expect.objectContaining({ forma: expect.objectContaining({ radioM: 460 }) }));
  });

  it("si la vista previa se cae a mitad del arrastre, el círculo sigue dibujado, el aviso deja reintentar y nada queda trabado", async () => {
    let caida = false;
    montar({
      vistaPreviaZona: vi.fn((e) => (caida ? Promise.reject(new TypeError("fetch failed")) : fuenteZonasSimulada.vistaPreviaZona(e))),
    });
    await nuevaZonaRadialConCentro();

    caida = true;
    fireEvent.change(deslizador(), { target: { value: "900" } });

    expect(await screen.findByRole("alert")).toHaveTextContent(/Necesitás conexión/);
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(radioDibujado(CENTRO_LIBRE)).toBeCloseTo(900, 0);
    expect(deslizador()).toBeEnabled();
    expect(screen.getByRole("button", { name: "Guardar zona" })).toBeDisabled();

    caida = false;
    fireEvent.change(deslizador(), { target: { value: "950" } });

    await screen.findByText(/^Incluye \d+ ubicaciones\.$/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(radioDibujado(CENTRO_LIBRE)).toBeCloseTo(950, 0);
  });

  it("una zona por esquinas abierta no dibuja ningún círculo", async () => {
    montar();
    await empezarPorEsquinas();
    await clicEnMapa(nodo(2, 3));

    expect(mapa.props?.dibujo?.poligono).toBeNull();
  });
});

describe("mover el centro de la zona radial (#179)", () => {
  it("la ayuda del canvas dice cómo ponerlo y, cuando ya está, se suma cómo moverlo", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));

    expect(screen.getByText(AYUDA_RADIAL)).toBeInTheDocument();
    expect(screen.queryByText(AYUDA_MOVER_CENTRO)).not.toBeInTheDocument();

    await clicEnMapa(CENTRO_LIBRE);

    expect(screen.getByText(AYUDA_RADIAL)).toBeInTheDocument();
    expect(screen.getByText(AYUDA_MOVER_CENTRO)).toBeInTheDocument();
    expect(AYUDA_MOVER_CENTRO).toBe("Para mover el centro, arrastralo o hacé clic en otro lugar del mapa.");

    // Una zona por esquinas no tiene centro: la ayuda de moverlo se va.
    await userEvent.click(screen.getByRole("radio", { name: /Por esquinas/ }));
    expect(screen.queryByText(AYUDA_MOVER_CENTRO)).not.toBeInTheDocument();
  });

  it("arrastrarlo lleva el círculo con él en vivo, con el mismo radio, y recién al soltarlo pregunta la esquina y la vista previa", async () => {
    const acc = montar();
    await nuevaZonaRadialConCentro();
    fireEvent.change(deslizador(), { target: { value: "600" } });
    await screen.findByText(/^Incluye \d+ ubicaciones\.$/);
    const esquinasPedidas = vi.mocked(acc.esquinaMasCercana).mock.calls.length;
    const previasPedidas = vi.mocked(acc.vistaPreviaZona).mock.calls.length;

    for (const paso of [nodo(3.1, 3.5), nodo(3.3, 3.6), nodo(3.5, 3.65)]) {
      act(() => mapa.props?.onCentro?.(paso, false));

      expect(mapa.props?.dibujo?.centro).toEqual(paso);
      expect(radioDibujado(paso)).toBeCloseTo(600, 0);
    }
    expect(acc.esquinaMasCercana).toHaveBeenCalledTimes(esquinasPedidas);
    expect(acc.vistaPreviaZona).toHaveBeenCalledTimes(previasPedidas);

    await moverCentro(DESTINO, true);

    expect(mapa.props?.dibujo?.centro).toEqual(DESTINO);
    expect(screen.getByText("Punto elegido en el mapa")).toBeInTheDocument();
    await waitFor(() => expect(acc.esquinaMasCercana).toHaveBeenLastCalledWith(MONTEVIDEO.id, DESTINO));
    await waitFor(() => expect(screen.queryByText("Punto elegido en el mapa")).not.toBeInTheDocument());
    await screen.findByText(/^Incluye \d+ ubicaciones\.$/);
    expect(acc.esquinaMasCercana).toHaveBeenCalledTimes(esquinasPedidas + 1);
    expect(acc.vistaPreviaZona).toHaveBeenCalledTimes(previasPedidas + 1);
    expect(acc.vistaPreviaZona).toHaveBeenLastCalledWith(
      expect.objectContaining({ forma: { tipoForma: "RADIAL", centro: DESTINO, radioM: 600 } }),
    );
    expect(deslizador()).toHaveValue("600");
  });

  it("la zona se guarda con el centro donde quedó", async () => {
    const acc = montar();
    await nuevaZonaRadialConCentro();
    await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "Casabó");

    await moverCentro(DESTINO, true);
    await screen.findByText(/^Incluye \d+ ubicaciones\.$/);
    await userEvent.click(screen.getByRole("button", { name: "Guardar zona" }));

    expect(await screen.findByText("Zona «Casabó» guardada.")).toBeInTheDocument();
    expect(acc.guardarZona).toHaveBeenCalledTimes(1);
    expect(acc.guardarZona).toHaveBeenCalledWith(expect.objectContaining({ forma: { tipoForma: "RADIAL", centro: DESTINO, radioM: 400 } }));
  });

  it("al editar una zona radial guardada también se mueve su centro", async () => {
    const acc = montar();
    const radial = MONTEVIDEO.zonas.find((z) => z.tipoForma === "RADIAL");
    if (!radial?.centro) throw new Error("Los datos simulados tienen una zona radial en Montevideo");
    await act(async () => mapa.props?.onZonaClick(radial.id));
    await userEvent.click(screen.getByRole("button", { name: /Editar/ }));

    await moverCentro(DESTINO, true);

    expect(mapa.props?.dibujo?.centro).toEqual(DESTINO);
    expect(radioDibujado(DESTINO)).toBeCloseTo(radial.radioM ?? 0, 0);
    await waitFor(() =>
      expect(acc.vistaPreviaZona).toHaveBeenLastCalledWith(expect.objectContaining({ zonaId: radial.id, forma: expect.objectContaining({ centro: DESTINO }) })),
    );
  });

  it("dos movidas seguidas (las flechas del teclado) preguntan la esquina una sola vez, por el último lugar", async () => {
    const acc = montar();
    await nuevaZonaRadialConCentro();
    const antes = vi.mocked(acc.esquinaMasCercana).mock.calls.length;
    const primero = nodo(3.2, 3.4);

    await act(async () => {
      mapa.props?.onCentro?.(primero, true);
    });
    await moverCentro(DESTINO, true);
    await waitFor(() => expect(acc.esquinaMasCercana).toHaveBeenLastCalledWith(MONTEVIDEO.id, DESTINO));
    await esperar(300);

    expect(acc.esquinaMasCercana).toHaveBeenCalledTimes(antes + 1);
    expect(acc.esquinaMasCercana).not.toHaveBeenCalledWith(MONTEVIDEO.id, primero);
    expect(mapa.props?.dibujo?.centro).toEqual(DESTINO);
  });

  it("la esquina de un lugar anterior, si contesta tarde, no le pone su nombre al centro nuevo", async () => {
    const respuestas: ((esquina: Esquina) => void)[] = [];
    montar({ esquinaMasCercana: vi.fn(() => new Promise<Esquina>((contestar) => respuestas.push(contestar))) });
    await nuevaZonaRadialConCentro();
    await moverCentro(DESTINO, true);
    await waitFor(() => expect(respuestas).toHaveLength(2));

    await act(async () => respuestas[0]({ ...CENTRO_LIBRE, calleA: "Vieja", calleB: "Calle" }));

    expect(screen.queryByText("Vieja y Calle")).not.toBeInTheDocument();
    expect(screen.getByText("Punto elegido en el mapa")).toBeInTheDocument();

    await act(async () => respuestas[1]({ ...DESTINO, calleA: "Nueva", calleB: "Esquina" }));

    expect(screen.getByText("Nueva y Esquina")).toBeInTheDocument();
  });

  it("un segundo clic en el mapa mueve el centro aunque la esquina del primero todavía no haya contestado", async () => {
    montar({ esquinaMasCercana: vi.fn(() => new Promise<Esquina>(() => undefined)) });
    await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));

    await clicEnMapa(CENTRO_LIBRE);
    await clicEnMapa(DESTINO);

    expect(mapa.props?.dibujo?.centro).toEqual(DESTINO);
    expect(radioDibujado(DESTINO)).toBeCloseTo(400, 0);
  });

  it("en una ciudad sin calles cargadas el centro igual se pone y se mueve: la zona radial no las necesita", async () => {
    montar({ esquinaMasCercana: vi.fn(async () => ({ rechazo: SIN_CALLES })) });
    await nuevaZonaRadialConCentro();

    await moverCentro(DESTINO, true);
    await esperar(300);

    expect(mapa.props?.dibujo?.centro).toEqual(DESTINO);
    expect(screen.getByText("Punto elegido en el mapa")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(await screen.findByText(/^Incluye \d+ ubicaciones\.$/)).toBeInTheDocument();
  });

  it("mientras la zona se está guardando el centro no se mueve", async () => {
    let terminar: (resultado: ResultadoGuardarZona) => void = () => undefined;
    const acc = montar({ guardarZona: vi.fn(() => new Promise<ResultadoGuardarZona>((listo) => (terminar = listo))) });
    await nuevaZonaRadialConCentro();
    await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "Casabó");
    await userEvent.click(screen.getByRole("button", { name: "Guardar zona" }));

    // El mapa ni siquiera deja agarrarlo: sin `onCentro` el punto queda fijo.
    expect(mapa.props?.onCentro).toBeUndefined();
    await moverCentro(DESTINO, true);
    await esperar(300);

    expect(mapa.props?.dibujo?.centro).toEqual(CENTRO_LIBRE);
    expect(acc.esquinaMasCercana).not.toHaveBeenCalledWith(MONTEVIDEO.id, DESTINO);

    await act(async () => terminar({ ok: false, mensaje: "Ya hay una zona «Casabó» en esta ciudad de la campaña. Elegí otro nombre." }));

    // El guardado falló: el botón vuelve y el centro se puede mover de nuevo.
    expect(screen.getByRole("alert")).toHaveTextContent("Ya hay una zona «Casabó»");
    await moverCentro(DESTINO, true);
    expect(mapa.props?.dibujo?.centro).toEqual(DESTINO);
    await screen.findByText(/^Incluye \d+ ubicaciones\.$/);
    expect(screen.getByRole("button", { name: "Guardar zona" })).toBeEnabled();
  });

  it("una zona por esquinas no tiene centro que mover", async () => {
    montar();
    await empezarPorEsquinas();
    await clicEnMapa(nodo(2, 3));

    await moverCentro(DESTINO, true);

    expect(mapa.props?.dibujo?.centro).toBeNull();
    expect(screen.getByText("ESQUINAS · 1")).toBeInTheDocument();
  });

  it("cancelar justo después de soltarlo no deja una consulta colgada, y al volver a entrar no hay centro", async () => {
    const acc = montar();
    await nuevaZonaRadialConCentro();
    const antes = vi.mocked(acc.esquinaMasCercana).mock.calls.length;

    await act(async () => {
      mapa.props?.onCentro?.(DESTINO, true);
    });
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await esperar(300);

    expect(acc.esquinaMasCercana).toHaveBeenCalledTimes(antes);
    expect(mapa.props?.dibujo).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));

    expect(mapa.props?.dibujo?.centro).toBeNull();
    expect(mapa.props?.dibujo?.poligono).toBeNull();
    expect(deslizador()).toBeDisabled();
    expect(screen.getByText(AYUDA_RADIAL)).toBeInTheDocument();
  });
});

describe("zonas por esquinas: los rechazos de la base (#179)", () => {
  it("en una ciudad sin calles cargadas el clic muestra el aviso de la base y no agrega la esquina; el puntero no insiste", async () => {
    const acc = montar({ esquinaMasCercana: vi.fn(async () => ({ rechazo: SIN_CALLES })) });
    await empezarPorEsquinas();

    await act(async () => mapa.props?.onMapaMove(nodo(2, 3)));
    await esperar(200);
    expect(acc.esquinaMasCercana).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await act(async () => mapa.props?.onMapaMove(nodo(2.1, 3)));
    await act(async () => mapa.props?.onMapaMove(nodo(2.2, 3)));
    await esperar(200);
    expect(acc.esquinaMasCercana).toHaveBeenCalledTimes(1);

    await clicEnMapa(nodo(2, 3));

    expect(screen.getByRole("alert")).toHaveTextContent(SIN_CALLES);
    expect(screen.queryByText(/Necesitás conexión/)).not.toBeInTheDocument();
    expect(screen.getByText("ESQUINAS · 0")).toBeInTheDocument();
    expect(mapa.props?.dibujo?.esquinas).toHaveLength(0);
    expect(mapa.props?.dibujo?.etiqueta).toBeNull();
  });

  it("al volver a «Radial» y entrar de nuevo a «Por esquinas», el puntero vuelve a preguntar", async () => {
    const acc = montar({ esquinaMasCercana: vi.fn(async () => ({ rechazo: SIN_CALLES })) });
    await empezarPorEsquinas();
    await act(async () => mapa.props?.onMapaMove(nodo(2, 3)));
    await esperar(200);
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await empezarPorEsquinas();
    await act(async () => mapa.props?.onMapaMove(nodo(2, 3)));
    await esperar(200);

    expect(acc.esquinaMasCercana).toHaveBeenCalledTimes(2);
  });

  it("sin camino por las calles entre dos esquinas: el aviso de la base dice además cuáles son, no se borra ninguna y se puede cambiar una", async () => {
    let sinCamino = true;
    montar({
      tramoPorCalles: vi.fn(async (c: string, a: Punto, b: Punto) =>
        sinCamino ? { rechazo: SIN_CAMINO, sinCamino: true as const } : fuenteZonasSimulada.tramoPorCalles(c, a, b),
      ),
    });
    await empezarPorEsquinas();
    await clicEnMapa(nodo(2, 3));

    await clicEnMapa(nodo(3, 3));

    expect(screen.getByRole("alert")).toHaveTextContent(
      `${SIN_CAMINO} Son las esquinas 1 y 2: quitá una de las dos con su «×» en el mapa y marcá otra.`,
    );
    // Las esquinas siguen marcadas (#182) y el ícono de carga no queda prendido.
    expect(screen.getByText("ESQUINAS · 2")).toBeInTheDocument();
    expect(document.querySelector("[data-calculando-zona]")).toBeEmptyDOMElement();

    // Se saca la esquina 2 con su «×» y se marca otra: el aviso se va.
    sinCamino = false;
    await act(async () => mapa.props?.onQuitarEsquina?.(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("ESQUINAS · 1")).toBeInTheDocument();
    await clicEnMapa(nodo(3, 4));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("ESQUINAS · 2")).toBeInTheDocument();
    expect(mapa.props?.dibujo?.linea.length).toBeGreaterThan(1);
  });

  it("quitar una esquina con un tramo nuevo que la base rechaza muestra su aviso en vez de culpar a la conexión", async () => {
    let sinCamino = false;
    montar({
      tramoPorCalles: vi.fn(async (c: string, a: Punto, b: Punto) => (sinCamino ? { rechazo: SIN_CAMINO } : fuenteZonasSimulada.tramoPorCalles(c, a, b))),
    });
    await empezarPorEsquinas();
    for (const [v, h] of [[2, 3], [3, 3], [3, 4]]) await clicEnMapa(nodo(v, h));
    expect(screen.getByText("ESQUINAS · 3")).toBeInTheDocument();

    // Sin la esquina del medio hace falta un tramo que todavía no se pidió, de la 1 a la que era la 3.
    sinCamino = true;
    await act(async () => mapa.props?.onQuitarEsquina?.(1));

    expect(await screen.findByRole("alert")).toHaveTextContent(SIN_CAMINO);
    expect(screen.queryByText(/Necesitás conexión/)).not.toBeInTheDocument();
    expect(screen.getByText("ESQUINAS · 2")).toBeInTheDocument();
  });

  it("la vista previa rechazada al cerrar la forma (el borde se cruza) muestra el aviso y no deja guardar", async () => {
    const cruzado = "El borde por las calles no forma una zona: se cruza. Mové o quitá una esquina para que el recorrido no se cruce ni vuelva sobre una calle.";
    const acc = montar({ vistaPreviaZona: vi.fn(async () => ({ rechazo: cruzado })) });
    await empezarPorEsquinas();
    await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "Santa Catalina");
    for (const [v, h] of [[2, 3], [3, 3], [3, 4], [2, 4], [2, 3]]) await clicEnMapa(nodo(v, h));

    expect(await screen.findByRole("alert")).toHaveTextContent(cruzado);
    expect(screen.getByRole("button", { name: "Guardar zona" })).toBeDisabled();
    expect(acc.guardarZona).not.toHaveBeenCalled();

    // «Quitar» reabre la forma para corregirla.
    await userEvent.click(screen.getByRole("button", { name: "Quitar" }));
    expect(screen.getByText("ESQUINAS · 3")).toBeInTheDocument();
  });
});
