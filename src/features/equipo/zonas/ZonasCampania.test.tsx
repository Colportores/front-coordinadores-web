import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CiudadDeCampania, DatosZonas, Punto, ResultadoGuardarZona } from "@/datos/equipo/zonas";
import { DATOS_ZONAS_SIMULADO, fuenteZonasSimulada } from "@/datos/equipo/zonas/simulado";
import { type AccionesZonas, ZonasCampania } from "@/features/equipo/zonas/ZonasCampania";
import type { PropsMapaZonas } from "@/features/equipo/zonas/tipos";

const mapa = vi.hoisted(() => ({ props: null as PropsMapaZonas | null }));
vi.mock("@/features/equipo/zonas/MapaZonas", () => ({
  MapaZonas: (props: PropsMapaZonas) => {
    mapa.props = props;
    return <div data-testid="mapa" />;
  },
}));

const MONTEVIDEO = DATOS_ZONAS_SIMULADO.ciudades[0];
const ORIGEN: Punto = (MONTEVIDEO.zonas[0].esquinas as Punto[])[0];
/** Cruce (v, h) de la grilla de calles simulada: `v` de oeste a este y `h` de norte a sur. */
const nodo = (v: number, h: number): Punto => ({ lon: ORIGEN.lon + v * 0.0045, lat: ORIGEN.lat - h * 0.004 });

/** Un centro donde un círculo de 400 m no toca ninguna zona existente. */
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

function montar(sobre: Partial<AccionesZonas> = {}, datos: DatosZonas = DATOS_ZONAS_SIMULADO) {
  const acc = acciones(sobre);
  render(<ZonasCampania datos={datos} acciones={acc} />);
  return acc;
}

async function clicEnMapa(punto: Punto) {
  await act(async () => {
    mapa.props?.onMapaClick(punto);
  });
}

async function empezarPorEsquinas(nombre = "Santa Catalina") {
  await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
  await userEvent.click(screen.getByRole("radio", { name: /Por esquinas/ }));
  if (nombre) await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), nombre);
}

/** Marca las esquinas en orden y espera a que cada una aparezca en la lista. */
async function marcar(...cruces: [number, number][]) {
  for (const [i, [v, h]] of cruces.entries()) {
    await clicEnMapa(nodo(v, h));
    await waitFor(() => expect(screen.getByText(`ESQUINAS · ${i + 1}`)).toBeInTheDocument());
  }
}

afterEach(() => {
  mapa.props = null;
});

