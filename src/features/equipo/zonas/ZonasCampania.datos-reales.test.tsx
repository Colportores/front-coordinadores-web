import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  CiudadDeCampania,
  DatosZonas,
  GuardarZonaEntrada,
  PoligonoGeojson,
  Punto,
  ResultadoGuardarZona,
  VistaPreviaZona,
  ZonaDeCiudad,
} from "@/datos/equipo/zonas";
import { colorParaZonaNueva, PALETA_ZONAS } from "@/datos/equipo/zonas/paleta";
import { type AccionesZonas, ZonasCampania } from "@/features/equipo/zonas/ZonasCampania";
import type { PropsMapaZonas } from "@/features/equipo/zonas/tipos";

/**
 * La vista con lo que devuelve la fuente de las RPC (no la simulada): cada ciudad lista a todos los inscriptos con su
 * zona de la campaña, `guardar_zona` devuelve la zona sin colportores, una esquina puede venir sin calles, el catálogo
 * no trae la provincia y la base puede rechazar la vista previa.
 */

const mapa = vi.hoisted(() => ({ props: null as PropsMapaZonas | null }));
vi.mock("@/features/equipo/zonas/MapaZonas", () => ({
  MapaZonas: (props: PropsMapaZonas) => {
    mapa.props = props;
    return <div data-testid="mapa" />;
  },
}));

const CIRCULO: PoligonoGeojson = {
  type: "Polygon",
  coordinates: [
    [
      [-56.26, -34.87],
      [-56.25, -34.87],
      [-56.25, -34.86],
      [-56.26, -34.87],
    ],
  ],
};
const CENTRO: Punto = { lon: -56.24, lat: -34.85 };

const radial = (id: string, nombre: string, color: string, colportores: ZonaDeCiudad["colportores"] = []): ZonaDeCiudad => ({
  id,
  nombre,
  tipoForma: "RADIAL",
  color,
  centro: CENTRO,
  radioM: 600,
  poligonoGeojson: CIRCULO,
  colportores,
  ubicacionesRegistradas: 10,
});

/** Los tres inscriptos, que las dos ciudades listan: Diego en «Paso de la Arena» (Montevideo), Ana y Sergio sin zona. */
const inscriptos = (diegoEn: { id: string; nombre: string } | null = { id: "z-arena", nombre: "Paso de la Arena" }) => [
  { id: "col-diego", nombre: "Diego Rocha", zonaId: diegoEn?.id ?? null, zonaNombre: diegoEn?.nombre ?? null },
  { id: "col-ana", nombre: "Ana Martínez", zonaId: null, zonaNombre: null },
  { id: "col-sergio", nombre: "Sergio Píriz", zonaId: null, zonaNombre: null, suspendido: true },
];

const MONTEVIDEO: CiudadDeCampania = {
  id: "ciudad-mvd",
  catalogoId: "cat-mvd",
  nombre: "Montevideo",
  centro: { lon: -56.26, lat: -34.87 },
  zoom: 13,
  zonas: [
    radial("z-arena", "Paso de la Arena", PALETA_ZONAS[1], [{ id: "col-diego", nombre: "Diego Rocha" }]),
    radial("z-belvedere", "Belvedere", PALETA_ZONAS[2]),
  ],
  colportores: inscriptos(),
};

const LAS_PIEDRAS: CiudadDeCampania = {
  id: "ciudad-piedras",
  catalogoId: "cat-piedras",
  nombre: "Las Piedras",
  centro: { lon: -56.22, lat: -34.73 },
  zoom: 14,
  zonas: [radial("z-centro", "Centro", PALETA_ZONAS[0])],
  colportores: inscriptos(),
};

const DATOS: DatosZonas = { campaniaId: "campania-1", campania: "Verano 2026", ciudades: [MONTEVIDEO, LAS_PIEDRAS] };

const PREVIA: VistaPreviaZona = { poligonoGeojson: CIRCULO, ubicacionesIncluidas: 12, superposicion: null, comparteCalle: null };

function guardada(entrada: GuardarZonaEntrada, id = "z-nueva"): ResultadoGuardarZona {
  return {
    ok: true,
    zona: { ...radial(entrada.zonaId ?? id, entrada.nombre, entrada.color ?? "#8A94A6"), radioM: entrada.forma.radioM, centro: entrada.forma.centro },
  };
}

