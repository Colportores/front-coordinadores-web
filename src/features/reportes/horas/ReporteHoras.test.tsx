import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it } from "vitest";

import type { DatosHoras } from "@/datos/reportes/contrato";
import { crearHorasSimuladas } from "@/datos/reportes/simulado";

import { colportor, datosDePrueba, horasConstantes } from "./datos-de-prueba";
import { ReporteHoras } from "./ReporteHoras";

const tabla = () => screen.getByRole("table");
const filasDeLaTabla = () => within(tabla()).getAllByRole("row").slice(1);
const textoDeFilas = () => filasDeLaTabla().map((f) => f.textContent ?? "");

function lista() {
  return screen.getByRole("navigation", { name: "Ciudades" });
}

describe("ReporteHoras · vista inicial", () => {
  it("arranca en todas las ciudades, por semanas, con la cifra de horas y la tabla por colportor", () => {
    render(<ReporteHoras datos={datosDePrueba()} />);

    expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
    expect(screen.getByText("4 colportores · S2 contra S1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Semanas", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Días", pressed: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Meses", pressed: false })).toBeInTheDocument();

    const horas = screen.getByRole("region", { name: "HORAS" });
    expect(within(horas).getByText("122")).toBeInTheDocument();
    expect(within(horas).getByText("▼ 12%")).toBeInTheDocument();
    expect(within(horas).getByText("S2 · contra S1")).toBeInTheDocument();
    expect(within(horas).getByText("Campaña: 302")).toBeInTheDocument();

    expect(screen.getByRole("columnheader", { name: "COLPORTOR · S2" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "HORAS" })).toBeInTheDocument();
  });

  it("la lista agrupa por departamento y dice cuántos colportores tiene cada ciudad", () => {
    render(<ReporteHoras datos={datosDePrueba()} />);
    const l = within(lista());

    expect(l.getByRole("heading", { name: "DEPTO. RIVERA" })).toBeInTheDocument();
    expect(l.getByRole("heading", { name: "DEPTO. ARTIGAS" })).toBeInTheDocument();
    expect(l.getByRole("button", { name: /Todas las ciudades/ })).toHaveAttribute("aria-current", "true");
    expect(l.getByRole("button", { name: /Todo el departamento/ })).toHaveTextContent("2 colportores");
    expect(l.getByRole("button", { name: /^Rivera/ })).toHaveTextContent("2 colportores");
    expect(l.getByRole("button", { name: /^Artigas/ })).toHaveTextContent("1 colportor");
  });

  it("las acciones de exportar no están disponibles todavía (HU-REP-005)", () => {
    render(<ReporteHoras datos={datosDePrueba()} />);
    for (const nombre of ["Informe PDF", "Datos CSV"]) {
      expect(screen.getByRole("button", { name: nombre })).toHaveAttribute("aria-disabled", "true");
    }
  });

  it("el gráfico y las tendencias tienen texto para el lector de pantalla", () => {
    render(<ReporteHoras datos={datosDePrueba()} />);
    expect(screen.getByRole("img", { name: "Horas por semana: S1: 138; S2: 122; S3: 42 (en curso)." })).toBeInTheDocument();
    // la flecha es decorativa; la frase se lee
    expect(screen.getAllByText("bajó 12 %")).toHaveLength(1);
  });
});