describe("ZonasCampania", () => {
  describe("01 · zonas de la campaña en una ciudad", () => {
    it("muestra las ciudades con su cantidad de zonas y «+ Agregar ciudad» habilitado", () => {
      montar();

      expect(screen.getByRole("heading", { name: "Zonas · Verano 2026" })).toBeInTheDocument();
      const ciudades = screen.getByRole("navigation", { name: "Ciudades de la campaña" });
      expect(within(ciudades).getByRole("button", { name: /Montevideo/ })).toHaveTextContent("4 zonas");
      expect(within(ciudades).getByRole("button", { name: /Las Piedras/ })).toHaveTextContent("2 zonas");
      expect(within(ciudades).getByRole("button", { name: /Canelones/ })).toHaveTextContent("sin zonas");
      expect(screen.getByRole("button", { name: "+ Agregar ciudad" })).toBeEnabled();
    });

    it("lista las zonas con su forma, sus colportores y sus ubicaciones", () => {
      montar();
      const lista = screen.getByRole("region", { name: "Zonas de Montevideo" });

      expect(within(lista).getByRole("button", { name: "Ver la zona Cerro Norte" })).toHaveTextContent(
        "Por esquinas · 6 puntos",
      );
      expect(within(lista).getByText("Diego Rocha, Joel Cabrera")).toBeInTheDocument();
      expect(within(lista).getByText("142 ubicaciones registradas")).toBeInTheDocument();
      expect(within(lista).getByRole("button", { name: "Ver la zona Paso de la Arena" })).toHaveTextContent("Radial · 600 m");
      expect(within(lista).getByRole("button", { name: "Ver la zona Belvedere" })).toHaveTextContent("◔ Sin colportores");
    });

    it("muestra a los colportores sin zona en la ciudad, con «Asignar»", () => {
      montar();
      const sinZona = screen.getByRole("region", { name: "Sin zona en Montevideo" });

      expect(within(sinZona).getByText("Pablo Ferreira")).toBeInTheDocument();
      expect(within(sinZona).getAllByText("Sin zona en Montevideo")).toHaveLength(2);
      expect(within(sinZona).getByRole("button", { name: "Asignar zona a Pablo Ferreira" })).toHaveTextContent("Asignar");
    });

    it("un colportor suspendido aparece marcado en «Sin zona» y no se le puede asignar", () => {
      montar();
      const sinZona = screen.getByRole("region", { name: "Sin zona en Montevideo" });

      expect(within(sinZona).getByText("Sergio Píriz")).toBeInTheDocument();
      expect(within(sinZona).getByText(/Cuenta suspendida\. Pedile a un administrador que la reactive\./)).toBeInTheDocument();
      expect(within(sinZona).getByRole("button", { name: "Asignar zona a Sergio Píriz" })).toBeDisabled();
      expect(within(sinZona).getByRole("button", { name: "Asignar zona a Pablo Ferreira" })).toBeEnabled();
    });

    it("le pasa al mapa las zonas de la ciudad", () => {
      montar();
      expect(mapa.props?.zonas.map((z) => z.nombre)).toEqual(["Cerro Norte", "La Teja", "Paso de la Arena", "Belvedere"]);
      expect(mapa.props?.dibujo).toBeNull();
    });

    it("al cambiar de ciudad muestra sus zonas; una ciudad sin zonas lo dice", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: /Las Piedras/ }));
      expect(screen.getByRole("region", { name: "Zonas de Las Piedras" })).toHaveTextContent("Barrio Sur");
      expect(screen.queryByRole("region", { name: /Sin zona en/ })).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: /Canelones/ }));
      expect(screen.getByText("Todavía no hay zonas en Canelones. Creá la primera con «+ Nueva zona».")).toBeInTheDocument();
    });

    it("elegir una zona en el mapa abre su detalle", async () => {
      montar();
      await act(async () => mapa.props?.onZonaClick("zona-belvedere"));
      expect(screen.getByRole("region", { name: "Zona Belvedere" })).toBeInTheDocument();
      expect(mapa.props?.zonaElegidaId).toBe("zona-belvedere");
    });
  });

  describe("02 · nueva zona radial", () => {
    it("pide el centro en el mapa, pone el radio en 400 m y avisa cuántas ubicaciones incluye", async () => {
      const acc = montar();
      await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
      await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "Casabó");

      expect(screen.getByRole("radio", { name: /Radial/ })).toBeChecked();
      expect(screen.getByText("Hacé clic en el mapa para poner el centro y arrastrá el punto del borde para cambiar el radio.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Guardar zona" })).toBeDisabled();

      await clicEnMapa(CENTRO_LIBRE);

      expect(await screen.findByText(/^Incluye \d+ ubicaciones\.$/)).toBeInTheDocument();
      expect(screen.getByRole("spinbutton", { name: /RADIO/ })).toHaveValue(400);
      expect(await screen.findByText("Pororó y Egipto")).toBeInTheDocument();
      expect(mapa.props?.dibujo?.rotuloCentro).toEqual({ nombre: "Casabó", detalle: "400 m" });
      expect(acc.vistaPreviaZona).toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Guardar zona" })).toBeEnabled();
    });

    it("al arrastrar el borde cambia el radio y se vuelve a calcular la vista previa", async () => {
      const acc = montar();
      await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
      await clicEnMapa(CENTRO_LIBRE);
      await screen.findByText(/Incluye/);

      await act(async () => mapa.props?.onRadio(600));

      expect(screen.getByRole("spinbutton", { name: /RADIO/ })).toHaveValue(600);
      await waitFor(() => expect(acc.vistaPreviaZona).toHaveBeenCalledTimes(2));
    });

    it("acota el radio de 1 a 3000 m y descarta lo que no es un número positivo", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
      await clicEnMapa(CENTRO_LIBRE);
      const radio = screen.getByRole("spinbutton", { name: /RADIO/ });

      await userEvent.clear(radio);
      await userEvent.type(radio, "99999");
      expect(radio).toHaveValue(3000);

      await userEvent.clear(radio);
      await userEvent.type(radio, "0");
      expect(mapa.props?.dibujo?.radioM).toBe(3000);
    });

    it("guarda la zona, la suma a la lista y abre su detalle", async () => {
      const acc = montar();
      await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
      await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "Casabó");
      await clicEnMapa(CENTRO_LIBRE);
      await screen.findByText(/Incluye/);

      await userEvent.click(screen.getByRole("button", { name: "Guardar zona" }));

      expect(await screen.findByRole("region", { name: "Zona Casabó" })).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("Zona «Casabó» guardada.");
      expect(acc.guardarZona).toHaveBeenCalledWith(
        expect.objectContaining({ ciudadId: "ciudad-montevideo", nombre: "Casabó" }),
      );
      expect(screen.getByRole("button", { name: /Montevideo/ })).toHaveTextContent("5 zonas");
      expect(mapa.props?.zonas.map((z) => z.nombre)).toContain("Casabó");
    });

    it("cancelar vuelve a la lista sin guardar nada", async () => {
      const acc = montar();
      await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
      await userEvent.click(screen.getByRole("button", { name: "Cancelar", hidden: false }));

      expect(screen.getByRole("region", { name: "Zonas de Montevideo" })).toBeInTheDocument();
      expect(acc.guardarZona).not.toHaveBeenCalled();
      expect(mapa.props?.dibujo).toBeNull();
    });
  });

  describe("03 · nueva zona por esquinas", () => {
    it("numera las esquinas con los nombres de las calles y dibuja el borde por las calles", async () => {
      montar();
      await empezarPorEsquinas();
      expect(
        screen.getByText("Hacé clic en las esquinas en orden. El borde sigue las calles; para cerrar, tocá la esquina 1."),
      ).toBeInTheDocument();

      await marcar([3, 3], [4, 3], [4, 4]);

      const esquinas = screen.getByRole("list", { name: "ESQUINAS · 3" });
      expect(within(esquinas).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
        "1Pororó y Egipto",
        "2Pororó y China",
        "3Rusia y China",
      ]);
      expect(mapa.props?.dibujo?.esquinas).toHaveLength(3);
      expect(mapa.props?.dibujo?.linea.length).toBeGreaterThan(2);
      expect(screen.getByRole("button", { name: "Guardar zona" })).toBeDisabled();
    });

    it("cierra tocando la esquina 1 y recién ahí calcula la zona", async () => {
      const acc = montar();
      await empezarPorEsquinas();
      await marcar([2, 3], [3, 3], [3, 4], [2, 4]);
      expect(acc.vistaPreviaZona).not.toHaveBeenCalled();

      await clicEnMapa(nodo(2, 3));

      expect(await screen.findByText(/^Incluye \d+ ubicaciones\.$/)).toBeInTheDocument();
      expect(mapa.props?.dibujo?.poligono).not.toBeNull();
    });

    it("avisa cuando comparte una calle como borde con otra zona", async () => {
      montar();
      await empezarPorEsquinas();
      await marcar([2, 3], [3, 3], [3, 4], [2, 4]);
      await clicEnMapa(nodo(2, 3));

      await waitFor(() => expect(mapa.props?.dibujo?.comparte?.texto).toBe("Comparte la calle Heredia con Belvedere"));
      expect(screen.getByRole("button", { name: "Guardar zona" })).toBeEnabled();
    });

    it("si se superpone avisa con quién y marca en rojo el tramo, pero deja guardar", async () => {
      const acc = montar();
      await empezarPorEsquinas();
      await marcar([1, 3], [3, 3], [3, 4], [1, 4]);
      await clicEnMapa(nodo(1, 3));

      expect(await screen.findByRole("status")).toHaveTextContent(
        "Esta zona se superpone con «Belvedere» en el tramo marcado en rojo. Podés guardarla igual.",
      );
      expect(mapa.props?.dibujo?.conflicto?.length).toBeGreaterThan(1);
      expect(screen.getByRole("button", { name: "Guardar zona" })).toBeEnabled();

      await userEvent.click(screen.getByRole("button", { name: "Guardar zona" }));

      expect(acc.guardarZona).toHaveBeenCalledTimes(1);
      expect(await screen.findByText("Zona «Santa Catalina» guardada.")).toBeInTheDocument();
    });

    it("«Quitar» saca la última esquina y reabre una forma cerrada", async () => {
      montar();
      await empezarPorEsquinas();
      await marcar([2, 3], [3, 3], [3, 4], [2, 4]);
      await clicEnMapa(nodo(2, 3));
      await screen.findByText(/Incluye/);

      await userEvent.click(screen.getByRole("button", { name: "Quitar" }));

      expect(screen.getByText("ESQUINAS · 3")).toBeInTheDocument();
      expect(screen.queryByText(/Incluye/)).not.toBeInTheDocument();
      expect(mapa.props?.dibujo?.poligono).toBeNull();
      await waitFor(() => expect(mapa.props?.dibujo?.linea.length).toBeGreaterThan(1));
    });

    it("no repite una esquina ya marcada ni agrega la misma dos veces seguidas", async () => {
      montar();
      await empezarPorEsquinas();
      await marcar([3, 3], [4, 3]);

      await clicEnMapa(nodo(4, 3));
      await clicEnMapa(nodo(3, 3));

      await waitFor(() => expect(mapa.props?.dibujo?.esquinas).toHaveLength(2));
    });

    it("con menos de 3 esquinas, tocar la primera no cierra la forma", async () => {
      montar();
      await empezarPorEsquinas();
      await marcar([3, 3], [4, 3]);
      await clicEnMapa(nodo(3, 3));

      expect(screen.getByText("ESQUINAS · 2")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Guardar zona" })).toBeDisabled();
    });

    it("muestra «<calle> y <calle> · clic para agregar» junto a la esquina más cercana al puntero", async () => {
      montar();
      await empezarPorEsquinas();

      act(() => mapa.props?.onMapaMove(nodo(3, 3)));

      await waitFor(() => expect(mapa.props?.dibujo?.etiqueta?.texto).toBe("Pororó y Egipto · clic para agregar"));
    });

    it("cambiar la forma a radial descarta las esquinas ya marcadas", async () => {
      montar();
      await empezarPorEsquinas();
      await marcar([3, 3], [4, 3]);

      await userEvent.click(screen.getByRole("radio", { name: /Radial/ }));

      expect(mapa.props?.dibujo?.esquinas).toEqual([]);
      expect(screen.getByRole("textbox", { name: "NOMBRE" })).toHaveValue("Santa Catalina");
    });
  });

  describe("04 · asignar colportor a una zona", () => {
    it("muestra quién trabaja la zona y a quién se le puede asignar, con la zona de hoy de cada uno", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Belvedere" }));

      const detalle = screen.getByRole("region", { name: "Zona Belvedere" });
      expect(within(detalle).getByText("COLPORTORES · 0")).toBeInTheDocument();
      expect(within(detalle).getByText("◔ Nadie trabaja esta zona")).toBeInTheDocument();
      expect(within(detalle).getByText("Por esquinas · 4 puntos · 21 ubicaciones", { exact: false })).toBeInTheDocument();
      expect(
        within(detalle).getByText("Elegir a alguien con zona lo cambia de zona; sus ubicaciones registradas no se mueven."),
      ).toBeInTheDocument();

      await userEvent.click(within(detalle).getByRole("button", { name: /ASIGNAR COLPORTOR/ }));
      const opciones = within(within(detalle).getByRole("listbox")).getAllByRole("option");
      expect(opciones.map((o) => o.textContent)).toEqual([
        "DRDiego Rochahoy en Cerro Norte",
        "MVMelina Vázquezhoy en La Teja",
        "LSLaura Suárezhoy en Paso de la Arena",
        "JCJoel Cabrerahoy en Cerro Norte",
        "PFPablo Ferreira◔ Sin zona",
        "NANoelia Acostahoy en La Teja",
        "SPSergio Píriz⊘ Cuenta suspendida. Pedile a un administrador que la reactive.",
      ]);
    });

    it("«Asignar a <zona>» está apagado hasta elegir a alguien", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Belvedere" }));
      expect(screen.getByRole("button", { name: "Asignar a Belvedere" })).toBeDisabled();
    });

    it("asigna al colportor sin zona, lo pasa a la zona y actualiza la lista", async () => {
      const acc = montar();
      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Belvedere" }));
      await userEvent.click(screen.getByRole("button", { name: /ASIGNAR COLPORTOR/ }));
      await userEvent.click(screen.getByRole("option", { name: /Pablo Ferreira/ }));

      await userEvent.click(screen.getByRole("button", { name: "Asignar a Belvedere" }));

      expect(acc.asignarZona).toHaveBeenCalledWith("col-5", "zona-belvedere");
      expect(await screen.findByText("Pablo Ferreira quedó en Belvedere.")).toBeInTheDocument();
      const detalle = screen.getByRole("region", { name: "Zona Belvedere" });
      expect(within(detalle).getByText("COLPORTORES · 1")).toBeInTheDocument();
      await userEvent.click(within(detalle).getByRole("button", { name: "Cerrar el detalle de la zona" }));
      expect(within(screen.getByRole("region", { name: "Sin zona en Montevideo" })).queryByText("Pablo Ferreira")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Ver la zona Belvedere" })).toHaveTextContent("Pablo Ferreira");
    });

    it("asignar a alguien que tiene otra zona lo saca de la anterior", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Belvedere" }));
      await userEvent.click(screen.getByRole("button", { name: /ASIGNAR COLPORTOR/ }));
      await userEvent.click(screen.getByRole("option", { name: /Diego Rocha/ }));
      await userEvent.click(screen.getByRole("button", { name: "Asignar a Belvedere" }));
      await screen.findByText("Diego Rocha quedó en Belvedere.");

      await userEvent.click(screen.getByRole("button", { name: "Cerrar el detalle de la zona" }));

      expect(screen.getByRole("button", { name: "Ver la zona Cerro Norte" })).not.toHaveTextContent("Diego Rocha");
      expect(screen.getByRole("button", { name: "Ver la zona Belvedere" })).toHaveTextContent("Diego Rocha");
    });

    it("no deja asignar a quien ya trabaja esa zona", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Cerro Norte" }));
      await userEvent.click(screen.getByRole("button", { name: /ASIGNAR COLPORTOR/ }));
      await userEvent.click(screen.getByRole("option", { name: /Diego Rocha/ }));

      expect(screen.getByRole("button", { name: "Asignar a Cerro Norte" })).toBeDisabled();
      expect(screen.getByText("Diego Rocha ya trabaja esta zona.")).toBeInTheDocument();
    });

    it("«Asignar» en «Sin zona» pide elegir la zona y la abre con el colportor ya elegido", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "Asignar zona a Pablo Ferreira" }));
      expect(screen.getByRole("status")).toHaveTextContent("Elegí la zona para Pablo Ferreira, en la lista o en el mapa.");

      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Belvedere" }));

      expect(screen.getByRole("button", { name: /Pablo Ferreira/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Asignar a Belvedere" })).toBeEnabled();
    });

    it("«Editar forma» abre la forma de la zona y avisa cuántas ubicaciones incluye antes de guardar", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Paso de la Arena" }));
      await userEvent.click(screen.getByRole("button", { name: "Editar forma" }));
      expect(screen.getByRole("region", { name: "Editar zona" })).toBeInTheDocument();
      expect(screen.getByRole("spinbutton", { name: /RADIO/ })).toHaveValue(600);

      await act(async () => mapa.props?.onRadio(300));

      expect(await screen.findByText(/^Incluye \d+ ubicaciones\.$/)).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Guardar zona" }));
      expect(await screen.findByRole("region", { name: "Zona Paso de la Arena" })).toHaveTextContent("Radial · 300 m");
    });
  });

  describe("casos límite", () => {
    it("un doble clic en «Guardar zona» guarda una sola vez", async () => {
      let liberar: (r: ResultadoGuardarZona) => void = () => undefined;
      const acc = montar({
        guardarZona: vi.fn(() => new Promise<ResultadoGuardarZona>((resolver) => (liberar = resolver))),
      });
      await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
      await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "Casabó");
      await clicEnMapa(CENTRO_LIBRE);
      await screen.findByText(/Incluye/);

      await userEvent.dblClick(screen.getByRole("button", { name: "Guardar zona" }));
      expect(acc.guardarZona).toHaveBeenCalledTimes(1);

      await act(async () => liberar({ ok: false, mensaje: "Ya hay una zona llamada «Casabó» en Montevideo." }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Ya hay una zona llamada «Casabó» en Montevideo.");
      expect(screen.getByRole("button", { name: "Guardar zona" })).toBeEnabled();
    });

    it("mientras guarda no se puede cancelar, cerrar ni cambiar de ciudad, y la zona guardada aparece en la lista", async () => {
      let liberar: (r: ResultadoGuardarZona) => void = () => undefined;
      const acc = montar({
        guardarZona: vi.fn(() => new Promise<ResultadoGuardarZona>((resolver) => (liberar = resolver))),
      });
      await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
      await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "Casabó");
      await clicEnMapa(CENTRO_LIBRE);
      await screen.findByText(/Incluye/);
      await userEvent.click(screen.getByRole("button", { name: "Guardar zona" }));

      expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cerrar el formulario de zona" })).toBeDisabled();
      expect(screen.getByRole("button", { name: /Las Piedras/ })).toBeDisabled();
      await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
      await userEvent.click(screen.getByRole("button", { name: /Las Piedras/ }));
      expect(screen.getByRole("region", { name: "Nueva zona" })).toBeInTheDocument();

      const guardada = (await fuenteZonasSimulada.guardarZona({
        ciudadId: "ciudad-montevideo",
        nombre: "Casabó",
        forma: { tipoForma: "RADIAL", centro: CENTRO_LIBRE, radioM: 400 },
      })) as Extract<ResultadoGuardarZona, { ok: true }>;
      await act(async () => liberar(guardada));

      expect(await screen.findByRole("region", { name: "Zona Casabó" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Montevideo/ })).toHaveTextContent("5 zonas");
      expect(screen.getByRole("button", { name: /Las Piedras/ })).toBeEnabled();
      expect(acc.guardarZona).toHaveBeenCalledTimes(1);
    });

    it("si guardar falla, el botón vuelve a habilitarse y se puede reintentar", async () => {
      const guardar = vi.fn(fuenteZonasSimulada.guardarZona).mockRejectedValueOnce(new Error("sin red"));
      montar({ guardarZona: guardar });
      await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
      await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "Casabó");
      await clicEnMapa(CENTRO_LIBRE);
      await screen.findByText(/Incluye/);

      await userEvent.click(screen.getByRole("button", { name: "Guardar zona" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo conectar. Probá de nuevo en unos segundos.");
      expect(screen.getByRole("button", { name: "Guardar zona" })).toBeEnabled();

      await userEvent.click(screen.getByRole("button", { name: "Guardar zona" }));
      expect(await screen.findByRole("region", { name: "Zona Casabó" })).toBeInTheDocument();
    });

    it("un nombre repetido vuelve como aviso y no cierra el formulario", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
      await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "belvedere");
      await clicEnMapa(CENTRO_LIBRE);
      await screen.findByText(/Incluye/);

      await userEvent.click(screen.getByRole("button", { name: "Guardar zona" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Ya hay una zona llamada «belvedere» en Montevideo.");
      expect(screen.getByRole("region", { name: "Nueva zona" })).toBeInTheDocument();
    });

    it("con el nombre en blanco no se puede guardar", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
      await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "   ");
      await clicEnMapa(CENTRO_LIBRE);
      await screen.findByText(/Incluye/);

      expect(screen.getByRole("button", { name: "Guardar zona" })).toBeDisabled();
    });

    it("si asignar falla, ningún estado de ocupado queda trabado y se puede reintentar", async () => {
      const asignar = vi
        .fn<AccionesZonas["asignarZona"]>()
        .mockRejectedValueOnce(new Error("sin red"))
        .mockResolvedValueOnce({ ok: true });
      montar({ asignarZona: asignar });
      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Belvedere" }));
      await userEvent.click(screen.getByRole("button", { name: /ASIGNAR COLPORTOR/ }));
      await userEvent.click(screen.getByRole("option", { name: /Pablo Ferreira/ }));

      await userEvent.click(screen.getByRole("button", { name: "Asignar a Belvedere" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo conectar. Probá de nuevo en unos segundos.");
      expect(screen.getByRole("button", { name: "Asignar a Belvedere" })).toBeEnabled();

      await userEvent.click(screen.getByRole("button", { name: "Asignar a Belvedere" }));
      expect(await screen.findByText("Pablo Ferreira quedó en Belvedere.")).toBeInTheDocument();
    });

    it("si asignar viene rechazado, muestra el mensaje del BFF", async () => {
      montar({ asignarZona: vi.fn(async () => ({ ok: false as const, mensaje: "La zona ya no existe." })) });
      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Belvedere" }));
      await userEvent.click(screen.getByRole("button", { name: /ASIGNAR COLPORTOR/ }));
      await userEvent.click(screen.getByRole("option", { name: /Pablo Ferreira/ }));
      await userEvent.click(screen.getByRole("button", { name: "Asignar a Belvedere" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("La zona ya no existe.");
      expect(screen.getByRole("button", { name: "Asignar a Belvedere" })).toBeEnabled();
    });

    it("un doble clic en «Asignar a <zona>» asigna una sola vez", async () => {
      const acc = montar({ asignarZona: vi.fn(() => new Promise<{ ok: true }>((r) => setTimeout(() => r({ ok: true }), 30))) });
      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Belvedere" }));
      await userEvent.click(screen.getByRole("button", { name: /ASIGNAR COLPORTOR/ }));
      await userEvent.click(screen.getByRole("option", { name: /Pablo Ferreira/ }));

      await userEvent.dblClick(screen.getByRole("button", { name: "Asignar a Belvedere" }));

      await screen.findByText("Pablo Ferreira quedó en Belvedere.");
      expect(acc.asignarZona).toHaveBeenCalledTimes(1);
    });

    it("dos clics seguidos en el mapa, antes de que conteste el primero, marcan las dos esquinas en orden", async () => {
      const lenta = vi.fn(
        (c: string, p: Punto) => new Promise<Awaited<ReturnType<typeof fuenteZonasSimulada.esquinaMasCercana>>>((r) => setTimeout(() => r(fuenteZonasSimulada.esquinaMasCercana(c, p)), 25)),
      );
      montar({ esquinaMasCercana: lenta as AccionesZonas["esquinaMasCercana"] });
      await empezarPorEsquinas();

      await act(async () => {
        mapa.props?.onMapaClick(nodo(3, 3));
        mapa.props?.onMapaClick(nodo(4, 3));
        mapa.props?.onMapaClick(nodo(4, 4));
      });

      await waitFor(() => expect(screen.getByText("ESQUINAS · 3")).toBeInTheDocument());
      expect(mapa.props?.dibujo?.esquinas.map((e) => `${e.calleA} y ${e.calleB}`)).toEqual([
        "Pororó y Egipto",
        "Pororó y China",
        "Rusia y China",
      ]);
    });

    it("cancelar mientras espera al BFF descarta esa respuesta y el próximo dibujo arranca limpio", async () => {
      let liberar: () => void = () => undefined;
      const lenta = vi.fn(
        (c: string, p: Punto) =>
          new Promise<Awaited<ReturnType<typeof fuenteZonasSimulada.esquinaMasCercana>>>((r) => {
            liberar = () => r(fuenteZonasSimulada.esquinaMasCercana(c, p));
          }),
      );
      montar({ esquinaMasCercana: lenta as AccionesZonas["esquinaMasCercana"] });
      await empezarPorEsquinas();
      act(() => {
        mapa.props?.onMapaClick(nodo(3, 3));
      });

      await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
      await act(async () => liberar());
      await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
      await userEvent.click(screen.getByRole("radio", { name: /Por esquinas/ }));

      expect(screen.getByText("ESQUINAS · 0")).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "NOMBRE" })).toHaveValue("");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("cambiar de ciudad a mitad de un dibujo lo descarta", async () => {
      montar();
      await empezarPorEsquinas();
      await marcar([3, 3]);

      await userEvent.click(screen.getByRole("button", { name: /Las Piedras/ }));

      expect(screen.queryByRole("region", { name: "Nueva zona" })).not.toBeInTheDocument();
      expect(screen.getByRole("region", { name: "Zonas de Las Piedras" })).toBeInTheDocument();
      expect(mapa.props?.dibujo).toBeNull();
    });

    it("si el BFF no contesta al marcar una esquina, avisa y se puede seguir", async () => {
      const esquina = vi.fn(fuenteZonasSimulada.esquinaMasCercana).mockRejectedValueOnce(new Error("sin red"));
      montar({ esquinaMasCercana: esquina });
      await empezarPorEsquinas();

      await clicEnMapa(nodo(3, 3));
      expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo conectar. Probá de nuevo en unos segundos.");

      await clicEnMapa(nodo(3, 3));
      await waitFor(() => expect(screen.getByText("ESQUINAS · 1")).toBeInTheDocument());
    });

    it("si falla la vista previa, avisa y no deja guardar a ciegas", async () => {
      montar({ vistaPreviaZona: vi.fn().mockRejectedValue(new Error("sin red")) });
      await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
      await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "Casabó");
      await clicEnMapa(CENTRO_LIBRE);

      expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo conectar");
      expect(screen.getByRole("button", { name: "Guardar zona" })).toBeDisabled();
    });

    it("volver a abrir el detalle de una zona no arrastra errores ni elecciones anteriores", async () => {
      montar({ asignarZona: vi.fn(async () => ({ ok: false as const, mensaje: "La zona ya no existe." })) });
      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Belvedere" }));
      await userEvent.click(screen.getByRole("button", { name: /ASIGNAR COLPORTOR/ }));
      await userEvent.click(screen.getByRole("option", { name: /Pablo Ferreira/ }));
      await userEvent.click(screen.getByRole("button", { name: "Asignar a Belvedere" }));
      await screen.findByRole("alert");

      await userEvent.click(screen.getByRole("button", { name: "Cerrar el detalle de la zona" }));
      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Belvedere" }));

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Asignar a Belvedere" })).toBeDisabled();
    });

    it("con 40 zonas y un nombre larguísimo, muestra todas sin romperse", () => {
      const nombreLargo = "Zona de las Siete Cuchillas del Norte Alto ".repeat(6).trim();
      const ciudad: CiudadDeCampania = {
        ...MONTEVIDEO,
        zonas: Array.from({ length: 40 }, (_, i) => ({
          ...MONTEVIDEO.zonas[0],
          id: `z${i}`,
          nombre: i === 0 ? nombreLargo : `Zona ${i}`,
          colportores: [],
        })),
      };
      montar({}, { ...DATOS_ZONAS_SIMULADO, ciudades: [ciudad] });

      const lista = screen.getByRole("region", { name: "Zonas de Montevideo" });
      expect(within(lista).getAllByRole("listitem")).toHaveLength(40);
      expect(within(lista).getByText(nombreLargo)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Montevideo/ })).toHaveTextContent("40 zonas");
    });

    it("una ciudad con una sola zona dice «1 zona»", () => {
      const ciudad: CiudadDeCampania = { ...MONTEVIDEO, zonas: MONTEVIDEO.zonas.slice(0, 1) };
      montar({}, { ...DATOS_ZONAS_SIMULADO, ciudades: [ciudad] });
      expect(screen.getByRole("button", { name: /Montevideo/ })).toHaveTextContent("1 zona");
    });

    it("una ciudad sin colportores no ofrece a nadie para asignar", async () => {
      const ciudad: CiudadDeCampania = { ...MONTEVIDEO, colportores: [] };
      montar({}, { ...DATOS_ZONAS_SIMULADO, ciudades: [ciudad] });
      expect(screen.queryByRole("region", { name: /Sin zona en/ })).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Belvedere" }));
      await userEvent.click(screen.getByRole("button", { name: /ASIGNAR COLPORTOR/ }));
      expect(screen.getByText("No hay colportores de la campaña en Montevideo.")).toBeInTheDocument();
    });

    it("Escape cierra el desplegable de colportores", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Belvedere" }));
      await userEvent.click(screen.getByRole("button", { name: /ASIGNAR COLPORTOR/ }));
      expect(screen.getByRole("listbox")).toBeInTheDocument();

      await userEvent.keyboard("{Escape}");

      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  describe("«+ Agregar ciudad»: buscador del catálogo", () => {
    const buscarCiudades = (texto: string) => fuenteZonasSimulada.buscarCiudades("campania-verano-2026", texto);

    async function abrirBuscador() {
      await userEvent.click(screen.getByRole("button", { name: "+ Agregar ciudad" }));
      return screen.getByRole("region", { name: "Agregar ciudad" });
    }

    it("abre un buscador con el catálogo, sin las ciudades que ya están en la campaña", async () => {
      montar();
      const buscador = await abrirBuscador();

      const lista = await within(buscador).findByRole("list", { name: "Ciudades del catálogo" });
      const nombres = within(lista).getAllByRole("listitem").map((li) => li.textContent);
      expect(nombres).toContain("SaltoSalto");
      expect(nombres).toContain("PaysandúPaysandú");
      expect(nombres.join("|")).not.toMatch(/Montevideo|Las Piedras|Canelones/);
      expect(within(buscador).getByRole("searchbox", { name: /BUSCAR POR NOMBRE O PROVINCIA/ })).toHaveFocus();
    });

    it("mientras busca dice «Buscando ciudades…»", async () => {
      let liberar: (c: Awaited<ReturnType<typeof buscarCiudades>>) => void = () => undefined;
      montar({ buscarCiudades: vi.fn(() => new Promise<Awaited<ReturnType<typeof buscarCiudades>>>((r) => (liberar = r))) });
      const buscador = await abrirBuscador();

      expect(await within(buscador).findByText("Buscando ciudades…")).toBeInTheDocument();

      await act(async () => liberar([{ id: "cat-salto", nombre: "Salto", provincia: "Salto" }]));
      expect(within(buscador).queryByText("Buscando ciudades…")).not.toBeInTheDocument();
      expect(within(buscador).getByRole("button", { name: "Agregar Salto, Salto" })).toBeInTheDocument();
    });

    it("filtra al escribir por nombre o provincia y dice cuando no hay coincidencias", async () => {
      const acc = montar();
      const buscador = await abrirBuscador();
      await within(buscador).findByRole("list", { name: "Ciudades del catálogo" });

      await userEvent.type(within(buscador).getByRole("searchbox"), "soriano");
      await waitFor(() => expect(within(buscador).queryByRole("button", { name: /Agregar Salto/ })).not.toBeInTheDocument());
      expect(within(buscador).getByRole("button", { name: "Agregar Mercedes, Soriano" })).toBeInTheDocument();
      expect(acc.buscarCiudades).toHaveBeenLastCalledWith("soriano");

      await userEvent.clear(within(buscador).getByRole("searchbox"));
      await userEvent.type(within(buscador).getByRole("searchbox"), "zzz");
      expect(await within(buscador).findByText("No hay ciudades que coincidan con «zzz».")).toBeInTheDocument();
    });

    it("si el catálogo no tiene más ciudades que ofrecer, lo dice", async () => {
      montar({ buscarCiudades: vi.fn(async () => []) });
      const buscador = await abrirBuscador();

      expect(await within(buscador).findByText("Ya están todas las ciudades del catálogo en la campaña.")).toBeInTheDocument();
    });

    it("elegir una ciudad agrega su pestaña, la deja seleccionada y cierra el buscador", async () => {
      const acc = montar();
      const buscador = await abrirBuscador();
      await userEvent.click(await within(buscador).findByRole("button", { name: "Agregar Salto, Salto" }));

      expect(acc.agregarCiudad).toHaveBeenCalledWith("cat-salto");
      expect(await screen.findByText("«Salto» se agregó a la campaña.")).toBeInTheDocument();
      const salto = within(screen.getByRole("navigation", { name: "Ciudades de la campaña" })).getByRole("button", { name: /Salto/ });
      expect(salto).toHaveAttribute("aria-current", "true");
      expect(salto).toHaveTextContent("sin zonas");
      expect(screen.getByRole("region", { name: "Zonas de Salto" })).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Agregar ciudad" })).not.toBeInTheDocument();
    });

    it("una ciudad recién agregada no se vuelve a ofrecer", async () => {
      montar();
      const buscador = await abrirBuscador();
      await userEvent.click(await within(buscador).findByRole("button", { name: "Agregar Salto, Salto" }));
      await screen.findByText("«Salto» se agregó a la campaña.");

      const otra = await abrirBuscador();
      await within(otra).findByRole("list", { name: "Ciudades del catálogo" });

      expect(within(otra).queryByRole("button", { name: /Agregar Salto/ })).not.toBeInTheDocument();
      expect(within(otra).getByRole("button", { name: "Agregar Paysandú, Paysandú" })).toBeInTheDocument();
    });

    it("un doble clic en una ciudad la agrega una sola vez", async () => {
      const acc = montar({
        agregarCiudad: vi.fn(async (id: string) => {
          await new Promise((r) => setTimeout(r, 30));
          return fuenteZonasSimulada.agregarCiudad("campania-verano-2026", id);
        }),
      });
      const buscador = await abrirBuscador();

      await userEvent.dblClick(await within(buscador).findByRole("button", { name: "Agregar Salto, Salto" }));

      expect(await screen.findByText("«Salto» se agregó a la campaña.")).toBeInTheDocument();
      expect(acc.agregarCiudad).toHaveBeenCalledTimes(1);
      expect(screen.getAllByRole("button", { name: /Salto/ })).toHaveLength(1);
    });

    it("si agregar falla, avisa, nada queda trabado y se puede reintentar", async () => {
      const agregar = vi
        .fn<AccionesZonas["agregarCiudad"]>()
        .mockRejectedValueOnce(new Error("sin red"))
        .mockResolvedValueOnce({ ok: false, mensaje: "Esa ciudad ya está en la campaña." })
        .mockImplementation((id) => fuenteZonasSimulada.agregarCiudad("campania-verano-2026", id));
      montar({ agregarCiudad: agregar });
      const buscador = await abrirBuscador();
      const salto = await within(buscador).findByRole("button", { name: "Agregar Salto, Salto" });

      await userEvent.click(salto);
      expect(await within(buscador).findByRole("alert")).toHaveTextContent("No se pudo conectar. Probá de nuevo en unos segundos.");
      expect(within(buscador).getByRole("button", { name: "Agregar Salto, Salto" })).toBeEnabled();
      expect(within(buscador).getByRole("searchbox")).toBeEnabled();
      expect(within(buscador).queryByText("Agregando la ciudad…")).not.toBeInTheDocument();

      await userEvent.click(within(buscador).getByRole("button", { name: "Agregar Salto, Salto" }));
      expect(await within(buscador).findByRole("alert")).toHaveTextContent("Esa ciudad ya está en la campaña.");

      await userEvent.click(within(buscador).getByRole("button", { name: "Agregar Salto, Salto" }));
      expect(await screen.findByText("«Salto» se agregó a la campaña.")).toBeInTheDocument();
    });

    it("si la búsqueda falla (sin conexión), avisa y «Reintentar» vuelve a buscar", async () => {
      const buscar = vi
        .fn<AccionesZonas["buscarCiudades"]>()
        .mockRejectedValueOnce(new Error("sin red"))
        .mockImplementation(buscarCiudades);
      montar({ buscarCiudades: buscar });
      const buscador = await abrirBuscador();

      expect(await within(buscador).findByRole("alert")).toHaveTextContent(
        "No se pudo buscar en el catálogo. Revisá la conexión y probá de nuevo.",
      );

      await userEvent.click(within(buscador).getByRole("button", { name: "Reintentar" }));

      expect(await within(buscador).findByRole("button", { name: "Agregar Salto, Salto" })).toBeInTheDocument();
      expect(within(buscador).queryByRole("alert")).not.toBeInTheDocument();
    });

    it("dos búsquedas seguidas: la respuesta vieja no pisa a la última", async () => {
      const pendientes: { texto: string; liberar: () => void }[] = [];
      montar({
        buscarCiudades: vi.fn(
          (texto: string) =>
            new Promise<Awaited<ReturnType<typeof buscarCiudades>>>((resolver) => {
              pendientes.push({ texto, liberar: () => resolver(buscarCiudades(texto)) });
            }),
        ),
      });
      const buscador = await abrirBuscador();
      await waitFor(() => expect(pendientes.length).toBe(1));
      await userEvent.type(within(buscador).getByRole("searchbox"), "salto");
      await waitFor(() => expect(pendientes.at(-1)?.texto).toBe("salto"));

      await act(async () => pendientes.at(-1)?.liberar());
      await within(buscador).findByRole("button", { name: "Agregar Salto, Salto" });
      await act(async () => pendientes[0].liberar());

      expect(within(buscador).getAllByRole("listitem")).toHaveLength(1);
    });

    it("«✕» y Escape lo cierran, y al volver a abrirlo empieza limpio", async () => {
      montar();
      const buscador = await abrirBuscador();
      await userEvent.type(within(buscador).getByRole("searchbox"), "sal");

      await userEvent.click(within(buscador).getByRole("button", { name: "Cerrar el buscador de ciudades" }));
      expect(screen.queryByRole("region", { name: "Agregar ciudad" })).not.toBeInTheDocument();

      const otro = await abrirBuscador();
      expect(within(otro).getByRole("searchbox")).toHaveValue("");
      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("region", { name: "Agregar ciudad" })).not.toBeInTheDocument();
    });

    it("con un catálogo de 200 ciudades y nombres larguísimos, las muestra todas sin romperse", async () => {
      const muchas = Array.from({ length: 200 }, (_, i) => ({
        id: `cat-${i}`,
        nombre: `Ciudad ${i} ${"de nombre larguísimo ".repeat(6)}`.trim(),
        provincia: `Provincia ${i}`,
      }));
      montar({ buscarCiudades: vi.fn(async () => muchas) });
      const buscador = await abrirBuscador();

      expect(await within(buscador).findAllByRole("listitem")).toHaveLength(200);
    });
  });

  describe("«Eliminar zona»", () => {
    async function editar(zona: string) {
      await userEvent.click(screen.getByRole("button", { name: `Ver la zona ${zona}` }));
      await userEvent.click(screen.getByRole("button", { name: "Editar forma" }));
    }

    it("está en «Editar zona», no en el detalle ni en «Nueva zona»", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Cerro Norte" }));
      expect(screen.queryByRole("button", { name: "Eliminar zona" })).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Editar forma" }));
      expect(screen.getByRole("button", { name: "Eliminar zona" })).toBeEnabled();

      await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
      await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
      expect(screen.queryByRole("button", { name: "Eliminar zona" })).not.toBeInTheDocument();
    });

    it("pide confirmación y dice cuántos colportores quedan sin zona; «No, conservarla» no toca nada", async () => {
      const acc = montar();
      await editar("Cerro Norte");

      await userEvent.click(screen.getByRole("button", { name: "Eliminar zona" }));

      const confirmacion = screen.getByRole("alertdialog", { name: "Eliminar zona" });
      expect(confirmacion).toHaveTextContent("¿Eliminar la zona «Cerro Norte»? 2 colportores quedan sin zona. Las ubicaciones no se tocan.");
      await userEvent.click(within(confirmacion).getByRole("button", { name: "No, conservarla" }));
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(acc.eliminarZona).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Eliminar zona" })).toBeEnabled();
    });

    it("con un solo colportor habla en singular y sin colportores dice que nadie la trabaja", async () => {
      montar();
      await editar("Paso de la Arena");
      await userEvent.click(screen.getByRole("button", { name: "Eliminar zona" }));
      expect(screen.getByRole("alertdialog")).toHaveTextContent("1 colportor queda sin zona.");

      await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
      await editar("Belvedere");
      await userEvent.click(screen.getByRole("button", { name: "Eliminar zona" }));
      expect(screen.getByRole("alertdialog")).toHaveTextContent("Nadie la trabaja. Las ubicaciones no se tocan.");
    });

    it("al confirmar la zona sale de la lista y de la ciudad, y sus colportores quedan en «Sin zona»", async () => {
      const acc = montar();
      await editar("Cerro Norte");
      await userEvent.click(screen.getByRole("button", { name: "Eliminar zona" }));

      await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar zona" }));

      expect(acc.eliminarZona).toHaveBeenCalledWith("zona-cerro-norte");
      expect(await screen.findByText("Zona «Cerro Norte» eliminada. 2 colportores quedan sin zona.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Ver la zona Cerro Norte" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Montevideo/ })).toHaveTextContent("3 zonas");
      const sinZona = screen.getByRole("region", { name: "Sin zona en Montevideo" });
      expect(within(sinZona).getByText("Diego Rocha")).toBeInTheDocument();
      expect(within(sinZona).getByText("Joel Cabrera")).toBeInTheDocument();
      expect(mapa.props?.zonas.map((z) => z.nombre)).not.toContain("Cerro Norte");
    });

    it("una zona sin colportores se elimina sin avisar de colportores sin zona", async () => {
      montar();
      await editar("Belvedere");
      await userEvent.click(screen.getByRole("button", { name: "Eliminar zona" }));
      await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar zona" }));

      expect(await screen.findByText("Zona «Belvedere» eliminada.")).toBeInTheDocument();
    });

    it("si falla, avisa, nada queda trabado y se puede reintentar", async () => {
      const eliminar = vi
        .fn<AccionesZonas["eliminarZona"]>()
        .mockRejectedValueOnce(new Error("sin red"))
        .mockResolvedValueOnce({ ok: false, mensaje: "La zona ya no existe." })
        .mockResolvedValueOnce({ ok: true, colportoresSinZona: 0 });
      montar({ eliminarZona: eliminar });
      await editar("Belvedere");
      await userEvent.click(screen.getByRole("button", { name: "Eliminar zona" }));

      await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar zona" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo conectar. Probá de nuevo en unos segundos.");
      expect(screen.getByRole("button", { name: "Sí, eliminar zona" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Cancelar" })).toBeEnabled();

      await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar zona" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("La zona ya no existe.");
      expect(screen.getByRole("button", { name: "Sí, eliminar zona" })).toBeEnabled();

      await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar zona" }));
      expect(await screen.findByText("Zona «Belvedere» eliminada.")).toBeInTheDocument();
    });

    it("un doble clic elimina una sola vez y mientras tanto no se puede cancelar ni cambiar de ciudad", async () => {
      let liberar: () => void = () => undefined;
      const acc = montar({
        eliminarZona: vi.fn(() => new Promise<{ ok: true; colportoresSinZona: number }>((r) => (liberar = () => r({ ok: true, colportoresSinZona: 0 })))),
      });
      await editar("Belvedere");
      await userEvent.click(screen.getByRole("button", { name: "Eliminar zona" }));

      await userEvent.dblClick(screen.getByRole("button", { name: "Sí, eliminar zona" }));

      expect(acc.eliminarZona).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: "Sí, eliminar zona" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "No, conservarla" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Guardar zona" })).toBeDisabled();
      expect(screen.getByRole("button", { name: /Las Piedras/ })).toBeDisabled();
      expect(screen.getByRole("button", { name: "+ Agregar ciudad" })).toBeDisabled();

      await act(async () => liberar());
      expect(await screen.findByText("Zona «Belvedere» eliminada.")).toBeInTheDocument();
    });

    it("volver a abrir «Editar zona» no arrastra la confirmación de antes", async () => {
      montar();
      await editar("Belvedere");
      await userEvent.click(screen.getByRole("button", { name: "Eliminar zona" }));
      await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

      await editar("Belvedere");

      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Eliminar zona" })).toBeEnabled();
    });
  });

  describe("«Quitar» y colportores suspendidos", () => {
    async function verZona(zona: string) {
      await userEvent.click(screen.getByRole("button", { name: `Ver la zona ${zona}` }));
      return screen.getByRole("region", { name: `Zona ${zona}` });
    }

    it("cada colportor de la zona tiene «Quitar»: lo deja sin zona y vuelve a «Sin zona»", async () => {
      const acc = montar();
      const detalle = await verZona("Cerro Norte");

      await userEvent.click(within(detalle).getByRole("button", { name: "Quitar a Diego Rocha de Cerro Norte" }));

      expect(acc.quitarZona).toHaveBeenCalledWith("col-1");
      expect(await screen.findByText("Diego Rocha quedó sin zona.")).toBeInTheDocument();
      expect(within(detalle).getByText("COLPORTORES · 1")).toBeInTheDocument();
      expect(within(detalle).queryByText("Diego Rocha")).not.toBeInTheDocument();
      await userEvent.click(within(detalle).getByRole("button", { name: "Cerrar el detalle de la zona" }));
      const sinZona = screen.getByRole("region", { name: "Sin zona en Montevideo" });
      expect(within(sinZona).getByText("Diego Rocha")).toBeInTheDocument();
    });

    it("al quitar al último colportor la zona pasa a «Nadie trabaja esta zona»", async () => {
      montar();
      const detalle = await verZona("Paso de la Arena");

      await userEvent.click(within(detalle).getByRole("button", { name: "Quitar a Laura Suárez de Paso de la Arena" }));

      expect(await within(detalle).findByText("◔ Nadie trabaja esta zona")).toBeInTheDocument();
    });

    it("si quitar falla o se rechaza, avisa, nada queda trabado y se puede reintentar", async () => {
      const quitar = vi
        .fn<AccionesZonas["quitarZona"]>()
        .mockRejectedValueOnce(new Error("sin red"))
        .mockResolvedValueOnce({ ok: false, mensaje: "La inscripción ya no existe." })
        .mockResolvedValueOnce({ ok: true });
      montar({ quitarZona: quitar });
      const detalle = await verZona("Paso de la Arena");
      const boton = () => within(detalle).getByRole("button", { name: "Quitar a Laura Suárez de Paso de la Arena" });

      await userEvent.click(boton());
      expect(await within(detalle).findByRole("alert")).toHaveTextContent("No se pudo conectar. Probá de nuevo en unos segundos.");
      expect(boton()).toBeEnabled();

      await userEvent.click(boton());
      expect(await within(detalle).findByRole("alert")).toHaveTextContent("La inscripción ya no existe.");
      expect(boton()).toBeEnabled();

      await userEvent.click(boton());
      expect(await screen.findByText("Laura Suárez quedó sin zona.")).toBeInTheDocument();
    });

    it("un doble clic en «Quitar» llama una sola vez", async () => {
      const acc = montar({ quitarZona: vi.fn(() => new Promise<{ ok: true }>((r) => setTimeout(() => r({ ok: true }), 30))) });
      const detalle = await verZona("Paso de la Arena");

      await userEvent.dblClick(within(detalle).getByRole("button", { name: "Quitar a Laura Suárez de Paso de la Arena" }));

      expect(await screen.findByText("Laura Suárez quedó sin zona.")).toBeInTheDocument();
      expect(acc.quitarZona).toHaveBeenCalledTimes(1);
    });

    it("con una asignación en curso, «Quitar» y una segunda asignación esperan: no se pisan", async () => {
      let liberar: () => void = () => undefined;
      const acc = montar({ asignarZona: vi.fn(() => new Promise<{ ok: true }>((r) => (liberar = () => r({ ok: true })))) });
      const detalle = await verZona("Cerro Norte");
      await userEvent.click(within(detalle).getByRole("button", { name: /ASIGNAR COLPORTOR/ }));
      await userEvent.click(screen.getByRole("option", { name: /Pablo Ferreira/ }));
      await userEvent.click(within(detalle).getByRole("button", { name: "Asignar a Cerro Norte" }));

      expect(within(detalle).getByRole("button", { name: "Quitar a Diego Rocha de Cerro Norte" })).toBeDisabled();
      expect(within(detalle).getByRole("button", { name: "Asignar a Cerro Norte" })).toBeDisabled();
      await userEvent.click(within(detalle).getByRole("button", { name: "Quitar a Diego Rocha de Cerro Norte" }));
      expect(acc.quitarZona).not.toHaveBeenCalled();

      await act(async () => liberar());
      expect(await screen.findByText("Pablo Ferreira quedó en Cerro Norte.")).toBeInTheDocument();
      expect(within(detalle).getByRole("button", { name: "Quitar a Diego Rocha de Cerro Norte" })).toBeEnabled();
    });

    it("un suspendido no se puede elegir en el desplegable y dice por qué", async () => {
      const acc = montar();
      const detalle = await verZona("Belvedere");
      await userEvent.click(within(detalle).getByRole("button", { name: /ASIGNAR COLPORTOR/ }));

      const opcion = screen.getByRole("option", { name: /Sergio Píriz/ });
      expect(opcion).toHaveAttribute("aria-disabled", "true");
      expect(opcion).toHaveTextContent("Cuenta suspendida. Pedile a un administrador que la reactive.");
      await userEvent.click(opcion);
      expect(within(detalle).getByRole("button", { name: "Asignar a Belvedere" })).toBeDisabled();
      expect(acc.asignarZona).not.toHaveBeenCalled();
    });

    it("un suspendido que ya tenía zona aparece marcado en ella, la conserva y se le puede quitar", async () => {
      const ciudad: CiudadDeCampania = {
        ...MONTEVIDEO,
        zonas: MONTEVIDEO.zonas.map((z) =>
          z.id === "zona-la-teja" ? { ...z, colportores: z.colportores.map((c) => (c.id === "col-6" ? { ...c, suspendido: true } : c)) } : z,
        ),
        colportores: MONTEVIDEO.colportores.map((c) => (c.id === "col-6" ? { ...c, suspendido: true } : c)),
      };
      const acc = montar({}, { ...DATOS_ZONAS_SIMULADO, ciudades: [ciudad] });
      const detalle = await verZona("La Teja");

      expect(within(detalle).getByText("⊘ Suspendida")).toBeInTheDocument();
      await userEvent.click(within(detalle).getByRole("button", { name: /ASIGNAR COLPORTOR/ }));
      expect(screen.getByRole("option", { name: /Noelia Acosta/ })).toHaveAttribute("aria-disabled", "true");

      await userEvent.click(within(detalle).getByRole("button", { name: "Quitar a Noelia Acosta de La Teja" }));
      expect(acc.quitarZona).toHaveBeenCalledWith("col-6");
    });

    it("si el BFF rechaza la asignación por cuenta suspendida, muestra ese mensaje y deja intentar de nuevo", async () => {
      montar({
        asignarZona: vi.fn(async () => ({ ok: false as const, mensaje: "Cuenta suspendida. Pedile a un administrador que la reactive." })),
      });
      const detalle = await verZona("Belvedere");
      await userEvent.click(within(detalle).getByRole("button", { name: /ASIGNAR COLPORTOR/ }));
      await userEvent.click(screen.getByRole("option", { name: /Pablo Ferreira/ }));
      await userEvent.click(within(detalle).getByRole("button", { name: "Asignar a Belvedere" }));

      expect(await within(detalle).findByRole("alert")).toHaveTextContent("Cuenta suspendida. Pedile a un administrador que la reactive.");
      expect(within(detalle).getByRole("button", { name: "Asignar a Belvedere" })).toBeEnabled();
    });
  });

  describe("«Incluye N ubicaciones» y superposición", () => {
    it("una zona nueva dice cuántas ubicaciones incluye; sin ubicaciones, que no incluye ninguna todavía", async () => {
      const vacia = vi.fn(async (e: Parameters<AccionesZonas["vistaPreviaZona"]>[0]) => ({
        ...(await fuenteZonasSimulada.vistaPreviaZona(e)),
        ubicacionesIncluidas: 0,
      }));
      montar({ vistaPreviaZona: vacia });
      await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
      await clicEnMapa(CENTRO_LIBRE);

      expect(await screen.findByText("No incluye ubicaciones todavía.")).toBeInTheDocument();
    });

    it("con una sola ubicación habla en singular", async () => {
      montar({
        vistaPreviaZona: vi.fn(async (e: Parameters<AccionesZonas["vistaPreviaZona"]>[0]) => ({
          ...(await fuenteZonasSimulada.vistaPreviaZona(e)),
          ubicacionesIncluidas: 1,
        })),
      });
      await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
      await clicEnMapa(CENTRO_LIBRE);

      expect(await screen.findByText("Incluye 1 ubicación.")).toBeInTheDocument();
    });

    it("ya no avisa cuántas ubicaciones cambian de zona", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Paso de la Arena" }));
      await userEvent.click(screen.getByRole("button", { name: "Editar forma" }));
      await act(async () => mapa.props?.onRadio(300));
      await screen.findByText(/^Incluye \d+ ubicaciones\.$/);

      expect(screen.queryByText(/cambian de zona/)).not.toBeInTheDocument();
    });
  });

  describe("revisión #35: casos límite de la UI", () => {
    it("(a) mientras se agrega una ciudad no se puede empezar una zona, editar una forma ni cambiar de ciudad", async () => {
      let liberar: () => void = () => undefined;
      montar({
        agregarCiudad: vi.fn(
          (id: string) =>
            new Promise<Awaited<ReturnType<typeof fuenteZonasSimulada.agregarCiudad>>>((r) => {
              liberar = () => r(fuenteZonasSimulada.agregarCiudad("campania-verano-2026", id));
            }),
        ),
      });
      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Belvedere" }));
      await userEvent.click(screen.getByRole("button", { name: "+ Agregar ciudad" }));
      await userEvent.click(await screen.findByRole("button", { name: "Agregar Salto, Salto" }));

      expect(screen.getByRole("button", { name: "Editar forma" })).toBeDisabled();
      expect(screen.getByRole("button", { name: /Las Piedras/ })).toBeDisabled();
      await userEvent.click(screen.getByRole("button", { name: "Cerrar el detalle de la zona" }));
      expect(screen.getByRole("region", { name: "Zona Belvedere" })).toBeInTheDocument();
      act(() => mapa.props?.onZonaClick("zona-la-teja"));
      expect(screen.getByRole("region", { name: "Zona Belvedere" })).toBeInTheDocument();

      await act(async () => liberar());
      expect(await screen.findByText("«Salto» se agregó a la campaña.")).toBeInTheDocument();
      expect(screen.getByRole("region", { name: "Zonas de Salto" })).toBeInTheDocument();
    });

    it("(a) con la lista abierta, «+ Nueva zona» espera a que termine de agregar la ciudad", async () => {
      let liberar: () => void = () => undefined;
      montar({
        agregarCiudad: vi.fn(
          (id: string) =>
            new Promise<Awaited<ReturnType<typeof fuenteZonasSimulada.agregarCiudad>>>((r) => {
              liberar = () => r(fuenteZonasSimulada.agregarCiudad("campania-verano-2026", id));
            }),
        ),
      });
      await userEvent.click(screen.getByRole("button", { name: "+ Agregar ciudad" }));
      await userEvent.click(await screen.findByRole("button", { name: "Agregar Salto, Salto" }));

      expect(screen.getByRole("button", { name: "+ Nueva zona" })).toBeDisabled();

      await act(async () => liberar());
      await screen.findByText("«Salto» se agregó a la campaña.");
      expect(screen.getByRole("button", { name: "+ Nueva zona" })).toBeEnabled();
    });

    it("(a) con un dibujo a medias no se puede agregar una ciudad, y empezar uno cierra el buscador abierto", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "+ Agregar ciudad" }));
      expect(screen.getByRole("region", { name: "Agregar ciudad" })).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));

      expect(screen.queryByRole("region", { name: "Agregar ciudad" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "+ Agregar ciudad" })).toBeDisabled();

      await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
      expect(screen.getByRole("button", { name: "+ Agregar ciudad" })).toBeEnabled();
    });

    it("(b) con una asignación en curso no se puede cambiar de zona, y su error aparece en la zona que la pidió", async () => {
      let rechazar: (e: Error) => void = () => undefined;
      montar({ asignarZona: vi.fn(() => new Promise<{ ok: true }>((_r, rej) => (rechazar = rej))) });
      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Belvedere" }));
      await userEvent.click(screen.getByRole("button", { name: /ASIGNAR COLPORTOR/ }));
      await userEvent.click(screen.getByRole("option", { name: /Pablo Ferreira/ }));
      await userEvent.click(screen.getByRole("button", { name: "Asignar a Belvedere" }));

      expect(screen.getByRole("button", { name: "Cerrar el detalle de la zona" })).toBeDisabled();
      act(() => mapa.props?.onZonaClick("zona-la-teja"));
      expect(screen.getByRole("region", { name: "Zona Belvedere" })).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Zona La Teja" })).not.toBeInTheDocument();

      await act(async () => rechazar(new Error("sin red")));
      expect(await within(screen.getByRole("region", { name: "Zona Belvedere" })).findByRole("alert")).toHaveTextContent(
        "No se pudo conectar. Probá de nuevo en unos segundos.",
      );
      act(() => mapa.props?.onZonaClick("zona-la-teja"));
      expect(within(screen.getByRole("region", { name: "Zona La Teja" })).queryByRole("alert")).not.toBeInTheDocument();
    });

    it("(c) el radio se puede vaciar con Backspace y teclear otro valor; vacío no deja guardar", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
      await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "Casabó");
      await clicEnMapa(CENTRO_LIBRE);
      await screen.findByText(/^Incluye \d+ ubicaciones\.$/);
      const radio = screen.getByRole("spinbutton", { name: /RADIO/ });
      expect(radio).toHaveValue(400);

      await userEvent.clear(radio);
      expect(radio).toHaveValue(null);
      expect(screen.getByRole("button", { name: "Guardar zona" })).toBeDisabled();

      await userEvent.type(radio, "500");
      expect(radio).toHaveValue(500);
      await waitFor(() => expect(mapa.props?.dibujo?.radioM).toBe(500));
      await screen.findByText(/^Incluye \d+ ubicaciones\.$/);
      expect(screen.getByRole("button", { name: "Guardar zona" })).toBeEnabled();
    });

    it("(c) al salir del campo vacío el radio vuelve al último valor válido", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
      await clicEnMapa(CENTRO_LIBRE);
      const radio = screen.getByRole("spinbutton", { name: /RADIO/ });
      await userEvent.clear(radio);

      await userEvent.tab();

      expect(radio).toHaveValue(400);
    });

    it("(c) 0 tampoco se toma como radio y sigue pudiéndose corregir", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
      await clicEnMapa(CENTRO_LIBRE);
      const radio = screen.getByRole("spinbutton", { name: /RADIO/ });

      await userEvent.clear(radio);
      await userEvent.type(radio, "0");
      expect(radio).toHaveValue(0);
      await userEvent.clear(radio);
      await userEvent.type(radio, "250");

      expect(radio).toHaveValue(250);
    });

    it("(d) escribir rápido en el buscador consulta una sola vez, cuando se deja de teclear", async () => {
      const acc = montar();
      await userEvent.click(screen.getByRole("button", { name: "+ Agregar ciudad" }));
      await waitFor(() => expect(acc.buscarCiudades).toHaveBeenCalledTimes(1));

      await userEvent.type(screen.getByRole("searchbox"), "salto");

      await waitFor(() => expect(acc.buscarCiudades).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByRole("button", { name: /Agregar Mercedes/ })).not.toBeInTheDocument());
      expect(screen.getByRole("button", { name: "Agregar Salto, Salto" })).toBeInTheDocument();
      expect(acc.buscarCiudades).toHaveBeenLastCalledWith("salto");
    });

    it("(e) con la confirmación de baja abierta no se puede guardar; al conservarla vuelve a poderse", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Paso de la Arena" }));
      await userEvent.click(screen.getByRole("button", { name: "Editar forma" }));
      await act(async () => mapa.props?.onRadio(300));
      await screen.findByText(/^Incluye \d+ ubicaciones\.$/);
      expect(screen.getByRole("button", { name: "Guardar zona" })).toBeEnabled();

      await userEvent.click(screen.getByRole("button", { name: "Eliminar zona" }));
      expect(screen.getByRole("button", { name: "Guardar zona" })).toBeDisabled();

      await userEvent.click(screen.getByRole("button", { name: "No, conservarla" }));
      expect(screen.getByRole("button", { name: "Guardar zona" })).toBeEnabled();
    });
  });
});
