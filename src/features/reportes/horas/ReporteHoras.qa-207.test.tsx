import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it } from "vitest";

import { datosDePrueba } from "./datos-de-prueba";
import { ReporteHoras } from "./ReporteHoras";

/**
 * QA del PR #211 (issue #207): en la vista 32 completa, en la lista por ciudades, en la de una ciudad y en el detalle de un
 * colportor, y en Días, Semanas, Meses y Rango, ningún encabezado usa corte dentro de la palabra y el lugar reservado
 * a la tendencia es lo único que cede. El reparto del ancho (#191), las flechas y el texto accesible siguen igual.
 * (El ancho real, en una sola línea a 1280 y a 1440 px, se midió en Chromium: jsdom no calcula el diseño.)
 */

const CORTES_EN_LA_PALABRA =
  /wrap-anywhere|break-all|break-words|overflow-wrap|\bmin-w-0\b|\btruncate\b|\bshrink/;

function encabezadosDeCifras() {
  return within(screen.getByRole("table"))
    .getAllByRole("columnheader")
    .slice(1);
}

function compruebaCabecera() {
  const encabezados = encabezadosDeCifras();
  expect(encabezados.length).toBeGreaterThanOrEqual(4);
  for (const e of encabezados) {
    const texto = e.querySelector(
      "span > span:not([aria-hidden])",
    ) as HTMLElement;
    const lugar = e.querySelector("span[aria-hidden]") as HTMLElement;
    expect(texto.className).not.toMatch(CORTES_EN_LA_PALABRA);
    expect(lugar).toHaveClass("w-[46px]", "min-w-0", "shrink-[100]");
    // El lugar es solo para alinear: no lo lee el lector de pantalla y el nombre accesible del encabezado es su texto.
    expect(lugar).toHaveTextContent("");
    expect(e.textContent).toBe(texto.textContent);
  }
}

function lista() {
  return screen.getByRole("navigation", { name: "Ciudades" });
}

describe("ReporteHoras · la cabecera de la tabla sin corte dentro de la palabra (#207)", () => {
  it.each(["Días", "Semanas", "Meses", "Rango"])(
    "en la lista por ciudades, agrupada por %s",
    async (granularidad) => {
      const user = userEvent.setup();
      render(<ReporteHoras datos={datosDePrueba()} />);

      await user.click(screen.getByRole("button", { name: granularidad }));

      expect(
        screen.getByRole("heading", { level: 2, name: "Todas las ciudades" }),
      ).toBeInTheDocument();
      compruebaCabecera();
      expect(
        screen.getByRole("columnheader", { name: "PRESENTACIONES" }),
      ).toBeInTheDocument();
    },
  );

  it.each(["Días", "Semanas", "Meses", "Rango"])(
    "en el detalle de un colportor, agrupado por %s",
    async (granularidad) => {
      const user = userEvent.setup();
      render(<ReporteHoras datos={datosDePrueba()} />);

      await user.click(
        within(lista()).getByRole("button", { name: /^Rivera/ }),
      );
      await user.click(
        within(lista()).getByRole("button", { name: /Ana Silva/ }),
      );
      await user.click(screen.getByRole("button", { name: granularidad }));

      expect(
        screen.getByRole("heading", { level: 2, name: "Ana Silva" }),
      ).toBeInTheDocument();
      compruebaCabecera();
      expect(
        screen.getByRole("columnheader", { name: "PRESENTACIONES" }),
      ).toBeInTheDocument();
    },
  );

  it("los encabezados de varias palabras del detalle («DÍAS TRABAJADOS», «PROMEDIO POR DÍA», «CON ACOMPAÑAMIENTO») siguen enteros en el texto", async () => {
    const user = userEvent.setup();
    render(<ReporteHoras datos={datosDePrueba()} />);

    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await user.click(
      within(lista()).getByRole("button", { name: /Ana Silva/ }),
    );
    await user.click(screen.getByRole("button", { name: "Rango" }));

    const textos = encabezadosDeCifras().map((e) => e.textContent);
    expect(textos).toEqual(
      expect.arrayContaining([
        "DÍAS TRABAJADOS",
        "PROMEDIO POR DÍA",
        "CON ACOMPAÑAMIENTO",
      ]),
    );
  });

  it("las celdas de datos conservan el lugar de la tendencia de 46 px (el reparto del ancho no cambió) y sus flechas con el texto accesible", () => {
    render(<ReporteHoras datos={datosDePrueba()} />);

    const filas = within(screen.getByRole("table"))
      .getAllByRole("row")
      .slice(1);
    const celdas = filas.flatMap((f) => within(f).queryAllByRole("cell"));
    expect(celdas.length).toBeGreaterThan(0);
    for (const c of celdas) {
      const lugar = c.querySelector(
        'span[class*="min-w-[46px]"]',
      ) as HTMLElement;
      expect(lugar).not.toBeNull();
      expect(lugar.className).not.toMatch(/(^|\s)(shrink|w-\[46px\]|min-w-0)/);
    }
    expect(
      within(screen.getByRole("table")).getAllByText(
        /^(subió|bajó|sin cambios)/,
      ).length,
    ).toBeGreaterThan(0);
  });

  it("sin violaciones de axe en la lista y en el detalle", async () => {
    const user = userEvent.setup();
    const { container } = render(<ReporteHoras datos={datosDePrueba()} />);
    const regla = {
      rules: {
        "color-contrast": { enabled: false },
        region: { enabled: false },
      },
    };

    expect((await axe.run(container, regla)).violations).toEqual([]);

    await user.click(within(lista()).getByRole("button", { name: /^Rivera/ }));
    await user.click(
      within(lista()).getByRole("button", { name: /Ana Silva/ }),
    );
    expect((await axe.run(container, regla)).violations).toEqual([]);
  });
});