describe("ReporteHoras · elegir ciudad, departamento y colportor", () => {
  it("elegir una ciudad la abre a sus colportores y deja solo sus filas", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePrueba()} />);

    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));

    expect(screen.getByRole("heading", { level: 2, name: "Rivera" })).toBeInTheDocument();
    expect(screen.getByText("Departamento Rivera · 2 colportores · S2 contra S1")).toBeInTheDocument();
    expect(within(lista()).getByRole("button", { name: /^Rivera/ })).toHaveAttribute("aria-current", "true");
    expect(within(lista()).getByRole("button", { name: /Beto Techera/ })).toHaveTextContent("sin datos desde el 15/10");
    expect(within(tabla()).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Ana Silva", "Beto Techera"]);
    expect(textoDeFilas()[1]).toContain("32,0");
    expect(textoDeFilas()[1]).toContain("▼ 33%");
  });

  it("«Todo el departamento» suma Artigas y Bella Unión, cada una con su encabezado", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePrueba()} />);

    await user.click(within(lista()).getByRole("button", { name: /Todo el departamento/ }));

    expect(screen.getByRole("heading", { level: 2, name: "Departamento Artigas" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "HORAS" })).getByText("54")).toBeInTheDocument();
    expect(within(tabla()).getByRole("rowheader", { name: /Artigas/ })).toBeInTheDocument();
    expect(within(tabla()).getByRole("rowheader", { name: /Bella Unión/ })).toBeInTheDocument();
  });

  it("elegir un colportor muestra su ficha por período, con el regreso a su ciudad", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePrueba()} />);

    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await user.click(within(lista()).getByRole("button", { name: /Ana Silva/ }));

    expect(screen.getByRole("heading", { level: 2, name: "Ana Silva" })).toBeInTheDocument();
    expect(screen.getByText("Rivera · Departamento Rivera · S2 contra S1")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "SEMANA" })).toBeInTheDocument();
    expect(textoDeFilas()).toHaveLength(3);
    expect(within(tabla()).getByRole("rowheader", { name: /S3 · 19\/10.*en curso/ })).toBeInTheDocument();
    // su ciudad sigue abierta en la lista y ella es la elegida
    expect(within(lista()).getByRole("button", { name: /Ana Silva/ })).toHaveAttribute("aria-current", "true");
  });

  it("«‹ Rivera» vuelve a la ciudad y el foco queda en ella, no se pierde", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePrueba()} />);
    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await user.click(within(lista()).getByRole("button", { name: /Ana Silva/ }));

    await user.click(screen.getByRole("button", { name: "‹ Rivera" }));

    expect(screen.getByRole("heading", { level: 2, name: "Rivera" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "‹ Rivera" })).not.toBeInTheDocument();
    expect(within(lista()).getByRole("button", { name: /^Rivera/ })).toHaveFocus();
  });

  it("un colportor sin datos se ve con guion, sin tendencia y con el aviso de desde cuándo", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePrueba()} />);
    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await user.click(screen.getByRole("button", { name: "Días" }));

    const beto = screen.getByRole("rowheader", { name: /Beto Techera/ }).closest("tr")!;
    expect(beto).toHaveTextContent("—");
    expect(beto).toHaveTextContent("sin datos desde el 15/10");
    expect(within(beto).queryByText(/[▲▼]/)).not.toBeInTheDocument();
    expect(beto).toHaveTextContent("sin datos");
  });
});

