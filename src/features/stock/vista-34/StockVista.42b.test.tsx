import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { AjusteDeStock, ColportorDeStock, DatosDeStock, ExistenciaDeStock } from "@/datos/stock/contrato";
import { crearDatosDeStockSimulados } from "@/datos/stock/simulado";

import { StockVista } from "./StockVista";

// Retoque 42B de Claude Design («42 Retoques Stock y Pedidos», HU-STK-010, #91): 42B·01 «Stock» (el aviso «N pedidos por autorizar
// en <ciudad>», «Ver pedidos», «Ver en Cuentas →», «Sincronizó…» en rojo) y 42B·02 «Sin aviso» (sin pedidos no hay aviso ni número).
// La acción «Pedir transferencia de materiales» tiene sus tests en `StockVista.transferencia.test.tsx`.

const haceHoras = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const ex = (productoId: string, tiene: number, porEntregar = 0): ExistenciaDeStock => ({ productoId, tiene, porEntregar, entregados: 0, devueltos: 0, porCobrar: 0 });
const col = (id: string, ciudadId: string | null, ultimoDatoAt: string | null, ajustes?: AjusteDeStock[], ...existencias: ExistenciaDeStock[]): ColportorDeStock => ({
  id,
  nombre: id.replace(/-/g, " "),
  ciudadId,
  ultimoDatoAt,
  existencias: existencias.length > 0 ? existencias : [ex("l1", 3)],
  ajustes,
});
const ajuste = (id: string, productoId: string, cantidad: number, motivo: AjusteDeStock["motivo"], cuando: string, cargadoPor = "ana"): AjusteDeStock => ({
  id,
  productoId,
  cantidad,
  motivo,
  cuando,
  cargadoPor,
});

const chico = (parcial: Partial<DatosDeStock> = {}): DatosDeStock => ({
  campaniaId: "c",
  ciudades: [
    { id: "riv", nombre: "Rivera", departamento: "Rivera" },
    { id: "art", nombre: "Artigas", departamento: "Artigas" },
  ],
  productos: [
    { id: "l1", nombre: "Libro uno", tipo: "LIBRO", nota: null },
    { id: "r1", nombre: "Revista uno", tipo: "REVISTA", nota: null },
    { id: "r2", nombre: "Revista dos", tipo: "REVISTA", nota: null },
  ],
  colportores: [col("ana", "riv", haceHoras(5), undefined, ex("l1", 3), ex("r1", 2), ex("r2", 1)), col("beto", "art", haceHoras(6), undefined, ex("l1", 3), ex("r1", 2), ex("r2", 1))],
  pedidosPorAutorizar: [{ ciudadId: "riv", pedidos: 2 }],
  ...parcial,
});

const lista = () => screen.getByRole("navigation", { name: "Ciudades" });
const elegir = (nombre: RegExp | string) => userEvent.click(within(lista()).getByRole("button", { name: nombre }));
const tabla = () => screen.getByRole("table", { name: /^Stock por producto en/ });
const abrir = (nombre: RegExp | string) => userEvent.click(within(tabla()).getByRole("button", { name: nombre }));
const avisos = () => screen.queryByRole("list", { name: "Avisos de stock" });
const navegacion = () => screen.getByRole("navigation", { name: "Otras vistas de stock" });

