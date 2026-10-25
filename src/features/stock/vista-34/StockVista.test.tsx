import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { ColportorDeStock, DatosDeStock, ExistenciaDeStock } from "@/datos/stock/contrato";
import { crearDatosDeStockSimulados } from "@/datos/stock/simulado";

import { StockVista } from "./StockVista";

const simulados = () => crearDatosDeStockSimulados();

const ex = (productoId: string, tiene: number, porEntregar = 0): ExistenciaDeStock => ({ productoId, tiene, porEntregar, entregados: 0, porCobrar: 0 });
const col = (id: string, ciudadId: string | null, ...existencias: ExistenciaDeStock[]): ColportorDeStock => ({ id, nombre: id, ciudadId, existencias });

const chico = (parcial: Partial<DatosDeStock> = {}): DatosDeStock => ({
  campaniaId: "c",
  ciudades: [{ id: "riv", nombre: "Rivera", departamento: "Rivera" }],
  productos: [{ id: "l1", nombre: "Libro uno", tipo: "LIBRO", nota: null }],
  colportores: [col("ana", "riv", ex("l1", 3))],
  ...parcial,
});

const lista = () => screen.getByRole("navigation", { name: "Ciudades" });
const elegir = (nombre: RegExp | string) => userEvent.click(within(lista()).getByRole("button", { name: nombre }));
const tabla = () => screen.getByRole("table", { name: /^Stock por producto en/ });
const fila = (nombre: string) => within(tabla()).getByRole("button", { name: new RegExp(nombre) });

