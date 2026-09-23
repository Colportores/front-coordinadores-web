import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DATOS_REPORTES_SIMULADOS } from "@/datos/reportes/simulado";
import { MapaRegionPlaceholder } from "@/features/reportes/MapaRegionPlaceholder";

describe("MapaRegionPlaceholder", () => {
  it("renderiza el título, el rótulo sin PII y el placeholder de la región", () => {
    render(
      <MapaRegionPlaceholder region={DATOS_REPORTES_SIMULADOS.region} marcadores={DATOS_REPORTES_SIMULADOS.marcadoresMapa} />,
    );
    expect(screen.getByText("Mapa de la región")).toBeInTheDocument();
    expect(screen.getByText("sin PII")).toBeInTheDocument();
    expect(screen.getByText("[ mapa OSM · Montevideo Oeste ]")).toBeInTheDocument();
  });

  it("renderiza un marcador por cada punto de ejemplo", () => {
    render(
      <MapaRegionPlaceholder region={DATOS_REPORTES_SIMULADOS.region} marcadores={DATOS_REPORTES_SIMULADOS.marcadoresMapa} />,
    );
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("no rompe si no hay marcadores de ejemplo", () => {
    render(<MapaRegionPlaceholder region="Montevideo Oeste" marcadores={[]} />);
    expect(screen.getByText("[ mapa OSM · Montevideo Oeste ]")).toBeInTheDocument();
  });
});