describe("42B·01 · el aviso «N pedidos por autorizar en <ciudad>» con «Ver pedidos»", () => {
  it("dice «2 pedidos por autorizar en Rivera» con la etiqueta PEDIDOS y lleva a la vista 35 en esa ciudad", async () => {
    render(<StockVista datos={chico()} />);
    await elegir(/^Rivera/);

    const aviso = within(avisos()!).getByText("PEDIDOS").closest("li")!;
    expect(aviso).toHaveTextContent("2 pedidos por autorizar en Rivera");
    expect(within(aviso).getByRole("link", { name: "Ver pedidos por autorizar en Rivera" })).toHaveAttribute("href", "/stock/pedidos?ciudad=riv");
    expect(within(aviso).getByRole("link")).toHaveTextContent("Ver pedidos");
  });

  it("con un solo pedido lo dice en singular", async () => {
    render(<StockVista datos={chico({ pedidosPorAutorizar: [{ ciudadId: "riv", pedidos: 1 }] })} />);
    await elegir(/^Rivera/);
    expect(avisos()).toHaveTextContent("1 pedido por autorizar en Rivera");
    expect(avisos()).not.toHaveTextContent("1 pedidos");
  });

  it("en «todas las ciudades» hay un aviso por ciudad con pedidos, cada uno con su ciudad; la que no tiene no avisa", () => {
    render(<StockVista datos={chico({ pedidosPorAutorizar: [{ ciudadId: "riv", pedidos: 2 }, { ciudadId: "art", pedidos: 1 }] })} />);
    const items = within(avisos()!).getAllByText("PEDIDOS").map((e) => e.closest("li")!);
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining("1 pedido por autorizar en Artigas"),
      expect.stringContaining("2 pedidos por autorizar en Rivera"),
    ]);
  });

  it("los pedidos van antes que los avisos de producto y la cuenta de la franja los incluye", async () => {
    render(<StockVista datos={chico({ colportores: [col("ana", "riv", haceHoras(5), undefined, ex("l1", 0, 3))] })} />);
    await elegir(/^Rivera/);
    const items = within(avisos()!).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("PEDIDOS");
    expect(items[1]).toHaveTextContent("STOCK");
    expect(screen.getByText(/^\d+ avisos$/)).toHaveTextContent(`${items.length} avisos`);
  });

  it("«Sin ciudad»: los pedidos de colportores sin ciudad se avisan aparte y «Ver pedidos» abre la vista sin elegir ciudad", () => {
    render(<StockVista datos={chico({ pedidosPorAutorizar: [{ ciudadId: null, pedidos: 3 }] })} />);
    const aviso = within(avisos()!).getByText("PEDIDOS").closest("li")!;
    expect(aviso).toHaveTextContent("3 pedidos por autorizar de colportores sin ciudad");
    expect(within(aviso).getByRole("link")).toHaveAttribute("href", "/stock/pedidos");
  });

  it("una ciudad que ya no figura en la lista cuenta como «sin ciudad»: el pedido no se pierde", () => {
    render(<StockVista datos={chico({ pedidosPorAutorizar: [{ ciudadId: "fantasma", pedidos: 2 }] })} />);
    expect(avisos()).toHaveTextContent("2 pedidos por autorizar de colportores sin ciudad");
  });

  it("el número de la lista de ciudades dice «2 por autorizar» donde iba «sin avisos»; con avisos de producto, van los dos", async () => {
    const { rerender } = render(<StockVista datos={chico()} />);
    expect(within(lista()).getByRole("button", { name: /^Rivera/ })).toHaveTextContent("2 por autorizar");
    expect(within(lista()).getByRole("button", { name: /^Artigas/ })).toHaveTextContent("sin avisos");

    rerender(
      <StockVista
        datos={chico({ colportores: [col("ana", "riv", haceHoras(5), undefined, ex("l1", 0, 3), ex("r1", 2), ex("r2", 1)), col("beto", "art", haceHoras(6), undefined, ex("l1", 3), ex("r1", 2), ex("r2", 1))] })}
      />,
    );
    expect(within(lista()).getByRole("button", { name: /^Rivera/ })).toHaveTextContent("1 aviso · 2 por autorizar");
  });

  it("la pestaña «Pedidos y transferencias» lleva el número de lo que se mira, dicho también para el lector", async () => {
    render(<StockVista datos={chico({ pedidosPorAutorizar: [{ ciudadId: "riv", pedidos: 2 }, { ciudadId: "art", pedidos: 1 }] })} />);
    expect(within(navegacion()).getByRole("link", { name: "Pedidos y transferencias (3 pedidos por autorizar) →" })).toHaveAttribute("href", "/stock/pedidos");

    await elegir(/^Artigas/);
    expect(within(navegacion()).getByRole("link", { name: "Pedidos y transferencias (1 pedido por autorizar) →" })).toBeInTheDocument();
  });
});

