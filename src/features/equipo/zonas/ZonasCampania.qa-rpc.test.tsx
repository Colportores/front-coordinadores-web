import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CiudadDeCampania, DatosZonas, Punto, VistaPreviaZona, ZonaDeCiudad } from "@/datos/equipo/zonas";
import { crearFuenteZonasRpc } from "@/datos/equipo/zonas/rpc";
import type { ClienteRpc } from "@/datos/supabase/cliente";
import { type AccionesZonas, ZonasCampania } from "@/features/equipo/zonas/ZonasCampania";
import { PanelFormularioZona } from "@/features/equipo/zonas/PanelFormularioZona";
import type { PropsMapaZonas } from "@/features/equipo/zonas/tipos";

/**
 * QA de la vista 24 (HU-CAM-006) conectada a las RPC: la vista de verdad, con la fuente de verdad (`crearFuenteZonasRpc`)
 * y un cliente que contesta como la base (`guardar_zona` migración 0024, `zonas_de_ciudad`, etc.). Lo que documenta un
 * hallazgo va con `skip` y el motivo; se saca cuando el implementador lo arregla.
 */

const mapa = vi.hoisted(() => ({ props: null as PropsMapaZonas | null }));
vi.mock("@/features/equipo/zonas/MapaZonas", () => ({
  MapaZonas: (props: PropsMapaZonas) => {
    mapa.props = props;
    return <div data-testid="mapa" />;
  },
}));

const CAMPANIA = "11111111-1111-4111-8111-111111111111";
const MVD = "22222222-2222-4222-8222-222222222222";
const MVD_CATALOGO = "33333333-3333-4333-8333-333333333333";
const ZONA_CON_COLOR = "66666666-6666-4666-8666-666666666666";
const ZONA_SIN_COLOR = "77777777-7777-4777-8777-777777777777";

