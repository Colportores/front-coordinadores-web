import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TEXTO_ACCION_NO_DISPONIBLE } from "@/components/AccionNoDisponible";
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
    it("muestra las ciudades con su cantidad de zonas y «+ Agregar ciudad» sin formulario", () => {
      montar();

      expect(screen.getByRole("heading", { name: "Zonas · Verano 2026" })).toBeInTheDocument();
      const ciudades = screen.getByRole("navigation", { name: "Ciudades de la campaña" });
      expect(within(ciudades).getByRole("button", { name: /Montevideo/ })).toHaveTextContent("4 zonas");
      expect(within(ciudades).getByRole("button", { name: /Las Piedras/ })).toHaveTextContent("2 zonas");
      expect(within(ciudades).getByRole("button", { name: /Canelones/ })).toHaveTextContent("sin zonas");
      const agregar = screen.getByRole("button", { name: "+ Agregar ciudad" });
      expect(agregar).toHaveAttribute("aria-disabled", "true");
      expect(agregar).toHaveAttribute("title", TEXTO_ACCION_NO_DISPONIBLE);
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
      expect(within(sinZona).getByText("Sin zona en Montevideo")).toBeInTheDocument();
      expect(within(sinZona).getByRole("button", { name: "Asignar zona a Pablo Ferreira" })).toHaveTextContent("Asignar");
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

      expect(await screen.findByText(/Incluye \d+ ubicaciones ya registradas\./)).toBeInTheDocument();
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
      expect(radio).not.toHaveValue(0);
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

      expect(await screen.findByText(/Incluye \d+ ubicaciones ya registradas\./)).toBeInTheDocument();
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

    it("si se superpone no deja guardar, avisa con quién y marca en rojo el tramo en conflicto", async () => {
      montar();
      await empezarPorEsquinas();
      await marcar([1, 3], [3, 3], [3, 4], [1, 4]);
      await clicEnMapa(nodo(1, 3));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Esta zona se superpone con «Belvedere». Ajustá el borde para que solo compartan la calle.",
      );
      expect(mapa.props?.dibujo?.conflicto?.length).toBeGreaterThan(1);
      expect(screen.getByRole("button", { name: "Guardar zona" })).toBeDisabled();
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
      await userEvent.click(screen.getByRole("option", { name: /Pablo Ferreira/ }).querySelector("button") as HTMLElement);

      await userEvent.click(screen.getByRole("button", { name: "Asignar a Belvedere" }));

      expect(acc.asignarZona).toHaveBeenCalledWith("col-5", "zona-belvedere");
      expect(await screen.findByText("Pablo Ferreira quedó en Belvedere.")).toBeInTheDocument();
      const detalle = screen.getByRole("region", { name: "Zona Belvedere" });
      expect(within(detalle).getByText("COLPORTORES · 1")).toBeInTheDocument();
      await userEvent.click(within(detalle).getByRole("button", { name: "Cerrar el detalle de la zona" }));
      expect(screen.queryByRole("region", { name: "Sin zona en Montevideo" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Ver la zona Belvedere" })).toHaveTextContent("Pablo Ferreira");
    });

    it("asignar a alguien que tiene otra zona lo saca de la anterior", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Belvedere" }));
      await userEvent.click(screen.getByRole("button", { name: /ASIGNAR COLPORTOR/ }));
      await userEvent.click(screen.getByRole("option", { name: /Diego Rocha/ }).querySelector("button") as HTMLElement);
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
      await userEvent.click(screen.getByRole("option", { name: /Diego Rocha/ }).querySelector("button") as HTMLElement);

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

    it("«Editar forma» abre la forma de la zona y avisa cuántas ubicaciones cambian de zona antes de guardar", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Paso de la Arena" }));
      await userEvent.click(screen.getByRole("button", { name: "Editar forma" }));
      expect(screen.getByRole("region", { name: "Editar zona" })).toBeInTheDocument();
      expect(screen.getByRole("spinbutton", { name: /RADIO/ })).toHaveValue(600);

      await act(async () => mapa.props?.onRadio(300));

      expect(await screen.findByText(/Al guardar, \d+ ubicaciones cambian de zona\./)).toBeInTheDocument();
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
      await userEvent.click(screen.getByRole("option", { name: /Pablo Ferreira/ }).querySelector("button") as HTMLElement);

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
      await userEvent.click(screen.getByRole("option", { name: /Pablo Ferreira/ }).querySelector("button") as HTMLElement);
      await userEvent.click(screen.getByRole("button", { name: "Asignar a Belvedere" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("La zona ya no existe.");
      expect(screen.getByRole("button", { name: "Asignar a Belvedere" })).toBeEnabled();
    });

    it("un doble clic en «Asignar a <zona>» asigna una sola vez", async () => {
      const acc = montar({ asignarZona: vi.fn(() => new Promise<{ ok: true }>((r) => setTimeout(() => r({ ok: true }), 30))) });
      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Belvedere" }));
      await userEvent.click(screen.getByRole("button", { name: /ASIGNAR COLPORTOR/ }));
      await userEvent.click(screen.getByRole("option", { name: /Pablo Ferreira/ }).querySelector("button") as HTMLElement);

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
      await userEvent.click(screen.getByRole("option", { name: /Pablo Ferreira/ }).querySelector("button") as HTMLElement);
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
});