describe("ReporteHoras · días, semanas y meses", () => {
  it("cada período cambia el gráfico, la comparación y el encabezado", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePrueba()} />);

    await user.click(screen.getByRole("button", { name: "Días" }));
    expect(screen.getByText("4 colportores · ayer contra el día anterior")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "COLPORTOR · AYER" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Días", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^Horas por día: .*mar 20\/10: 15; mié 21\/10: 12 \(en curso\)\.$/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Meses" }));
    expect(screen.getByText("4 colportores · oct. a la fecha")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "COLPORTOR · OCT. A LA FECHA" })).toBeInTheDocument();
    // no hay mes anterior en esta campaña: la cifra va sin tendencia
    expect(within(screen.getByRole("region", { name: "HORAS" })).queryByText(/[▲▼]/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Semanas" }));
    expect(screen.getByText("4 colportores · S2 contra S1")).toBeInTheDocument();
  });

  it("el ámbito elegido se mantiene al cambiar de período", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePrueba()} />);
    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await user.click(screen.getByRole("button", { name: "Meses" }));
    expect(screen.getByRole("heading", { level: 2, name: "Rivera" })).toBeInTheDocument();
    expect(within(lista()).getByRole("button", { name: /^Rivera/ })).toHaveAttribute("aria-current", "true");
  });

  it("doble toque en el mismo período no cambia nada ni rompe", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePrueba()} />);
    const meses = screen.getByRole("button", { name: "Meses" });
    await user.dblClick(meses);
    expect(screen.getByRole("button", { name: "Meses", pressed: true })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
    const ciudad = within(lista()).getByRole("button", { name: /^Artigas/ });
    await user.dblClick(ciudad);
    expect(screen.getByRole("heading", { level: 2, name: "Artigas" })).toBeInTheDocument();
  });

  it("dos elecciones seguidas (ciudad y colportor, período y ciudad) dejan la última, sin mezclar", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePrueba()} />);
    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await user.click(screen.getByRole("button", { name: "Días" }));
    await user.click(within(lista()).getByRole("button", { name: /^Artigas/ }));
    await user.click(screen.getByRole("button", { name: "Meses" }));
    expect(screen.getByRole("heading", { level: 2, name: "Artigas" })).toBeInTheDocument();
    expect(screen.getByText("Departamento Artigas · 1 colportor · oct. a la fecha")).toBeInTheDocument();
    expect(within(lista()).queryByRole("button", { name: /Ana Silva/ })).not.toBeInTheDocument();
    expect(within(lista()).getByRole("button", { name: /Carla Rey/ })).toBeInTheDocument();
  });
});

describe("ReporteHoras · la lista contraída", () => {
  it("se contrae a las abreviaturas, el foco pasa al botón de expandir y el ámbito se conserva", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePrueba()} />);
    await user.click(within(lista()).getByRole("button", { name: /^Artigas/ }));

    await user.click(screen.getByRole("button", { name: "Contraer ciudades" }));

    const riel = within(lista());
    expect(riel.getByRole("button", { name: "Expandir ciudades" })).toHaveFocus();
    expect(riel.getByRole("button", { name: "Todas las ciudades" })).toHaveTextContent("Todas");
    expect(riel.getByRole("button", { name: "Rivera" })).toHaveTextContent("Riv.");
    expect(riel.getByRole("button", { name: "Departamento Artigas" })).toHaveTextContent("Dpto.");
    expect(riel.getByRole("button", { name: "Bella Unión" })).toHaveTextContent("B. Un.");
    expect(riel.getByRole("button", { name: "Artigas" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("heading", { level: 2, name: "Artigas" })).toBeInTheDocument();
  });

  it("desde la lista contraída también se elige y se vuelve a expandir con el foco en su botón", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePrueba()} />);
    await user.click(screen.getByRole("button", { name: "Contraer ciudades" }));

    await user.click(within(lista()).getByRole("button", { name: "Bella Unión" }));
    expect(screen.getByRole("heading", { level: 2, name: "Bella Unión" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expandir ciudades" }));
    expect(screen.getByRole("button", { name: "Contraer ciudades" })).toHaveFocus();
    expect(within(lista()).getByRole("button", { name: /Darío Viera/ })).toBeInTheDocument();
  });

  it("con la lista contraída, «‹ Rivera» deja el foco en la ciudad del riel", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePrueba()} />);
    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await user.click(within(lista()).getByRole("button", { name: /Ana Silva/ }));
    await user.click(screen.getByRole("button", { name: "Contraer ciudades" }));

    await user.click(screen.getByRole("button", { name: "‹ Rivera" }));
    expect(within(lista()).getByRole("button", { name: "Rivera" })).toHaveFocus();
  });
});

