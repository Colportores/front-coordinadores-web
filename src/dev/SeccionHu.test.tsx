import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CLAVE_CHIPS_VISIBLES, ProveedorModoDev } from "@/dev/ProveedorModoDev";
import { SeccionHu } from "@/dev/SeccionHu";

function renderSeccion(activo: boolean, hu = "HU-CAM-008") {
  return render(
    <ProveedorModoDev activo={activo}>
      <SeccionHu hu={hu} className="col-span-2">
        <p>Contenido de la sección</p>
      </SeccionHu>
    </ProveedorModoDev>,
  );
}

describe("SeccionHu", () => {
  describe("en modo dev", () => {
    it("muestra el chip con id, estado y schema en back", () => {
      renderSeccion(true);
      const chip = screen.getByTestId("chip-hu");
      expect(chip).toHaveTextContent("HU-CAM-008");
      expect(chip).toHaveTextContent("Mockeada");
      expect(chip).toHaveTextContent("schema: sí");
      expect(screen.getByText("Contenido de la sección")).toBeInTheDocument();
    });

    it("marca las HU bloqueadas", () => {
      renderSeccion(true, "HU-CTA-006");
      const chip = screen.getByTestId("chip-hu");
      expect(chip).toHaveTextContent("Bloqueada");
      expect(chip).toHaveTextContent("schema: no");
    });

    it("avisa si la HU no está en el registro", () => {
      renderSeccion(true, "HU-XXX-999");
      expect(screen.getByText(/HU-XXX-999 · no está en estado-hu.ts/)).toBeInTheDocument();
    });

    it("no muestra el chip si se ocultaron los chips", () => {
      window.localStorage.setItem(CLAVE_CHIPS_VISIBLES, "0");
      renderSeccion(true);
      expect(screen.queryByTestId("chip-hu")).not.toBeInTheDocument();
      expect(screen.getByText("Contenido de la sección")).toBeInTheDocument();
    });
  });

  describe("fuera del modo dev", () => {
    it("renderiza solo el contenido, con el mismo contenedor", () => {
      const { container } = renderSeccion(false);
      expect(screen.queryByTestId("chip-hu")).not.toBeInTheDocument();
      const seccion = container.querySelector('[data-hu="HU-CAM-008"]');
      expect(seccion).toHaveClass("col-span-2");
      expect(seccion).not.toHaveClass("outline-dashed");
    });
  });
});