describe("42B·02 · sin pedidos por autorizar no hay aviso ni número", () => {
  it("sin pedidos: ni la franja PEDIDOS, ni el «por autorizar» de la lista, ni el número en la pestaña", async () => {
    render(<StockVista datos={chico({ pedidosPorAutorizar: [] })} />);
    await elegir(/^Rivera/);
    expect(screen.queryByText("PEDIDOS")).toBeNull();
    expect(within(lista()).getByRole("button", { name: /^Rivera/ })).not.toHaveTextContent("por autorizar");
    expect(within(navegacion()).getByRole("link", { name: "Pedidos y transferencias →" })).toBeInTheDocument();
  });

  it("sin la clave `pedidosPorAutorizar` pasa lo mismo (datos de antes de la lectura de pedidos)", () => {
    const datos = chico();
    delete datos.pedidosPorAutorizar;
    render(<StockVista datos={datos} />);
    expect(screen.queryByText("PEDIDOS")).toBeNull();
    expect(within(navegacion()).getByRole("link", { name: "Pedidos y transferencias →" })).toBeInTheDocument();
  });

  it("un número que no sirve (cero, negativo, NaN) no es un pedido: no avisa", () => {
    render(<StockVista datos={chico({ pedidosPorAutorizar: [{ ciudadId: "riv", pedidos: 0 }, { ciudadId: "art", pedidos: -2 }, { ciudadId: "riv", pedidos: Number.NaN }] })} />);
    expect(screen.queryByText("PEDIDOS")).toBeNull();
  });

  it("con la fuente simulada hay pedidos en las tres ciudades, los mismos que la bandeja de la vista 35", () => {
    render(<StockVista datos={crearDatosDeStockSimulados()} />);
    const textos = within(avisos()!).getAllByText("PEDIDOS").map((e) => e.closest("li")!.textContent);
    expect(textos).toEqual([
      expect.stringContaining("1 pedido por autorizar en Artigas"),
      expect.stringContaining("1 pedido por autorizar en Bella Unión"),
      expect.stringContaining("2 pedidos por autorizar en Rivera"),
    ]);
  });
});

describe("42B·01 · «Ver en Cuentas →» en cada colportor de la fila abierta", () => {
  it("cada colportor lleva su enlace a Cuentas, con su nombre para el lector", async () => {
    render(<StockVista datos={chico({ colportores: [col("ana", "riv", haceHoras(5)), col("beto", "riv", haceHoras(5))] })} />);
    await elegir(/^Rivera/);
    await abrir(/Libro uno/);

    const quien = screen.getByRole("table", { name: /^Quién tiene Libro uno/ });
    const enlaces = within(quien).getAllByRole("link");
    expect(enlaces.map((e) => e.textContent)).toEqual(["Ver en Cuentas →", "Ver en Cuentas →"]);
    expect(within(quien).getByRole("link", { name: "Ver en Cuentas la plata de ana" })).toHaveAttribute("href", "/cuentas?colportor=ana");
    expect(within(quien).getByRole("link", { name: "Ver en Cuentas la plata de beto" })).toHaveAttribute("href", "/cuentas?colportor=beto");
  });

  it("el id con espacios, tildes o barras se escapa: el enlace nunca se rompe", async () => {
    render(<StockVista datos={chico({ colportores: [{ ...col("ana", "riv", haceHoras(5)), id: "ana maría/1&x=2" }] })} />);
    await elegir(/^Rivera/);
    await abrir(/Libro uno/);
    expect(screen.getByRole("link", { name: /Ver en Cuentas la plata de/ })).toHaveAttribute("href", "/cuentas?colportor=ana%20mar%C3%ADa%2F1%26x%3D2");
  });

  it("la plata sigue sin estar en Stock: el enlace no muestra montos", async () => {
    render(<StockVista datos={chico()} />);
    await elegir(/^Rivera/);
    await abrir(/Libro uno/);
    expect(screen.getByRole("table", { name: /^Quién tiene/ }).textContent).not.toMatch(/\$|UYU/);
  });

  it("con un nombre larguísimo la fila no se rompe y el enlace sigue entero", async () => {
    const largo = "María de los Ángeles Fernández de la Peña y Rodríguez de Almeida".repeat(3);
    render(<StockVista datos={chico({ colportores: [{ ...col("ana", "riv", haceHoras(5)), nombre: largo }] })} />);
    await elegir(/^Rivera/);
    await abrir(/Libro uno/);
    expect(screen.getByRole("link", { name: `Ver en Cuentas la plata de ${largo}` })).toBeInTheDocument();
  });
});