function acciones(sobre: Partial<AccionesZonas> = {}): AccionesZonas {
  return {
    esquinaMasCercana: vi.fn(async (_c: string, p: Punto) => ({ ...p, calleA: "", calleB: "" })),
    tramoPorCalles: vi.fn(async (_c: string, a: Punto, b: Punto) => [a, b]),
    vistaPreviaZona: vi.fn(async () => PREVIA),
    guardarZona: vi.fn(async (e: GuardarZonaEntrada) => guardada(e)),
    asignarZona: vi.fn(async () => ({ ok: true as const })),
    quitarZona: vi.fn(async () => ({ ok: true as const })),
    eliminarZona: vi.fn(async () => ({ ok: true as const, colportoresSinZona: 1 })),
    buscarCiudades: vi.fn(async () => [
      { id: "cat-salto", nombre: "Salto" },
      { id: "cat-mercedes", nombre: "Mercedes", provincia: "Soriano" },
    ]),
    agregarCiudad: vi.fn(async () => ({ ok: false as const, mensaje: "no" })),
    ...sobre,
  };
}

function montar(sobre: Partial<AccionesZonas> = {}) {
  const acc = acciones(sobre);
  render(<ZonasCampania datos={DATOS} acciones={acc} />);
  return acc;
}

async function clicEnMapa(punto: Punto) {
  await act(async () => {
    mapa.props?.onMapaClick(punto);
  });
}

const sinZona = (ciudad: string) => screen.getByRole("region", { name: `Sin zona en ${ciudad}` });

afterEach(() => {
  mapa.props = null;
});

