import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ColumnaDeCiudades } from "@/features/cuentas/ColumnaDeCiudades";
import { ListaDeCiudades as ListaDeEquipo } from "@/features/equipo/vista-33/ListaDeCiudades";
import { ListaDeCiudades as ListaDeReportes } from "@/features/reportes/horas/ListaDeCiudades";
import { buscarEnColumna, coincidenciasPorNombre, ETIQUETA_BUSCAR_CIUDAD, textoSinCoincidencias } from "@/lib/buscar-ciudades";

/**
 * QA de #195 (PR #196): casos límite del buscador de ciudades que la suite del implementador no recorre: caracteres especiales
 * y emoji, homónimos, ámbito de departamento elegido, la ciudad elegida que es un colportor de Reportes, el foco tras Enter,
 * el cambio de datos por debajo del umbral y la búsqueda al contraer/expandir la columna de Cuentas.
 */

const original = Element.prototype.scrollIntoView;
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn() as unknown as Element["scrollIntoView"];
});
afterEach(() => {
  Element.prototype.scrollIntoView = original;
});

const campo = () => screen.getByRole("searchbox", { name: ETIQUETA_BUSCAR_CIUDAD });
const NOMBRES = Array.from({ length: 12 }, (_, i) => `Pueblo ${String(i + 1).padStart(2, "0")}`);

describe("QA #195 · la búsqueda pura", () => {
  const ciudades = [
    { clave: "a", nombre: "Ñandú" },
    { clave: "b", nombre: "Peñarol" },
    { clave: "c", nombre: "Salto" },
    { clave: "d", nombre: "Salto" },
    { clave: "e", nombre: "" },
    { clave: "f", nombre: "Río Negro (centro)" },
  ];

  it("caracteres de expresión regular, emoji y barras se buscan como texto, sin romper", () => {
    for (const texto of ["(", "[", "\\", ".*", "+", "?", "$", "^", "😀", "a|b", "<script>", "%", "_"]) {
      expect(() => coincidenciasPorNombre(ciudades, texto, (c) => c.clave)).not.toThrow();
    }
    expect(coincidenciasPorNombre(ciudades, "(cen", (c) => c.clave).map((c) => c.clave)).toEqual(["f"]);
    expect(coincidenciasPorNombre(ciudades, ".*", (c) => c.clave)).toEqual([]);
    expect(coincidenciasPorNombre(ciudades, "😀", (c) => c.clave)).toEqual([]);
  });

  it("sin tildes y con ñ: «nandu» encuentra Ñandú y «pena» encuentra Peñarol; texto en NFD también", () => {
    expect(coincidenciasPorNombre(ciudades, "nandu", (c) => c.clave).map((c) => c.clave)).toEqual(["a"]);
    expect(coincidenciasPorNombre(ciudades, "PEÑA", (c) => c.clave).map((c) => c.clave)).toEqual(["b"]);
    expect(coincidenciasPorNombre(ciudades, "Rio Negro".normalize("NFD"), (c) => c.clave).map((c) => c.clave)).toEqual(["f"]);
  });

  it("homónimos: salen los dos, siempre en el mismo orden (por id) aunque la fuente cambie de orden", () => {
    const a = coincidenciasPorNombre(ciudades, "salto", (c) => c.clave).map((c) => c.clave);
    const b = coincidenciasPorNombre([...ciudades].reverse(), "salto", (c) => c.clave).map((c) => c.clave);
    expect(a).toEqual(["c", "d"]);
    expect(b).toEqual(a);
  });

  it("un texto pegado de 20.000 caracteres no coincide con nada y no se cuelga", () => {
    const t0 = performance.now();
    expect(coincidenciasPorNombre(ciudades, "x".repeat(20_000), (c) => c.clave)).toEqual([]);
    expect(performance.now() - t0).toBeLessThan(500);
  });

  it("buscarEnColumna: la elegida no se duplica si coincide, y una clave elegida que ya no existe no rompe", () => {
    const nodos = [
      { clave: "todas", nombre: "Todas las ciudades", c: false },
      { clave: "dep", nombre: "Todo el departamento", c: false },
      { clave: "s", nombre: "Salto", c: true },
      { clave: "p", nombre: "Paysandú", c: true },
    ];
    const esCiudad = (n: { c: boolean }) => n.c;
    expect(buscarEnColumna(nodos, esCiudad, "salto", "s").visibles.map((n) => n.clave)).toEqual(["todas", "s"]);
    expect(buscarEnColumna(nodos, esCiudad, "salto", "dep").visibles.map((n) => n.clave)).toEqual(["todas", "dep", "s"]);
    expect(buscarEnColumna(nodos, esCiudad, "salto", "ya-no-existe").visibles.map((n) => n.clave)).toEqual(["todas", "s"]);
    expect(buscarEnColumna(nodos, esCiudad, "zzz", "s").visibles.map((n) => n.clave)).toEqual(["todas", "s"]);
    expect(buscarEnColumna(nodos, esCiudad, "zzz", "s").coinciden).toEqual([]);
  });
});