describe("ReporteHoras · datos límite", () => {
  it("sin ciudades ni colportores avisa que no hay nada que mostrar", () => {
    const vacio: DatosHoras = { ...datosDePrueba(), ciudades: [] };
    render(<ReporteHoras datos={vacio} />);
    expect(screen.getByText("0 colportores · S2 contra S1")).toBeInTheDocument();
    expect(screen.getByText("Todavía no hay colportores para mostrar acá.")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "HORAS" })).getByText("—")).toBeInTheDocument();
  });

  it("una ciudad sin colportores", async () => {
    const user = userEvent.setup();
    const datos = datosDePrueba();
    datos.ciudades.push({ id: "tranqueras", nombre: "Tranqueras", departamento: "Rivera", colportores: [] });
    render(<ReporteHoras datos={datos} />);
    await user.click(within(lista()).getByRole("button", { name: /Tranqueras/ }));
    expect(screen.getByText("Todavía no hay colportores para mostrar acá.")).toBeInTheDocument();
  });

  it("nombres largos se recortan en la lista y en la tabla pero se pueden leer enteros", async () => {
    const user = userEvent.setup();
    const largo = "María de los Ángeles Fernández de la Concepción y Rodríguez-Techera de Olivera";
    const datos = datosDePrueba();
    datos.ciudades[0].colportores.push(colportor("larga", largo, horasConstantes("2026-10-05", "2026-10-21", 6)));
    datos.ciudades[0].nombre = "San Antonio de las Cañas del Departamento de Rivera Norte";
    render(<ReporteHoras datos={datos} />);

    await user.click(within(lista()).getByRole("button", { name: /San Antonio/ }));
    const enLista = within(lista()).getByRole("button", { name: new RegExp(largo.slice(0, 20)) });
    expect(enLista.firstElementChild).toHaveClass("truncate");
    expect(screen.getByRole("heading", { level: 2, name: /San Antonio/ }).className).toContain("wrap-anywhere");
    expect(within(tabla()).getByTitle(largo)).toHaveClass("truncate");
  });

  it("una lista larga (300 colportores) se dibuja entera, con su propio scroll", async () => {
    const user = userEvent.setup();
    const datos = datosDePrueba();
    for (let i = 0; i < 300; i++) {
      datos.ciudades[1].colportores.push(colportor(`c-${i}`, `Colportor ${i}`, horasConstantes("2026-10-05", "2026-10-21", 5)));
    }
    render(<ReporteHoras datos={datos} />);
    expect(screen.getByText("304 colportores · S2 contra S1")).toBeInTheDocument();
    expect(filasDeLaTabla().length).toBeGreaterThanOrEqual(300);
    await user.click(within(lista()).getByRole("button", { name: /^Artigas/ }));
    expect(within(lista()).getAllByRole("button", { name: /^Colportor \d+/ })).toHaveLength(300);
  });

  it("si los datos cambian y la ciudad elegida ya no existe, vuelve a todas las ciudades", async () => {
    const user = userEvent.setup();
    const datos = datosDePrueba();
    const { rerender } = render(<ReporteHoras datos={datos} />);
    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    rerender(<ReporteHoras datos={{ ...datos, ciudades: datos.ciudades.slice(1) }} />);
    expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
    expect(within(lista()).getByRole("button", { name: /Todas las ciudades/ })).toHaveAttribute("aria-current", "true");
  });

  it("volver a la pestaña (se monta de nuevo) arranca otra vez en todas las ciudades, por semanas", async () => {
    const user = userEvent.setup();
    const datos = datosDePrueba();
    const primera = render(<ReporteHoras datos={datos} />);
    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await user.click(screen.getByRole("button", { name: "Meses" }));
    primera.unmount();

    render(<ReporteHoras datos={datos} />);
    expect(screen.getByRole("heading", { level: 2, name: "Todas las ciudades" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Semanas", pressed: true })).toBeInTheDocument();
  });

  it("una campaña que recién empieza no inventa una comparación", () => {
    render(<ReporteHoras datos={{ ...datosDePrueba(), inicioCampania: "2026-10-21" }} />);
    const horas = screen.getByRole("region", { name: "HORAS" });
    expect(within(horas).getByText("Todavía no hay un período completo")).toBeInTheDocument();
    expect(within(horas).queryByText(/[▲▼]/)).not.toBeInTheDocument();
  });
});

describe("ReporteHoras · con los datos de ejemplo del diseño", () => {
  const sim = crearHorasSimuladas();

  it("los cinco tableros del diseño se pueden alcanzar", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={sim} />);

    // 01 · todas las ciudades · semanas
    expect(screen.getByText("25 colportores · S7 contra S6")).toBeInTheDocument();
    // 02 · Rivera · semanas
    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    expect(screen.getByText("Departamento Rivera · 10 colportores · S7 contra S6")).toBeInTheDocument();
    // 03 · Rivera · días
    await user.click(screen.getByRole("button", { name: "Días" }));
    expect(screen.getByText("Departamento Rivera · 10 colportores · ayer contra el día anterior")).toBeInTheDocument();
    // 04 · Rivera · meses
    await user.click(screen.getByRole("button", { name: "Meses" }));
    expect(screen.getByText("Departamento Rivera · 10 colportores · oct. a la fecha contra sep. a la misma fecha")).toBeInTheDocument();
    // 05 · colportor elegido · Bruno Techera · semanas
    await user.click(screen.getByRole("button", { name: "Semanas" }));
    await user.click(within(lista()).getByRole("button", { name: /Bruno Techera/ }));
    expect(screen.getByText("Rivera · Departamento Rivera · S7 contra S6")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "‹ Rivera" })).toBeInTheDocument();
    expect(within(lista()).getByRole("button", { name: /Bruno Techera/ })).toHaveTextContent("sin datos desde el 17/10");
    expect(within(tabla()).getByRole("rowheader", { name: /S8 · 19\/10.*sin datos · últimos datos el 17\/10/ })).toBeInTheDocument();
  });

  it("«Todo el departamento» de Artigas junta Artigas y Bella Unión: 15 colportores", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={sim} />);
    await user.click(within(lista()).getByRole("button", { name: /Todo el departamento/ }));
    expect(screen.getByText("15 colportores · S7 contra S6")).toBeInTheDocument();
  });
});