describe("ZonasCampania con lo que devuelve la fuente de las RPC", () => {
  describe("02 · nueva zona radial", () => {
    it("si la base rechaza la vista previa, muestra su texto y no deja guardar a ciegas", async () => {
      const rechazo = "La campaña ya terminó y su mapa queda como estaba. Dibujá las zonas en una campaña activa o futura.";
      const acc = montar({ vistaPreviaZona: vi.fn(async () => ({ rechazo })) });
      await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
      await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "Casabó");

      await clicEnMapa(CENTRO);

      expect(await screen.findByRole("alert")).toHaveTextContent(rechazo);
      expect(screen.getByRole("button", { name: "Guardar zona" })).toBeDisabled();
      expect(screen.queryByText(/Incluye/)).not.toBeInTheDocument();
      expect(mapa.props?.dibujo?.poligono ?? null).toBeNull();
      expect(acc.guardarZona).not.toHaveBeenCalled();
    });

    it("tras un rechazo, mover el borde vuelve a pedir la vista previa y el aviso desaparece si ahora sale bien", async () => {
      const vistaPreviaZona = vi
        .fn()
        .mockResolvedValueOnce({ rechazo: "La ciudad no está en esta campaña." })
        .mockResolvedValue(PREVIA);
      montar({ vistaPreviaZona });
      await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
      await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "Casabó");
      await clicEnMapa(CENTRO);
      await screen.findByRole("alert");

      await act(async () => mapa.props?.onRadio(500));

      expect(await screen.findByText("Incluye 12 ubicaciones.")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Guardar zona" })).toBeEnabled();
    });

    it("la zona nueva se guarda con el color que le toca de la paleta, según cuántas zonas tiene la ciudad", async () => {
      const acc = montar();
      await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
      await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "Casabó");
      await clicEnMapa(CENTRO);
      await screen.findByText(/Incluye/);

      await userEvent.click(screen.getByRole("button", { name: "Guardar zona" }));

      await screen.findByRole("region", { name: "Zona Casabó" });
      expect(acc.guardarZona).toHaveBeenCalledWith(
        expect.objectContaining({ ciudadId: "ciudad-mvd", nombre: "Casabó", color: colorParaZonaNueva(2) }),
      );
      expect(mapa.props?.zonas.find((z) => z.nombre === "Casabó")?.color).toBe(colorParaZonaNueva(2));
    });
  });

  describe("editar una zona", () => {
    async function editar(zona: string) {
      await userEvent.click(screen.getByRole("button", { name: `Ver la zona ${zona}` }));
      await userEvent.click(screen.getByRole("button", { name: "Editar forma" }));
    }

    it("guardar la nueva forma manda el color que la zona ya tenía (guardar sin color se lo borraría)", async () => {
      const acc = montar();
      await editar("Paso de la Arena");
      await act(async () => mapa.props?.onRadio(300));
      await screen.findByText(/Incluye/);

      await userEvent.click(screen.getByRole("button", { name: "Guardar zona" }));

      await screen.findByRole("region", { name: "Zona Paso de la Arena" });
      expect(acc.guardarZona).toHaveBeenCalledWith(
        expect.objectContaining({ zonaId: "z-arena", nombre: "Paso de la Arena", color: PALETA_ZONAS[1] }),
      );
    });

    it("la fuente devuelve la zona sin colportores y la vista conserva a los que ya la trabajaban", async () => {
      montar();
      await editar("Paso de la Arena");
      await act(async () => mapa.props?.onRadio(300));
      await screen.findByText(/Incluye/);

      await userEvent.click(screen.getByRole("button", { name: "Guardar zona" }));

      const detalle = await screen.findByRole("region", { name: "Zona Paso de la Arena" });
      expect(within(detalle).getByText("COLPORTORES · 1")).toBeInTheDocument();
      expect(within(detalle).getByText("Diego Rocha")).toBeInTheDocument();
      await userEvent.click(within(detalle).getByRole("button", { name: "Cerrar el detalle de la zona" }));
      expect(screen.getByRole("button", { name: "Ver la zona Paso de la Arena" })).toHaveTextContent("Diego Rocha");
    });

    it("renombrar una zona cambia el nombre que muestra la lista de colportores de todas las ciudades", async () => {
      montar();
      await editar("Paso de la Arena");
      const nombre = screen.getByRole("textbox", { name: "NOMBRE" });
      await userEvent.clear(nombre);
      await userEvent.type(nombre, "La Arena");
      await act(async () => mapa.props?.onRadio(300));
      await screen.findByText(/Incluye/);
      await userEvent.click(screen.getByRole("button", { name: "Guardar zona" }));
      await screen.findByRole("region", { name: "Zona La Arena" });
      await userEvent.click(screen.getByRole("button", { name: "Cerrar el detalle de la zona" }));

      await userEvent.click(screen.getByRole("button", { name: /Las Piedras/ }));
      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Centro" }));
      await userEvent.click(screen.getByRole("button", { name: /ASIGNAR COLPORTOR/ }));

      expect(screen.getByRole("option", { name: /Diego Rocha/ })).toHaveTextContent("La Arena");
    });
  });

  describe("la zona de un colportor es una por campaña, de la ciudad que sea", () => {
    it("cada ciudad lista a los inscriptos sin zona en «Sin zona», y el suspendido queda marcado", () => {
      montar();

      expect(within(sinZona("Montevideo")).getByText("Ana Martínez")).toBeInTheDocument();
      expect(within(sinZona("Montevideo")).getByText("Sergio Píriz")).toBeInTheDocument();
      expect(within(sinZona("Montevideo")).queryByText("Diego Rocha")).not.toBeInTheDocument();
    });

    it("asignar en una ciudad deja al colportor sin zona en la otra y con la nueva zona en la lista de las dos", async () => {
      const acc = montar();
      // Ana, sin zona, pasa a «Belvedere» de Montevideo.
      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Belvedere" }));
      await userEvent.click(screen.getByRole("button", { name: /ASIGNAR COLPORTOR/ }));
      await userEvent.click(screen.getByRole("option", { name: /Ana Martínez/ }));
      await userEvent.click(screen.getByRole("button", { name: "Asignar a Belvedere" }));
      await screen.findByText("Ana Martínez quedó en Belvedere.");
      await userEvent.click(screen.getByRole("button", { name: "Cerrar el detalle de la zona" }));

      expect(acc.asignarZona).toHaveBeenCalledWith("col-ana", "z-belvedere");
      await userEvent.click(screen.getByRole("button", { name: /Las Piedras/ }));
      // En Las Piedras ya no figura «sin zona»: tiene la de Montevideo.
      expect(within(sinZona("Las Piedras")).queryByText("Ana Martínez")).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Centro" }));
      await userEvent.click(screen.getByRole("button", { name: /ASIGNAR COLPORTOR/ }));
      expect(screen.getByRole("option", { name: /Ana Martínez/ })).toHaveTextContent("Belvedere");
    });

    it("asignar en otra ciudad a quien ya tenía zona lo saca de la zona anterior, aunque sea de la primera ciudad", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: /Las Piedras/ }));
      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Centro" }));
      await userEvent.click(screen.getByRole("button", { name: /ASIGNAR COLPORTOR/ }));
      await userEvent.click(screen.getByRole("option", { name: /Diego Rocha/ }));
      await userEvent.click(screen.getByRole("button", { name: "Asignar a Centro" }));
      await screen.findByText("Diego Rocha quedó en Centro.");

      await userEvent.click(screen.getByRole("button", { name: "Cerrar el detalle de la zona" }));
      await userEvent.click(screen.getByRole("button", { name: /Montevideo/ }));

      expect(screen.getByRole("button", { name: "Ver la zona Paso de la Arena" })).not.toHaveTextContent("Diego Rocha");
    });

    it("«Quitar» deja al colportor sin zona en la lista de todas las ciudades", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Paso de la Arena" }));
      await userEvent.click(screen.getByRole("button", { name: "Quitar a Diego Rocha de Paso de la Arena" }));
      await screen.findByText("Diego Rocha quedó sin zona.");

      await userEvent.click(screen.getByRole("button", { name: "Cerrar el detalle de la zona" }));
      expect(within(sinZona("Montevideo")).getByText("Diego Rocha")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: /Las Piedras/ }));
      expect(within(sinZona("Las Piedras")).getByText("Diego Rocha")).toBeInTheDocument();
    });

    it("eliminar una zona deja a sus colportores sin zona en la lista de todas las ciudades", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Paso de la Arena" }));
      await userEvent.click(screen.getByRole("button", { name: "Editar forma" }));
      await userEvent.click(screen.getByRole("button", { name: "Eliminar zona" }));
      await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar zona" }));
      await screen.findByText("Zona «Paso de la Arena» eliminada. 1 colportor queda sin zona.");

      expect(within(sinZona("Montevideo")).getByText("Diego Rocha")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: /Las Piedras/ }));
      expect(within(sinZona("Las Piedras")).getByText("Diego Rocha")).toBeInTheDocument();
    });
  });

  describe("03 · nueva zona por esquinas, con esquinas sin calles conocidas", () => {
    it("una esquina sin calles se nombra «Esquina sin nombre de calles» en vez de « y »", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
      await userEvent.click(screen.getByRole("radio", { name: /Por esquinas/ }));

      await clicEnMapa({ lon: -56.26, lat: -34.87 });

      await waitFor(() => expect(screen.getByText("ESQUINAS · 1")).toBeInTheDocument());
      const esquinas = screen.getByRole("list", { name: "ESQUINAS · 1" });
      expect(within(esquinas).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["1Esquina sin nombre de calles"]);
    });

    it("con una sola calle conocida la nombra sola, sin « y » colgando", async () => {
      montar({ esquinaMasCercana: vi.fn(async (_c: string, p: Punto) => ({ ...p, calleA: "Pororó", calleB: "" })) });
      await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
      await userEvent.click(screen.getByRole("radio", { name: /Por esquinas/ }));

      await clicEnMapa({ lon: -56.26, lat: -34.87 });

      const esquinas = await screen.findByRole("list", { name: "ESQUINAS · 1" });
      expect(within(esquinas).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["1Pororó"]);
    });

    it("si la fuente todavía no calcula el borde por calles, avisa y no marca la esquina", async () => {
      montar({
        esquinaMasCercana: vi.fn().mockRejectedValue(new Error("Falta backend-supabase#25")),
      });
      await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
      await userEvent.click(screen.getByRole("radio", { name: /Por esquinas/ }));

      await clicEnMapa({ lon: -56.26, lat: -34.87 });

      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("ESQUINAS · 0")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Guardar zona" })).toBeDisabled();
    });
  });

  describe("«+ Agregar ciudad»: el catálogo de la base no trae provincia", () => {
    it("una ciudad sin provincia se ofrece solo con su nombre; la que la trae, con ella", async () => {
      montar();
      await userEvent.click(screen.getByRole("button", { name: "+ Agregar ciudad" }));
      const buscador = screen.getByRole("region", { name: "Agregar ciudad" });

      const salto = await within(buscador).findByRole("button", { name: "Agregar Salto" });
      expect(salto).toHaveTextContent(/^Salto$/);
      expect(within(buscador).getByRole("button", { name: "Agregar Mercedes, Soriano" })).toHaveTextContent("Soriano");
      expect(within(buscador).queryByText("undefined")).not.toBeInTheDocument();
    });
  });
});