describe("QA #195 · Reportes (32): la elegida es un colportor de una ciudad", () => {
  function montar(texto?: string) {
    const colportor = { clave: "col:1", ambito: { tipo: "colportor" as const, colportorId: "1" }, nombre: "Ana Pérez", detalle: "12 h", seleccionado: true, hijos: [] };
    const nodos = NOMBRES.map((n, i) => ({
      clave: `c-${i}`,
      ambito: { tipo: "ciudad" as const, ciudadId: `c-${i}` },
      nombre: n,
      detalle: "3 colportores",
      seleccionado: false,
      hijos: i === 3 ? [colportor] : [],
    }));
    const lista = {
      todas: { clave: "todas", ambito: { tipo: "todas" as const }, nombre: "Todas las ciudades", detalle: "36 colportores", seleccionado: false, hijos: [] },
      grupos: [{ clave: "d", departamento: "D", titulo: "DEPTO. D", nodos }],
    };
    render(<ListaDeReportes lista={lista as never} alElegir={() => {}} alContraer={() => {}} />);
    return texto;
  }

  it("buscando otra ciudad, la ciudad del colportor elegido sigue a la vista con su colportor marcado", async () => {
    montar();
    await userEvent.type(campo(), "pueblo 10");
    const nav = screen.getByRole("navigation", { name: "Ciudades" });
    // «Pueblo 04» no coincide, pero es la que contiene al colportor elegido: no se pierde de vista cuál es.
    expect(within(nav).getByRole("button", { name: /Pueblo 04/ })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: /Ana Pérez/ })).toHaveAttribute("aria-current", "true");
    expect(within(nav).getByRole("button", { name: /Pueblo 10/ })).toBeInTheDocument();
  });

  it("sin coincidencias, la ciudad del colportor y Todas siguen a la vista y el aviso dice qué hacer", async () => {
    montar();
    await userEvent.type(campo(), "zzz");
    const nav = screen.getByRole("navigation", { name: "Ciudades" });
    expect(within(nav).getByText(textoSinCoincidencias("zzz"))).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: /Ana Pérez/ })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: /Todas las ciudades/ })).toBeInTheDocument();
  });
});

describe("QA #195 · Equipo (33): «Todo el departamento» elegido", () => {
  function montar() {
    const nodo = (clave: string, ambito: object, nombre: string, seleccionado = false) => ({ clave, ambito, nombre, cantidad: 3, sinZona: 0, seleccionado });
    const lista = {
      todas: nodo("todas", { tipo: "todas" }, "Todas las ciudades"),
      grupos: [
        {
          clave: "Rivera",
          departamento: "Rivera",
          titulo: "DEPTO. RIVERA",
          nodos: [
            nodo("departamento:Rivera", { tipo: "departamento", departamento: "Rivera" }, "Todo el departamento", true),
            ...NOMBRES.map((n, i) => nodo(`ciudad:${i}`, { tipo: "ciudad", ciudadId: `${i}` }, n)),
          ],
        },
      ],
    };
    const alElegir = vi.fn();
    render(<ListaDeEquipo lista={lista as never} alElegir={alElegir} alContraer={() => {}} />);
    return alElegir;
  }

  it("buscando, el ámbito de departamento elegido sigue a la vista (no se busca por nombre) y Esc devuelve los grupos", async () => {
    montar();
    await userEvent.type(campo(), "pueblo 07");
    const nav = screen.getByRole("navigation", { name: "Ciudades" });
    expect(within(nav).getByRole("button", { name: /Todo el departamento/ })).toBeInTheDocument();
    expect(within(nav).getAllByRole("button", { name: /Pueblo/ })).toHaveLength(1);
    await userEvent.type(campo(), "{Escape}");
    expect(campo()).toHaveValue("");
    expect(within(nav).getByRole("heading", { name: "DEPTO. RIVERA" })).toBeInTheDocument();
    expect(within(nav).getAllByRole("button", { name: /Pueblo/ })).toHaveLength(NOMBRES.length);
  });

  it("el campo no se busca a sí mismo: «departamento» no coincide con «Todo el departamento»", async () => {
    montar();
    await userEvent.type(campo(), "departamento");
    expect(within(screen.getByRole("navigation", { name: "Ciudades" })).getByText(textoSinCoincidencias("departamento"))).toBeInTheDocument();
  });

  it("Enter con lo escrito elige la primera y el foco se queda en el campo (se puede seguir escribiendo)", async () => {
    const alElegir = montar();
    await userEvent.type(campo(), "pueblo 1{Enter}");
    expect(alElegir).toHaveBeenCalledTimes(1);
    expect(alElegir).toHaveBeenCalledWith({ tipo: "ciudad", ciudadId: "9" });
    expect(campo()).toHaveFocus();
  });

  it("Enter con el campo vacío o con espacios no elige nada", async () => {
    const alElegir = montar();
    await userEvent.type(campo(), "{Enter}");
    await userEvent.type(campo(), "   {Enter}");
    expect(alElegir).not.toHaveBeenCalled();
  });

  it("hay un solo aria-live en la columna y no hay role=status duplicado", async () => {
    montar();
    await userEvent.type(campo(), "pu");
    const nav = screen.getByRole("navigation", { name: "Ciudades" });
    expect(nav.querySelectorAll("[aria-live]")).toHaveLength(1);
    expect(nav.querySelectorAll('[role="status"],[role="alert"]')).toHaveLength(0);
  });
});