const CIRCULO = {
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

const zona = (id: string, nombre: string, color: string | null) => ({
  zona_id: id,
  nombre,
  tipo_forma: "RADIAL",
  color,
  centro_lat: -34.85,
  centro_lon: -56.24,
  radio_m: 600,
  poligono_geojson: CIRCULO,
  esquinas: null,
  colportores: [],
  ubicaciones_registradas: 10,
});

type Llamada = { nombre: string; args: Record<string, unknown> };

/** Un cliente que contesta como la base: lecturas fijas y `guardar_zona` que devuelve la zona que se le pide guardar. */
function clienteDeLaBase() {
  const llamadas: Llamada[] = [];
  const llamarRpc = vi.fn(async (nombre: string, args: Record<string, unknown>) => {
    llamadas.push({ nombre, args });
    switch (nombre) {
      case "campanias_del_coordinador":
        return [{ id: CAMPANIA, nombre: "Verano 2026" }];
      case "ciudades_de_campania":
        return [{ campania_ciudad_id: MVD, ciudad_id: MVD_CATALOGO, nombre: "Montevideo", lat_centro: -34.87, lon_centro: -56.26, zoom_inicial: 13 }];
      case "colportores_de_campania":
        return [];
      case "zonas_de_ciudad":
        return [zona(ZONA_CON_COLOR, "Cerro Norte", "#1F6E3A"), zona(ZONA_SIN_COLOR, "Prado", null)];
      case "guardar_zona": {
        // Como la base: `color = p_color`, o sea que sin `p_color` la zona queda sin color.
        const guardada = args.p_vista_previa !== true;
        return {
          guardada,
          zona: { ...zona(args.p_zona_id as string, args.p_nombre as string, (args.p_color as string | undefined) ?? null), id: args.p_zona_id },
          poligono_geojson: CIRCULO,
          ubicaciones_incluidas: 12,
        };
      }
      default:
        throw new Error(`Sin respuesta preparada para ${nombre}`);
    }
  });
  return { cliente: { llamarRpc } as unknown as ClienteRpc, llamadas };
}

/** Las acciones que la página le pasa a la vista (`acciones-servidor.ts`), atadas a la fuente de las RPC. */
function accionesDe(fuente: ReturnType<typeof crearFuenteZonasRpc>): AccionesZonas {
  return {
    esquinaMasCercana: (c, p) => fuente.esquinaMasCercana(c, p),
    tramoPorCalles: (c, a, b) => fuente.tramoPorCalles(c, a, b),
    vistaPreviaZona: (e) => fuente.vistaPreviaZona(e),
    guardarZona: (e) => fuente.guardarZona(e),
    asignarZona: (u, z) => fuente.asignarZona(CAMPANIA, u, z),
    quitarZona: (u) => fuente.quitarZona(CAMPANIA, u),
    eliminarZona: (z) => fuente.eliminarZona(CAMPANIA, z),
    buscarCiudades: (t) => fuente.buscarCiudades(CAMPANIA, t),
    agregarCiudad: (c) => fuente.agregarCiudad(CAMPANIA, c),
  };
}

async function montarConLaFuente() {
  const { cliente, llamadas } = clienteDeLaBase();
  const fuente = crearFuenteZonasRpc(cliente);
  const datos = await fuente.obtenerZonas();
  if (!datos) throw new Error("la fuente de prueba debía traer una campaña");
  render(<ZonasCampania datos={datos} acciones={accionesDe(fuente)} />);
  return llamadas;
}

async function editarYGuardar(zonaNombre: string) {
  await userEvent.click(screen.getByRole("button", { name: `Ver la zona ${zonaNombre}` }));
  await userEvent.click(screen.getByRole("button", { name: "Editar forma" }));
  await screen.findByText(/Incluye/);
  await userEvent.click(screen.getByRole("button", { name: "Guardar zona" }));
  await screen.findByRole("region", { name: `Zona ${zonaNombre}` });
}

const guardados = (llamadas: Llamada[]) => llamadas.filter((l) => l.nombre === "guardar_zona" && l.args.p_vista_previa !== true);

afterEach(() => {
  mapa.props = null;
});

/** Acciones sueltas (no la fuente de las RPC) para los casos que fijan la reacción de la vista a una falla puntual. */
function accionesSueltas(sobre: Partial<AccionesZonas> = {}): AccionesZonas {
  return {
    esquinaMasCercana: vi.fn(async (_c: string, p: Punto) => ({ ...p, calleA: "", calleB: "" })),
    tramoPorCalles: vi.fn(async (_c: string, a: Punto, b: Punto) => [a, b]),
    vistaPreviaZona: vi.fn(async () => PREVIA),
    guardarZona: vi.fn(async () => ({ ok: false as const, mensaje: "no" })),
    asignarZona: vi.fn(async () => ({ ok: true as const })),
    quitarZona: vi.fn(async () => ({ ok: true as const })),
    eliminarZona: vi.fn(async () => ({ ok: true as const, colportoresSinZona: 0 })),
    buscarCiudades: vi.fn(async () => []),
    agregarCiudad: vi.fn(async () => ({ ok: false as const, mensaje: "no" })),
    ...sobre,
  };
}

const CENTRO: Punto = { lon: -56.24, lat: -34.85 };
const PREVIA: VistaPreviaZona = {
  poligonoGeojson: CIRCULO as VistaPreviaZona["poligonoGeojson"],
  ubicacionesIncluidas: 12,
  superposicion: null,
  comparteCalle: null,
};

function ciudadCon(zonas: ZonaDeCiudad[], colportores: CiudadDeCampania["colportores"] = []): DatosZonas {
  return {
    campaniaId: CAMPANIA,
    campania: "Verano 2026",
    ciudades: [{ id: MVD, catalogoId: MVD_CATALOGO, nombre: "Montevideo", centro: { lon: -56.26, lat: -34.87 }, zoom: 13, zonas, colportores }],
  };
}

const zonaRadial = (id: string, nombre: string, colportores: ZonaDeCiudad["colportores"] = []): ZonaDeCiudad => ({
  id,
  nombre,
  tipoForma: "RADIAL",
  color: "#13407A",
  centro: CENTRO,
  radioM: 600,
  poligonoGeojson: CIRCULO as ZonaDeCiudad["poligonoGeojson"],
  colportores,
  ubicacionesRegistradas: 10,
});

describe("QA vista 24 con la fuente de las RPC", () => {
  describe("editar una zona y color", () => {
    it("una zona con color propio vuelve a guardarse con ese color", async () => {
      const llamadas = await montarConLaFuente();

      await editarYGuardar("Cerro Norte");

      expect(guardados(llamadas)).toHaveLength(1);
      expect(guardados(llamadas)[0].args).toMatchObject({ p_zona_id: ZONA_CON_COLOR, p_nombre: "Cerro Norte", p_color: "#1F6E3A" });
    });

    it.skip("QA #40: una zona que la base guardó sin color no recibe uno inventado al editarla (hoy manda p_color #8A94A6 y la base lo guarda)", async () => {
      const llamadas = await montarConLaFuente();

      await editarYGuardar("Prado");

      // `rpc.ts` dice «sin color válido va sin color»: la base lo permite y al editar no se pisa. Hoy `aZona` le pone
      // `COLOR_ZONA_SIN_COLOR` a la zona leída y la vista se lo manda de vuelta, así que la base la guarda gris.
      const [guardado] = guardados(llamadas);
      expect(guardado.args).toMatchObject({ p_zona_id: ZONA_SIN_COLOR, p_nombre: "Prado" });
      expect(guardado.args).not.toHaveProperty("p_color");
    });
  });

  describe("contraste (axe en jsdom no lo mide)", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const token = (nombre: string) => {
      const m = new RegExp(`--${nombre}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
      if (!m) throw new Error(`token --${nombre} no encontrado`);
      return m[1];
    };
    const luminancia = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contraste = (a: string, b: string) => {
      const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
      return (claro + 0.05) / (oscuro + 0.05);
    };
    const claseDeColor = (el: Element, prefijo: "text-" | "bg-") =>
      Array.from(el.classList).find((c) => c.startsWith(prefijo) && !/^text-(nav|chico|cuerpo|mini|etiqueta|titulo)\b/.test(c))?.slice(prefijo.length);

    it.skip("QA #40: «Sin elegir» (centro de la zona nueva, antes del primer clic) llega a 4,5:1 sobre su fondo", () => {
      render(
        <PanelFormularioZona
          editando={false}
          nombre=""
          forma={{ tipoForma: "RADIAL" }}
          nombreCentro={null}
          vistaPrevia={null}
          guardando={false}
          error={null}
          onNombre={() => {}}
          onTipoForma={() => {}}
          onRadio={() => {}}
          onQuitarEsquina={() => {}}
          onGuardar={() => {}}
          onCancelar={() => {}}
        />,
      );
      const sinElegir = screen.getByText("Sin elegir");
      const colorTexto = claseDeColor(sinElegir, "text-");
      const colorFondo = claseDeColor(sinElegir.closest("[class*='bg-']") as Element, "bg-");

      // axe en el navegador (Chromium): 2,54:1 (#90a0b7 sobre #fafaf7), texto de 13 px. WCAG 1.4.3 pide 4,5:1.
      expect(contraste(token(colorTexto as string), token(colorFondo as string))).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe("la vista previa que falla por la red", () => {
    it.skip("QA #40: el aviso trae un «Reintentar»; hoy «probá de nuevo» no tiene botón y Guardar sigue apagado aunque vuelva la red", async () => {
      const vistaPreviaZona = vi.fn().mockRejectedValueOnce(new Error("sin red")).mockResolvedValue(PREVIA);
      render(<ZonasCampania datos={ciudadCon([])} acciones={accionesSueltas({ vistaPreviaZona })} />);
      await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
      await userEvent.type(screen.getByRole("textbox", { name: "NOMBRE" }), "Casabó");
      await act(async () => mapa.props?.onMapaClick(CENTRO));
      expect(await screen.findByRole("alert")).toHaveTextContent("Necesitás conexión para calcular las ubicaciones de la zona.");
      expect(screen.getByRole("button", { name: "Guardar zona" })).toBeDisabled();

      // Convención §10: el aviso de error tiene la acción a mano. Sin el botón hay que adivinar que se toca el radio o el mapa.
      await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

      expect(await screen.findByText("Incluye 12 ubicaciones.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Guardar zona" })).toBeEnabled();
    });
  });

  describe("nombres largos sin espacios (el email de respaldo de una cuenta sin nombre también lo es)", () => {
    const largo = "a".repeat(40);

    it.skip("QA #40: el nombre de un colportor sin zona se parte y no empuja «Asignar» fuera de la columna", () => {
      render(<ZonasCampania datos={ciudadCon([], [{ id: "col-1", nombre: largo.repeat(3), zonaId: null, zonaNombre: null }])} acciones={accionesSueltas()} />);

      const nombre = screen.getByText(largo.repeat(3));

      // Sin `min-w-0` en el contenedor flex ni `break-words` en el nombre, la línea mide 810 px en una columna de 360 (captura v24-largos-lista).
      expect(nombre.parentElement?.className).toMatch(/min-w-0/);
      expect(nombre.className).toMatch(/break-words|wrap-anywhere|break-all/);
    });

    it.skip("QA #40: el nombre de 40 letras sin espacios de una zona se parte en el detalle y no esconde el ✕ de cerrar", async () => {
      render(<ZonasCampania datos={ciudadCon([zonaRadial("z-larga", largo)])} acciones={accionesSueltas()} />);
      await userEvent.click(screen.getByRole("button", { name: `Ver la zona ${largo}` }));

      const titulo = screen.getByRole("heading", { name: largo });

      // En el navegador el título se sale de la tarjeta y el ✕ queda fuera de la vista (captura v24-largos-detalle).
      expect(titulo.parentElement?.className).toMatch(/min-w-0/);
    });
  });

  describe("el foco con el teclado al cambiar de panel", () => {
    // Al cerrar (Cancelar, ✕, cerrar el detalle) la vista devuelve el foco a la fila o a «+ Nueva zona» (`volverFoco`).
    // Al abrir no hace nada: el botón que tenía el foco desaparece y el foco cae al <body> (Chromium: BODY en las cuatro).
    const colportor = { id: "col-1", nombre: "Pablo Ferreira", zonaId: null, zonaNombre: null };
    const dentroDe = (region: string) => {
      const activo = document.activeElement;
      return activo !== null && activo !== document.body && screen.getByRole("region", { name: region }).contains(activo);
    };

    it.skip("QA #40: «+ Nueva zona» lleva el foco al formulario", async () => {
      render(<ZonasCampania datos={ciudadCon([zonaRadial("z-1", "Prado")])} acciones={accionesSueltas()} />);

      await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));

      expect(dentroDe("Nueva zona")).toBe(true);
    });

    it.skip("QA #40: abrir una zona de la lista lleva el foco al detalle, y «Editar forma» al formulario", async () => {
      render(<ZonasCampania datos={ciudadCon([zonaRadial("z-1", "Prado")])} acciones={accionesSueltas()} />);

      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Prado" }));
      expect(dentroDe("Zona Prado")).toBe(true);

      await userEvent.click(screen.getByRole("button", { name: "Editar forma" }));
      expect(dentroDe("Editar zona")).toBe(true);
    });

    it.skip("QA #40: tras «Asignar a <zona>» y tras «Quitar» el foco sigue en el detalle, en algo que se pueda usar", async () => {
      render(<ZonasCampania datos={ciudadCon([zonaRadial("z-1", "Prado")], [colportor])} acciones={accionesSueltas()} />);
      await userEvent.click(screen.getByRole("button", { name: "Ver la zona Prado" }));
      await userEvent.click(screen.getByRole("button", { name: /Elegir colportor/ }));
      await userEvent.click(screen.getByRole("option", { name: /Pablo Ferreira/ }));

      await userEvent.click(screen.getByRole("button", { name: "Asignar a Prado" }));
      await screen.findByText("Pablo Ferreira quedó en Prado.");
      // El botón que se tocó queda apagado («ya trabaja esta zona»): el foco no puede quedarse en un botón apagado.
      expect(dentroDe("Zona Prado")).toBe(true);
      expect(document.activeElement).toBeEnabled();

      await userEvent.click(screen.getByRole("button", { name: "Quitar a Pablo Ferreira de Prado" }));
      await screen.findByText("Pablo Ferreira quedó sin zona.");
      // «Quitar» desaparece de la lista con el colportor: en Chromium el foco cae al <body>.
      expect(dentroDe("Zona Prado")).toBe(true);
    });
  });

  describe("el tope de 40 caracteres del nombre", () => {
    it.skip("QA #40: cuenta caracteres como la base (char_length), no unidades UTF-16: 21 emojis entran", async () => {
      await montarConLaFuente();
      await userEvent.click(screen.getByRole("button", { name: "+ Nueva zona" }));
      await userEvent.click(screen.getByRole("textbox", { name: "NOMBRE" }));
      await userEvent.paste("🌳".repeat(21));
      await act(async () => mapa.props?.onMapaClick({ lon: -56.24, lat: -34.85 }));
      await screen.findByText(/Incluye/);

      // La base cuenta 21 caracteres (≤ 40) y la acepta; la vista cuenta 42 y muestra «hasta 40 caracteres».
      expect(screen.queryByText("El nombre puede tener hasta 40 caracteres.")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Guardar zona" })).toBeEnabled();
    });
  });
});