describe("ReporteHoras · accesibilidad (axe A/AA, sin contraste: jsdom no mide)", () => {
  async function violaciones(raiz: Element) {
    const r = await axe.run(raiz, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, rules: { "color-contrast": { enabled: false } } });
    return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  }

  it("no tiene violaciones en el tablero, en la ficha de un colportor ni con la lista contraída", async () => {
    const user = userEvent.setup();
    const { container } = render(<ReporteHoras datos={datosDePrueba()} />);
    expect(await violaciones(container)).toEqual([]);

    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await user.click(within(lista()).getByRole("button", { name: /Beto Techera/ }));
    expect(await violaciones(container)).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Contraer ciudades" }));
    expect(await violaciones(container)).toEqual([]);
  });

  it("todo se maneja con el teclado: Tab recorre la lista y Enter elige, sin trampas", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePrueba()} />);
    await user.tab();
    expect(screen.getByRole("button", { name: "Contraer ciudades" })).toHaveFocus();
    await user.tab();
    expect(within(lista()).getByRole("button", { name: /Todas las ciudades/ })).toHaveFocus();
    await user.tab();
    expect(within(lista()).getByRole("button", { name: /^Rivera/ })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { level: 2, name: "Rivera" })).toBeInTheDocument();
    expect(within(lista()).getByRole("button", { name: /^Rivera/ })).toHaveFocus();
    await user.tab();
    expect(within(lista()).getByRole("button", { name: /Ana Silva/ })).toHaveFocus();
    await user.keyboard(" ");
    expect(screen.getByRole("heading", { level: 2, name: "Ana Silva" })).toBeInTheDocument();
    expect(within(lista()).getByRole("button", { name: /Ana Silva/ })).toHaveFocus();
  });
});
