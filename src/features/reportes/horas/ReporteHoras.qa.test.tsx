import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it } from "vitest";

import type { DatosHoras } from "@/datos/reportes/contrato";

import { colportor, datosDePrueba, horasConstantes } from "./datos-de-prueba";
import { ReporteHoras } from "./ReporteHoras";

/**
 * QA de la vista 32 (#60, PR #71): estados que el implementador no recorrió (inscripto sin ninguna jornada, grupo «Sin
 * zona asignada» en la lista contraída y con departamentos sin nombre, ceros contra «sin datos») y la accesibilidad del
 * scroll de la tabla, que axe mide en el navegador y jsdom no.
 */

const lista = () => screen.getByRole("navigation", { name: "Ciudades" });
const tabla = () => screen.getByRole("table");
const textoDeFilas = () =>
  within(tabla())
    .getAllByRole("row")
    .slice(1)
    .map((f) => (f.textContent ?? "").replace(/\s+/g, " ").trim());

async function axeSinViolaciones(contenedor: HTMLElement) {
  // jsdom no calcula colores ni scroll: las reglas de contraste y de región con scroll se miden en el navegador.
  const resultado = await axe.run(contenedor, {
    rules: { "color-contrast": { enabled: false }, "scrollable-region-focusable": { enabled: false } },
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] },
  });
  return resultado.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 80)}`);
}

/** Un inscripto en Rivera que todavía no cerró ninguna jornada (la lista lo trae de zonas_por_colportor). */
function conInscriptoSinHoras(): DatosHoras {
  const datos = datosDePrueba();
  const [rivera, ...resto] = datos.ciudades;
  return {
    ...datos,
    ciudades: [{ ...rivera, colportores: [...rivera.colportores, colportor("rocio", "Rocío Paz", {})] }, ...resto],
  };
}

function conSinZona(extra: Partial<DatosHoras["ciudades"][number]>[] = []): DatosHoras {
  const datos = datosDePrueba();
  return {
    ...datos,
    ciudades: [
      ...datos.ciudades,
      ...extra.map((e, i) => ({ id: `x${i}`, nombre: `Ciudad ${i}`, departamento: null, colportores: [], ...e })),
      {
        id: "sin-zona",
        nombre: "Sin zona asignada",
        departamento: null,
        colportores: [
          colportor("diego", "Diego Machado", horasConstantes("2026-10-05", "2026-10-21", 2)),
          colportor("tomas", "Tomás Zapata", {}),
        ],
      },
    ],
  };
}

describe("QA #60 · colportor inscripto sin ninguna jornada cerrada", () => {
  it("figura en su ciudad con guion y suma al conteo; su ficha no inventa cifras ni tendencias", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={conInscriptoSinHoras()} />);

    // «Rivera» pasa de 2 a 3 colportores y «Todas» de 4 a 5, como en Equipo e Inicio.
    expect(within(lista()).getByRole("button", { name: /^Rivera/ })).toHaveTextContent("3 colportores");
    expect(screen.getByText("5 colportores · S2 contra S1")).toBeInTheDocument();
    const fila = textoDeFilas().find((t) => t.includes("Rocío Paz"));
    expect(fila).toBeDefined();
    expect(fila).toContain("—");
    expect(fila).not.toMatch(/[▲▼]/);
    // el total no se contamina: Rocío no resta ni suma
    expect(within(screen.getByRole("region", { name: "HORAS" })).getByText("122")).toBeInTheDocument();

    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await user.click(within(lista()).getByRole("button", { name: /Rocío Paz/ }));

    expect(screen.getByRole("heading", { level: 2, name: "Rocío Paz" })).toBeInTheDocument();
    const horas = screen.getByRole("region", { name: "HORAS" });
    expect(within(horas).getByText("—")).toBeInTheDocument();
    expect(horas).toHaveTextContent("S2: sin datos");
    expect(horas).toHaveTextContent("Campaña: —");
    // cada fila dice sin datos, ninguna lleva flecha, y la gráfica lo dice con palabras
    const filas = textoDeFilas();
    expect(filas.length).toBeGreaterThan(0);
    for (const f of filas.slice(0, 2)) expect(f).toContain("sin datos");
    expect(filas.some((f) => /[▲▼]/.test(f))).toBe(false);
    expect(screen.getByRole("img", { name: /S1: sin datos; S2: sin datos/ })).toBeInTheDocument();
  });

  it("sin violaciones de axe A/AA en la ficha de quien no tiene datos", async () => {
    const user = userEvent.setup();
    const { container } = render(<ReporteHoras datos={conInscriptoSinHoras()} />);
    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await user.click(within(lista()).getByRole("button", { name: /Rocío Paz/ }));
    expect(await axeSinViolaciones(container)).toEqual([]);
  });
});

describe("QA #60 · grupo «Sin zona asignada»", () => {
  it("con ciudades sin departamento (campaña terminada), «Sin zona asignada» sigue siendo lo último y no hay «Todo el departamento»", () => {
    render(
      <ReporteHoras
        datos={conSinZona([
          { nombre: "Zeta", colportores: [colportor("z", "Zoe Zeta", horasConstantes("2026-10-05", "2026-10-21", 1))] },
        ])}
      />,
    );
    const botones = within(lista())
      .getAllByRole("button")
      .map((b) => (b.textContent ?? "").trim());
    expect(botones[botones.length - 1]).toMatch(/^Sin zona asignada/);
    expect(botones[botones.length - 2]).toMatch(/^Zeta/);
    // los dos grupos sin departamento no tienen título «DEPTO. …» ni agrupador
    expect(within(lista()).queryByRole("heading", { name: /DEPTO\. SIN/i })).toBeNull();
    expect(within(lista()).getAllByRole("button", { name: /Todo el departamento/ })).toHaveLength(1); // solo el de Artigas
  });

  it("la lista contraída también lo ofrece, con el nombre completo para el lector de pantalla, y se puede elegir", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={conSinZona()} />);
    await user.click(screen.getByRole("button", { name: "Contraer ciudades" }));

    const riel = screen.getByRole("navigation", { name: "Ciudades" });
    const botones = within(riel).getAllByRole("button");
    const ultimo = botones[botones.length - 1];
    expect(ultimo).toHaveAccessibleName("Sin zona asignada");
    expect(ultimo).toHaveAttribute("title", "Sin zona asignada");

    await user.click(ultimo);
    expect(screen.getByRole("heading", { level: 2, name: "Sin zona asignada" })).toBeInTheDocument();
    expect(ultimo).toHaveAttribute("aria-current", "true");
    // el inscripto sin horas del grupo figura con guion
    expect(textoDeFilas().find((t) => t.includes("Tomás Zapata"))).toContain("—");
  });

  it("al volver desde un colportor sin zona, el foco queda en el grupo (no en el <body>)", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={conSinZona()} />);
    await user.click(within(lista()).getByRole("button", { name: /^Sin zona asignada/ }));
    await user.click(within(lista()).getByRole("button", { name: /Diego Machado/ }));

    await user.click(screen.getByRole("button", { name: /^‹ Sin zona asignada/ }));

    expect(screen.getByRole("heading", { level: 2, name: "Sin zona asignada" })).toBeInTheDocument();
    expect(document.activeElement).toBe(within(lista()).getByRole("button", { name: /^Sin zona asignada/ }));
  });
});

describe("QA #60 · 0 horas no es «sin datos»", () => {
  it("una jornada cerrada en 0 horas se ve como 0,0 y baja 100 %, no como guion", async () => {
    const user = userEvent.setup();
    const datos = datosDePrueba();
    // Ana trabajó 6 h en S1 y cerró jornadas de 0 h en S2.
    datos.ciudades[0].colportores[0] = colportor("ana", "Ana Silva", {
      ...horasConstantes("2026-10-05", "2026-10-10", 6),
      ...horasConstantes("2026-10-12", "2026-10-17", 0),
    });
    render(<ReporteHoras datos={datos} />);
    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await user.click(within(lista()).getByRole("button", { name: /Ana Silva/ }));

    const s2 = textoDeFilas().find((t) => t.startsWith("S2"));
    expect(s2).toContain("0,0");
    expect(s2).toContain("▼ 100%");
    expect(s2).not.toContain("sin datos");
  });
});

describe("QA #60 · datos límite en la lista y la tabla", () => {
  it("un nombre larguísimo sin espacios, con emoji, se puede leer entero (title) y no rompe la ficha", async () => {
    const user = userEvent.setup();
    const largo = `Ñandú🙂${"X".repeat(150)}`;
    const datos = datosDePrueba();
    datos.ciudades[0].colportores.push(colportor("largo", largo, horasConstantes("2026-10-05", "2026-10-21", 3)));
    render(<ReporteHoras datos={datos} />);

    expect(within(tabla()).getByTitle(largo)).toBeInTheDocument();
    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await user.click(within(lista()).getByTitle(largo));

    expect(screen.getByRole("heading", { level: 2, name: largo })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: `Horas de ${largo} por semana` })).toBeInTheDocument();
  });

  it("un solo colportor en todo el reporte: la ciudad no repite su encabezado y el total es el suyo", () => {
    const datos: DatosHoras = {
      ...datosDePrueba(),
      ciudades: [
        {
          id: "rivera",
          nombre: "Rivera",
          departamento: "Rivera",
          colportores: [colportor("ana", "Ana Silva", horasConstantes("2026-10-05", "2026-10-21", 6))],
        },
      ],
    };
    render(<ReporteHoras datos={datos} />);
    expect(screen.getByText("Departamento Rivera · 1 colportor · S2 contra S1")).toBeInTheDocument();
    expect(within(tabla()).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Ana Silva"]);
  });
});

describe("QA #60 · accesibilidad", () => {
  it("sin violaciones de axe A/AA con colportores sin zona, sin horas y con la lista contraída", async () => {
    const user = userEvent.setup();
    const { container } = render(<ReporteHoras datos={conSinZona()} />);
    expect(await axeSinViolaciones(container)).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Contraer ciudades" }));
    expect(await axeSinViolaciones(container)).toEqual([]);
  });

  it("el título de la tabla de colportores y de la ficha son distintos (el lector de pantalla sabe en cuál está)", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePrueba()} />);
    expect(screen.getByRole("table", { name: "Horas por colportor, semana" })).toBeInTheDocument();
    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await user.click(within(lista()).getByRole("button", { name: /Ana Silva/ }));
    expect(screen.getByRole("table", { name: "Horas de Ana Silva por semana" })).toBeInTheDocument();
  });

  // Hallazgo: axe en el navegador marca `scrollable-region-focusable` (serious, WCAG 2.1.1, A): el contenedor que hace
  // scroll de la tabla (div.overflow-auto) no tiene contenido enfocable (las filas son texto), así que sin un tabindex un
  // navegador que no vuelve enfocables los scrollers (Safari) deja el resto de la tabla fuera del alcance del teclado.
  // Se ve con 25 colportores a 1280x800 (captura QA «R01-todas»).
  it.skip("QA #60 · la tabla con scroll se alcanza con el teclado (el contenedor con scroll es enfocable y tiene nombre)", () => {
    const datos = datosDePrueba();
    datos.ciudades[0].colportores = Array.from({ length: 60 }, (_, i) =>
      colportor(`c${i}`, `Colportor ${i}`, horasConstantes("2026-10-05", "2026-10-21", 4)),
    );
    render(<ReporteHoras datos={datos} />);

    const contenedor = tabla().parentElement as HTMLElement;
    expect(contenedor.className).toContain("overflow-auto");
    const enfocableLosMismo = contenedor.querySelector("a[href], button, input, select, textarea, [tabindex='0']");
    expect(enfocableLosMismo ?? contenedor.getAttribute("tabindex")).not.toBeNull();
    expect(contenedor).toHaveAttribute("tabindex", "0");
    expect(contenedor).toHaveAccessibleName();
  });
});