describe("42B·01 · «Sincronizó el …» en rojo después de dos días", () => {
  const sincroniza = async (ultimoDatoAt: string | null) => {
    render(<StockVista datos={chico({ colportores: [col("ana", "riv", ultimoDatoAt)] })} />);
    await elegir(/^Rivera/);
    await abrir(/Libro uno/);
    const cabecera = within(screen.getByRole("table", { name: /^Quién tiene/ })).getByRole("rowheader", { name: /^ana/ });
    return cabecera.querySelector("span:nth-child(2)") as HTMLElement;
  };

  it("más de dos días: rojo, con el triángulo y dicho para el lector (no solo el color)", async () => {
    const linea = await sincroniza(haceHoras(49));
    expect(linea.className).toContain("text-peligro");
    expect(linea).toHaveTextContent(/^△ Sincronizó el /);
    expect(linea).toHaveTextContent("(hace más de dos días)");
    expect(linea.querySelector("[aria-hidden='true']")).toHaveTextContent("△");
  });

  it("menos de dos días: sin rojo ni símbolo", async () => {
    const linea = await sincroniza(haceHoras(47));
    expect(linea.className).not.toContain("text-peligro");
    expect(linea).not.toHaveTextContent("△");
    expect(linea).not.toHaveTextContent("más de dos días");
  });

  it("«Todavía no sincronizó» no es una fecha vieja: va como siempre", async () => {
    const linea = await sincroniza(null);
    expect(linea).toHaveTextContent("Todavía no sincronizó");
    expect(linea.className).not.toContain("text-peligro");
  });

  it("una fecha futura (reloj corrido) o ilegible no se marca", async () => {
    expect((await sincroniza(haceHoras(-5))).className).not.toContain("text-peligro");
  });

  it("con la fuente simulada, Natalia Vidal (74 h sin señal) sale en rojo y las demás no", async () => {
    render(<StockVista datos={crearDatosDeStockSimulados()} />);
    await elegir(/^Artigas/);
    await abrir(/Pamplona|Misioneros/);
    const quien = screen.getByRole("table", { name: /^Quién tiene Misioneros/ });
    const natalia = within(quien).getByRole("rowheader", { name: /^Natalia Vidal/ });
    expect(natalia.querySelector(".text-peligro")).not.toBeNull();
    expect(quien.querySelectorAll(".text-peligro")).toHaveLength(1);
  });
});