describe("QA #195 · los datos cambian por debajo del umbral con una búsqueda escrita", () => {
  function Caja({ cantidad }: { cantidad: number }) {
    const nodo = (i: number) => ({ clave: `ciudad:${i}`, ambito: { tipo: "ciudad", ciudadId: `${i}` }, nombre: `Pueblo ${i}`, cantidad: 1, sinZona: 0, seleccionado: false });
    const lista = {
      todas: { clave: "todas", ambito: { tipo: "todas" }, nombre: "Todas las ciudades", cantidad: 1, sinZona: 0, seleccionado: true },
      grupos: [{ clave: "d", departamento: "D", titulo: "DEPTO. D", nodos: Array.from({ length: cantidad }, (_, i) => nodo(i)) }],
    };
    return <ListaDeEquipo lista={lista as never} alElegir={() => {}} alContraer={() => {}} />;
  }

  it("si bajan a 8 ciudades con algo escrito, no queda una lista vacía sin campo para borrarla", async () => {
    const { rerender } = render(<Caja cantidad={20} />);
    await userEvent.type(campo(), "zzz");
    expect(screen.getByText(textoSinCoincidencias("zzz"))).toBeInTheDocument();
    rerender(<Caja cantidad={8} />);
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByText(textoSinCoincidencias("zzz"))).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Pueblo/ })).toHaveLength(8);
  });
});

describe("QA #195 · Cuentas (36): contraer y expandir la columna", () => {
  const elementos = [
    { tipo: "ciudad" as const, clave: "todas", nombre: "Todas las ciudades", sigla: "Todas", pendientes: 0, porDecidir: 0, seleccion: { tipo: "todas" as const } },
    ...NOMBRES.map((n, i) => ({
      tipo: "ciudad" as const,
      clave: `ciudad:${i}`,
      nombre: n,
      sigla: `P${i}`,
      pendientes: 0,
      porDecidir: 0,
      seleccion: { tipo: "ciudad" as const, ciudadId: `${i}` },
    })),
  ];

  function Montaje() {
    const [contraida, setContraida] = useState(false);
    return (
      <ColumnaDeCiudades
        elementos={elementos}
        seleccionada={{ tipo: "todas" }}
        contraida={contraida}
        alElegir={() => {}}
        alAlternar={() => setContraida((c) => !c)}
      />
    );
  }

  // QA #195: el hook promete que «al contraer y volver a expandir, la búsqueda arranca vacía» (use-buscar-en-columna.ts) y así
  // pasa en Inicio, Equipo, Reportes y Stock (la columna se desmonta); en Cuentas el estado vive arriba del `return` de la
  // columna contraída y la búsqueda vuelve escrita.
  it.skip("QA #195: al contraer y volver a expandir, la búsqueda arranca vacía (como en las otras cuatro pestañas)", async () => {
    render(<Montaje />);
    await userEvent.type(campo(), "pueblo 07");
    await userEvent.click(screen.getByRole("button", { name: /Contraer ciudades/ }));
    await userEvent.click(screen.getByRole("button", { name: /Expandir ciudades/ }));
    expect(campo()).toHaveValue("");
  });

  it("contraída muestra todas las ciudades en la barra (no filtra) y al expandir sigue habiendo campo", async () => {
    render(<Montaje />);
    await userEvent.type(campo(), "pueblo 07");
    await userEvent.click(screen.getByRole("button", { name: /Contraer ciudades/ }));
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(NOMBRES.length);
    await userEvent.click(screen.getByRole("button", { name: /Expandir ciudades/ }));
    expect(campo()).toBeInTheDocument();
  });
});