describe("StockVista", () => {
  it("arranca en todas las ciudades con las cuatro tarjetas, los avisos y la tabla por producto", () => {
    render(<StockVista datos={simulados()} />);

    expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
    expect(screen.getByText("25 colportores · 11 productos")).toBeInTheDocument();
    const tarjetas = within(screen.getByRole("list", { name: "Resumen por tipo" })).getAllByRole("listitem");
    expect(tarjetas.map((t) => t.textContent)).toEqual([
      expect.stringContaining("LIBROS"),
      expect.stringContaining("REVISTAS"),
      expect.stringContaining("MATERIAL"),
      expect.stringContaining("MISIONEROS"),
    ]);
    expect(screen.getByRole("list", { name: "Avisos de stock" })).toBeInTheDocument();
    expect(within(tabla()).getAllByRole("columnheader").slice(0, 7).map((h) => h.textContent)).toEqual([
      "PRODUCTO",
      "EN LA CIUDAD",
      "EN MANOS DE",
      "POR ENTREGAR",
      "ENTREGADOS",
      "POR COBRAR",
      "ESTADO",
    ]);
  });

  describe("artboard 34A·01 · Rivera por producto", () => {
    it("muestra el departamento, las tarjetas y el aviso de La Gran Esperanza", async () => {
      render(<StockVista datos={simulados()} />);
      await elegir(/^Rivera/);

      expect(screen.getByRole("heading", { level: 2, name: "Rivera" })).toBeInTheDocument();
      expect(screen.getByText("10 colportores · 11 productos · Departamento Rivera")).toBeInTheDocument();
      const tarjeta = screen.getByRole("list", { name: "Resumen por tipo" }).children[0];
      expect(tarjeta).toHaveTextContent("LIBROS");
      expect(tarjeta).toHaveTextContent("86");
      expect(tarjeta).toHaveTextContent("5 productos");
      expect(tarjeta).toHaveTextContent("1 con aviso");
      const aviso = within(screen.getByRole("list", { name: "Avisos de stock" })).getByRole("listitem");
      expect(aviso).toHaveTextContent("La Gran Esperanza hay 4, faltan 2");
      const gran = within(tabla()).getByRole("row", { name: /La Gran Esperanza/ });
      expect(gran).toHaveTextContent("2 de 10");
      expect(gran).toHaveTextContent("△Faltan 2 para entregar");
      expect(within(tabla()).getByRole("row", { name: /El Deseado/ })).toHaveTextContent("✓Alcanza");
    });

    it("agrupa por tipo: libros y material producto por producto, revistas y misioneros por categoría", async () => {
      render(<StockVista datos={simulados()} />);
      await elegir(/^Rivera/);

      expect(within(tabla()).getAllByRole("columnheader", { name: /^(Libros|Revistas|Material|Misioneros)/ }).map((h) => h.textContent)).toEqual([
        "Libros5 productos",
        "Revistaspor categoría",
        "Material2 productos",
        "Misionerospor categoría",
      ]);
      expect(within(tabla()).getByRole("button", { name: /Revistas · todas/ })).toBeInTheDocument();
      expect(within(tabla()).getByRole("button", { name: /Misioneros · todos/ })).toBeInTheDocument();
      expect(within(tabla()).queryByRole("button", { name: /^Revista Vida Feliz/ })).not.toBeInTheDocument();
      expect(within(tabla()).getByText("tipo a confirmar")).toBeInTheDocument();
    });
  });

  describe("artboard 34A·02 · Rivera con La Gran Esperanza abierta", () => {
    it("abre la fila y muestra quién tiene o debe entregar, sin la ciudad", async () => {
      render(<StockVista datos={simulados()} />);
      await elegir(/^Rivera/);
      await userEvent.click(fila("La Gran Esperanza"));

      expect(fila("La Gran Esperanza")).toHaveAttribute("aria-expanded", "true");
      const detalle = screen.getByRole("table", { name: "Quién tiene La Gran Esperanza en Rivera" });
      expect(within(detalle).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
        "QUIÉN LO TIENE O DEBE ENTREGARLO",
        "TIENE",
        "POR ENTREGAR",
        "ENTREGADOS",
        "POR COBRAR",
      ]);
      const filas = within(detalle).getAllByRole("row").slice(1);
      expect(filas.map((f) => f.querySelector("th")?.textContent)).toEqual([
        "Camila Núñez",
        "Emiliano Sosa",
        "Lucía Fernández",
        "Santiago Pereira",
        "Valentina Silva",
      ]);
      expect(within(filas[3]).getAllByRole("cell")[0]).toHaveTextContent("1");
    });

    it("se cierra con otro toque", async () => {
      render(<StockVista datos={simulados()} />);
      await elegir(/^Rivera/);
      await userEvent.click(fila("La Gran Esperanza"));
      await userEvent.click(fila("La Gran Esperanza"));

      expect(fila("La Gran Esperanza")).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("table", { name: /Quién tiene/ })).not.toBeInTheDocument();
    });

    it("el renglón entero abre el detalle con el mouse, y el botón no lo abre y cierra a la vez", async () => {
      render(<StockVista datos={simulados()} />);
      await elegir(/^Rivera/);

      await userEvent.click(within(tabla()).getByRole("row", { name: /Vida Sana/ }).querySelectorAll("td")[0]);
      expect(fila("Vida Sana")).toHaveAttribute("aria-expanded", "true");

      await userEvent.click(fila("Historias para Niños"));
      expect(fila("Historias para Niños")).toHaveAttribute("aria-expanded", "true");
    });

    it("se abren varias filas a la vez y siguen abiertas al cambiar de ciudad", async () => {
      render(<StockVista datos={simulados()} />);
      await elegir(/^Rivera/);
      await userEvent.click(fila("La Gran Esperanza"));
      await userEvent.click(fila("Vida Sana"));
      await elegir(/^Artigas/);

      expect(fila("La Gran Esperanza")).toHaveAttribute("aria-expanded", "true");
      expect(fila("Vida Sana")).toHaveAttribute("aria-expanded", "true");
      expect(screen.getAllByRole("table", { name: /Quién tiene/ })).toHaveLength(2);
    });

    it("dos toques seguidos en la misma fila la dejan como estaba, sin trabar nada", async () => {
      render(<StockVista datos={simulados()} />);
      await userEvent.dblClick(fila("La Gran Esperanza"));

      expect(fila("La Gran Esperanza")).toHaveAttribute("aria-expanded", "false");
      await userEvent.click(fila("La Gran Esperanza"));
      expect(fila("La Gran Esperanza")).toHaveAttribute("aria-expanded", "true");
    });
  });

  describe("artboard 34A·03 · Artigas con misioneros agotados", () => {
    it("avisa el producto agotado con lo que hay por entregar y muestra a quienes lo deben", async () => {
      render(<StockVista datos={simulados()} />);
      await elegir(/^Artigas/);

      const aviso = within(screen.getByRole("list", { name: "Avisos de stock" })).getByRole("listitem");
      expect(aviso).toHaveTextContent("Misioneros · todos agotado · 4 por entregar");
      expect(within(aviso).getByRole("link", { name: "Ver pedidos de Misioneros · todos" })).toHaveTextContent("Ver pedidos");
      const tarjeta = screen.getByRole("list", { name: "Resumen por tipo" }).children[3];
      expect(tarjeta).toHaveTextContent("0");
      expect(tarjeta).toHaveTextContent("se cuentan juntos");
      expect(tarjeta).toHaveTextContent("Agotado en la ciudad");

      await userEvent.click(fila("Misioneros · todos"));
      const detalle = screen.getByRole("table", { name: "Quién tiene Misioneros · todos en Artigas" });
      expect(within(detalle).getByRole("rowheader", { name: "Natalia Vidal" })).toBeInTheDocument();
      expect(within(detalle).getByRole("rowheader", { name: "Sofía Cabral" })).toBeInTheDocument();
      expect(within(fila("Misioneros · todos").closest("tr")!).getByText("nadie")).toBeInTheDocument();
    });

    it("si nadie lo tiene ni lo debe, la fila abierta lo dice", async () => {
      render(<StockVista datos={chico({ colportores: [col("ana", "riv", ex("l1", 0))] })} />);
      await userEvent.click(fila("Libro uno"));

      expect(screen.getByText("Nadie lo tiene en Todas las ciudades.")).toBeInTheDocument();
      expect(screen.queryByRole("table", { name: /Quién tiene/ })).not.toBeInTheDocument();
    });
  });

  describe("avisos", () => {
    it("«Ver quién tiene» desde varias ciudades pasa a esa ciudad, abre la fila y le da el foco", async () => {
      render(<StockVista datos={simulados()} />);
      const aviso = screen.getByRole("button", { name: "Ver quién tiene La Gran Esperanza en Rivera" });
      expect(aviso.closest("li")).toHaveTextContent("Rivera: hay 4, faltan 2");

      await userEvent.click(aviso);

      expect(screen.getByRole("heading", { level: 2, name: "Rivera" })).toBeInTheDocument();
      expect(fila("La Gran Esperanza")).toHaveAttribute("aria-expanded", "true");
      expect(fila("La Gran Esperanza")).toHaveFocus();
      expect(screen.getByRole("table", { name: "Quién tiene La Gran Esperanza en Rivera" })).toBeInTheDocument();
    });

    it("«Ver quién tiene» sobre una fila ya abierta la deja abierta", async () => {
      render(<StockVista datos={simulados()} />);
      await elegir(/^Rivera/);
      await userEvent.click(fila("La Gran Esperanza"));
      await userEvent.click(screen.getByRole("button", { name: "Ver quién tiene La Gran Esperanza" }));

      expect(fila("La Gran Esperanza")).toHaveAttribute("aria-expanded", "true");
    });

    it("«Ver pedidos» lleva a la vista 35, pedidos y transferencias", async () => {
      render(<StockVista datos={simulados()} />);
      await elegir(/^Artigas/);

      expect(screen.getByRole("link", { name: "Ver pedidos de Misioneros · todos" })).toHaveAttribute("href", "/stock/pedidos");
    });

    it("«Pedidos y transferencias →» lleva a la vista 35", () => {
      render(<StockVista datos={simulados()} />);

      expect(screen.getByRole("link", { name: "Pedidos y transferencias →" })).toHaveAttribute("href", "/stock/pedidos");
    });

    it("sin avisos no hay franja", async () => {
      render(<StockVista datos={simulados()} />);
      await elegir(/^Bella Unión/);

      expect(screen.queryByRole("list", { name: "Avisos de stock" })).not.toBeInTheDocument();
    });

    it("con muchos avisos la franja se ve entera dentro de su propio scroll", () => {
      const productos = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, nombre: `Producto ${i}`, tipo: "LIBRO" as const, nota: null }));
      render(<StockVista datos={chico({ productos })} />);

      const franja = screen.getByRole("list", { name: "Avisos de stock" });
      expect(within(franja).getAllByRole("listitem")).toHaveLength(40);
      expect(franja.className).toMatch(/overflow-auto/);
    });
  });

  describe("lista de ciudades", () => {
    it("agrupa por departamento, con «Todo el departamento» donde hay más de una ciudad, y avisos por ciudad", () => {
      render(<StockVista datos={simulados()} />);

      const nav = lista();
      expect(within(nav).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["DEPTO. ARTIGAS", "DEPTO. RIVERA"]);
      expect(within(nav).getByRole("button", { name: "Rivera, 1 aviso" })).toBeInTheDocument();
      expect(within(nav).getByRole("button", { name: "Artigas, 1 aviso" })).toBeInTheDocument();
      expect(within(nav).getByRole("button", { name: "Bella Unión, sin avisos" })).toBeInTheDocument();
      expect(within(nav).getByRole("button", { name: "Todas las ciudades" })).toHaveAttribute("aria-current", "true");
    });

    it("«Todo el departamento» junta sus ciudades y cada nombre lleva la suya", async () => {
      render(<StockVista datos={simulados()} />);
      await elegir("Todo el departamento");

      expect(screen.getByRole("heading", { level: 2, name: "Departamento Artigas" })).toBeInTheDocument();
      expect(screen.getByText("15 colportores · 11 productos")).toBeInTheDocument();
      await userEvent.click(fila("Revistas · todas"));
      const detalle = screen.getByRole("table", { name: "Quién tiene Revistas · todas en Departamento Artigas" });
      expect(within(detalle).getAllByRole("rowheader")[0]).toHaveTextContent(/ · (Artigas|Bella Unión)$/);
    });

    it("se contrae a un riel con las abreviaturas y se vuelve a abrir, devolviendo el foco al botón", async () => {
      render(<StockVista datos={simulados()} />);
      await userEvent.click(screen.getByRole("button", { name: "Contraer ciudades" }));

      const riel = lista();
      expect(screen.getByRole("button", { name: "Expandir ciudades" })).toHaveFocus();
      expect(within(riel).getAllByRole("button").map((b) => b.textContent)).toEqual(["»", "Todas", "Dpto.", "Art.", "B. Un.", "Riv."]);

      await userEvent.click(within(riel).getByRole("button", { name: "Rivera" }));
      expect(screen.getByRole("heading", { level: 2, name: "Rivera" })).toBeInTheDocument();
      expect(within(riel).getByRole("button", { name: "Rivera" })).toHaveAttribute("aria-current", "true");

      await userEvent.click(screen.getByRole("button", { name: "Expandir ciudades" }));
      expect(screen.getByRole("button", { name: "Contraer ciudades" })).toHaveFocus();
      expect(within(lista()).getByRole("button", { name: /^Rivera/ })).toHaveAttribute("aria-current", "true");
    });

    it("volver a la vista desde otra pestaña la muestra de cero: todas las ciudades y todo cerrado", async () => {
      const primera = render(<StockVista datos={simulados()} />);
      await elegir(/^Rivera/);
      await userEvent.click(fila("La Gran Esperanza"));
      primera.unmount();

      render(<StockVista datos={simulados()} />);
      expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
      expect(fila("La Gran Esperanza")).toHaveAttribute("aria-expanded", "false");
    });
  });

  describe("estados vacíos y casos límite", () => {
    it("una ciudad sin colportores lo dice en vez de mostrar todo agotado", async () => {
      const datos = chico({ ciudades: [{ id: "riv", nombre: "Rivera", departamento: "Rivera" }, { id: "art", nombre: "Artigas", departamento: "Artigas" }] });
      render(<StockVista datos={datos} />);

      expect(within(lista()).getByRole("button", { name: "Artigas, sin colportores" })).toBeInTheDocument();
      await elegir(/^Artigas/);
      expect(screen.getByRole("status")).toHaveTextContent("Todavía no hay colportores en Artigas. Cuando asignes alguno a una de sus zonas, aparece acá su stock.");
      expect(screen.queryByRole("table", { name: /^Stock por producto/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("list", { name: "Resumen por tipo" })).not.toBeInTheDocument();
    });

    it("una campaña sin colportores lo dice", () => {
      render(<StockVista datos={chico({ colportores: [] })} />);

      expect(screen.getByRole("status")).toHaveTextContent("Todavía no hay colportores en esta campaña. Cuando haya, vas a ver acá su stock.");
    });

    it("una campaña sin productos en el catálogo lo dice", () => {
      render(<StockVista datos={chico({ productos: [] })} />);

      expect(screen.getByRole("status")).toHaveTextContent("La campaña todavía no tiene productos en el catálogo. Cuando los tenga, vas a ver acá su stock.");
    });

    it("sin ciudades pero con colportores sin zona, los muestra en «Sin ciudad»", async () => {
      render(<StockVista datos={chico({ ciudades: [], colportores: [col("ana", null, ex("l1", 3)), col("beto", "no-existe", ex("l1", 1))] })} />);

      expect(screen.getByText("2 colportores · 1 producto · 2 sin ciudad")).toBeInTheDocument();
      await elegir(/^Sin ciudad/);
      expect(screen.getByRole("heading", { level: 2, name: "Sin ciudad" })).toBeInTheDocument();
      expect(screen.getByText("2 colportores · 1 producto · no tienen zona asignada")).toBeInTheDocument();
      // No son una ciudad: no hay aviso de «agotado en la ciudad».
      expect(screen.queryByRole("list", { name: "Avisos de stock" })).not.toBeInTheDocument();
    });

    it("si la ciudad que se miraba desaparece de los datos, vuelve a todas las ciudades", async () => {
      const datos = chico({ ciudades: [{ id: "riv", nombre: "Rivera", departamento: "Rivera" }, { id: "art", nombre: "Artigas", departamento: "Artigas" }], colportores: [col("ana", "riv", ex("l1", 3)), col("bea", "art", ex("l1", 3))] });
      const { rerender } = render(<StockVista datos={datos} />);
      await elegir(/^Artigas/);
      expect(screen.getByRole("heading", { level: 2, name: "Artigas" })).toBeInTheDocument();

      rerender(<StockVista datos={chico()} />);

      expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
    });

    it("un nombre de producto larguísimo y sin espacios no desarma la fila", async () => {
      const largo = "X".repeat(300);
      const datos = chico({ productos: [{ id: "l1", nombre: largo, tipo: "LIBRO", nota: largo }] });
      render(<StockVista datos={datos} />);

      const boton = within(tabla()).getByRole("button", { name: new RegExp(largo) });
      expect(boton.querySelector(".wrap-anywhere")).not.toBeNull();
    });

    it("cifras grandes llevan punto de miles y un colportor en cero se ve en gris, no como aviso", () => {
      const datos = chico({ colportores: [col("ana", "riv", ex("l1", 1234567)), col("beto", "riv", ex("l1", 0))] });
      render(<StockVista datos={datos} />);

      const f = within(tabla()).getByRole("row", { name: /Libro uno/ });
      expect(f).toHaveTextContent("1.234.567");
      expect(f).toHaveTextContent("1 de 2");
      expect(screen.queryByRole("list", { name: "Avisos de stock" })).not.toBeInTheDocument();
    });

    it("con 400 colportores y 60 productos la vista responde", async () => {
      const productos = Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, nombre: `Producto ${i}`, tipo: "LIBRO" as const, nota: null }));
      const colportores = Array.from({ length: 400 }, (_, i) => col(`c${i}`, "riv", ...productos.map((p) => ex(p.id, (i % 5) + 1, i % 3))));
      render(<StockVista datos={chico({ productos, colportores })} />);

      expect(screen.getByText("400 colportores · 60 productos")).toBeInTheDocument();
      await userEvent.click(fila("Producto 7"));
      expect(screen.getByRole("table", { name: /Quién tiene Producto 7/ })).toBeInTheDocument();
    });
  });
});