describe("42B·01 · los ajustes de stock que cargó la colportora (decisión del 28/10, «Ajuste stock»)", () => {
  const conAjustes = (...ajustes: AjusteDeStock[]) =>
    chico({ colportores: [col("ana", "riv", haceHoras(5), ajustes, ex("l1", 3), ex("r1", 2), ex("r2", 1))] });
  const abrirLibro = async (datos: DatosDeStock) => {
    render(<StockVista datos={datos} />);
    await elegir(/^Rivera/);
    await abrir(/Libro uno/);
  };
  const lista = () => screen.getByRole("list", { name: /^Ajustes de stock de/ });

  it("cada ajuste dice cuánto, por qué, cuándo y quién lo cargó; los más nuevos primero", async () => {
    await abrirLibro(
      conAjustes(
        ajuste("a1", "l1", 7, "STOCK_INICIAL", "2026-10-10T15:00:00Z", "Ana"),
        ajuste("a2", "l1", -2, "LIBROS_DANADOS", "2026-10-20T21:30:00Z", "Ana"),
        ajuste("a3", "l1", 1, "CONTEO", "2026-10-15T13:05:00Z", "Ana"),
      ),
    );
    const items = within(lista()).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("ana");
    expect(items[0]).toHaveTextContent("Salida de 2");
    expect(items[0]).toHaveTextContent("Libros dañados");
    expect(items[0]).toHaveTextContent("20/10 a las 18:30");
    expect(items[0]).toHaveTextContent("Lo cargó Ana");
    expect(items[1]).toHaveTextContent("Entrada de 1");
    expect(items[1]).toHaveTextContent("Conteo");
    expect(items[2]).toHaveTextContent("Entrada de 7");
    expect(items[2]).toHaveTextContent("Stock inicial");
    expect(screen.getByText("AJUSTES DE STOCK")).toBeInTheDocument();
  });

  it("sin ajustes no hay sección; los ajustes de otro producto no se mezclan", async () => {
    await abrirLibro(conAjustes(ajuste("a1", "r1", 4, "STOCK_INICIAL", "2026-10-10T15:00:00Z")));
    expect(screen.queryByRole("list", { name: /^Ajustes de stock de/ })).toBeNull();
    expect(screen.queryByText("AJUSTES DE STOCK")).toBeNull();
  });

  it("una categoría junta los ajustes de sus productos y dice de cuál es cada uno", async () => {
    render(
      <StockVista
        datos={conAjustes(ajuste("a1", "r1", 4, "STOCK_INICIAL", "2026-10-10T15:00:00Z"), ajuste("a2", "r2", -1, "CONTEO", "2026-10-11T15:00:00Z"))}
      />,
    );
    await elegir(/^Rivera/);
    await abrir(/Revistas · todas/);
    const items = within(screen.getByRole("list", { name: /^Ajustes de stock de Revistas/ })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Revista dos");
    expect(items[1]).toHaveTextContent("Revista uno");
  });

  it("un ajuste en cero, que no es número o de un producto que no existe no se muestra", async () => {
    await abrirLibro(
      conAjustes(
        ajuste("a1", "l1", 0, "CONTEO", "2026-10-10T15:00:00Z"),
        ajuste("a2", "l1", Number.NaN, "CONTEO", "2026-10-10T15:00:00Z"),
        ajuste("a3", "fantasma", 5, "CONTEO", "2026-10-10T15:00:00Z"),
      ),
    );
    expect(screen.queryByRole("list", { name: /^Ajustes de stock de/ })).toBeNull();
  });

  it("sin fecha legible el ajuste igual se ve (sin fecha) y al final; sin quién lo cargó dice «la colportora»", async () => {
    await abrirLibro(conAjustes(ajuste("a1", "l1", 2, "CONTEO", "no-es-fecha", "  "), ajuste("a2", "l1", 3, "STOCK_INICIAL", "2026-10-10T15:00:00Z")));
    const items = within(lista()).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Entrada de 3");
    expect(items[1]).toHaveTextContent("Entrada de 2");
    expect(items[1]).toHaveTextContent("Lo cargó la colportora");
    expect(items[1].textContent).not.toMatch(/invalid|nan|undefined/i);
  });

  it("con 200 ajustes la lista se desplaza dentro de su alto y se alcanza con el teclado", async () => {
    const muchos = Array.from({ length: 200 }, (_, i) => ajuste(`a${i}`, "l1", i % 2 === 0 ? 1 : -1, "CONTEO", new Date(Date.UTC(2026, 9, 1, 12, i)).toISOString()));
    await abrirLibro(conAjustes(...muchos));
    expect(within(lista()).getAllByRole("listitem")).toHaveLength(200);
    expect(lista()).toHaveAttribute("tabindex", "0");
    expect(lista().className).toContain("overflow-auto");
  });

  it("con la fila sin quién que la tenga, los ajustes se ven igual, con el «Nadie lo tiene»", async () => {
    render(<StockVista datos={chico({ colportores: [col("ana", "riv", haceHoras(5), [ajuste("a1", "l1", 5, "STOCK_INICIAL", "2026-10-10T15:00:00Z")], ex("l1", 0))] })} />);
    await elegir(/^Rivera/);
    await abrir(/Libro uno/);
    expect(screen.getByText("Nadie lo tiene en Rivera.")).toBeInTheDocument();
    expect(lista()).toHaveTextContent("Entrada de 5");
  });

  it("varias ciudades: el ajuste dice de qué ciudad es la colportora", async () => {
    render(
      <StockVista
        datos={chico({
          colportores: [
            col("ana", "riv", haceHoras(5), [ajuste("a1", "l1", 5, "STOCK_INICIAL", "2026-10-10T15:00:00Z")]),
            col("beto", "art", haceHoras(5)),
          ],
        })}
      />,
    );
    await abrir(/Libro uno/);
    expect(lista()).toHaveTextContent("ana · Rivera");
  });

  it("con la fuente simulada: Lucía Fernández tiene su stock inicial y los libros dañados del Deseado de Todas las Gentes", async () => {
    render(<StockVista datos={crearDatosDeStockSimulados()} />);
    await elegir(/^Rivera/);
    await abrir(/El Deseado de Todas las Gentes/);
    const items = within(screen.getByRole("list", { name: /^Ajustes de stock de El Deseado/ })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Salida de 1");
    expect(items[0]).toHaveTextContent("Libros dañados");
    expect(items[1]).toHaveTextContent("Entrada de 7");
    expect(items[1]).toHaveTextContent("Stock inicial");
  });
});

describe("volver atrás y reentrar", () => {
  it("al volver a mirar la ciudad, el aviso y el número siguen donde estaban", async () => {
    render(<StockVista datos={chico()} />);
    await elegir(/^Rivera/);
    await elegir(/^Artigas/);
    expect(screen.queryByText("PEDIDOS")).toBeNull();
    await elegir(/^Rivera/);
    expect(avisos()).toHaveTextContent("2 pedidos por autorizar en Rivera");
  });
});
