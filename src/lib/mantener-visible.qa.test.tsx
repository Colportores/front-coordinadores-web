import { render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMantenerVisible } from "@/lib/mantener-visible";

/**
 * QA de #192 (PR #193): casos límite de `useMantenerVisible`, la parte nueva de código que deja a la vista la ciudad
 * elegida en las listas largas. Lo que se cuida: no mueve nada si no hay elegida, no se dispara por re-renders sin cambio
 * de elección, no roba el foco del teclado y no rompe donde `scrollIntoView` no existe.
 */

const original = Element.prototype.scrollIntoView;
let alVer: ReturnType<typeof vi.fn>;

beforeEach(() => {
  alVer = vi.fn();
  Element.prototype.scrollIntoView = alVer as unknown as Element["scrollIntoView"];
});

afterEach(() => {
  Element.prototype.scrollIntoView = original;
});

type Fila = { nombre: string; marca?: "pressed" | "current" };

function Lista({ filas, clave, conRef = true }: { filas: Fila[]; clave: string; conRef?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useMantenerVisible(ref, clave);
  return (
    <div ref={conRef ? ref : undefined} data-testid="lista">
      {filas.map((f) => (
        <button
          key={f.nombre}
          type="button"
          aria-pressed={f.marca === "pressed" ? true : f.marca === undefined ? false : undefined}
          aria-current={f.marca === "current" ? "true" : undefined}
        >
          {f.nombre}
        </button>
      ))}
    </div>
  );
}

const filas = (elegida: number | null, marca: "pressed" | "current" = "pressed"): Fila[] =>
  Array.from({ length: 30 }, (_, i) => ({ nombre: `Ciudad ${i}`, marca: i === elegida ? marca : undefined }));

describe("useMantenerVisible", () => {
  it("al montar deja a la vista la fila con aria-pressed, con block «nearest»", () => {
    const { getByText } = render(<Lista filas={filas(27)} clave="c-27" />);
    expect(alVer).toHaveBeenCalledTimes(1);
    expect(alVer).toHaveBeenCalledWith({ block: "nearest" });
    expect(alVer.mock.contexts[0]).toBe(getByText("Ciudad 27"));
  });

  it("también reconoce aria-current=true (listas de navegación)", () => {
    const { getByText } = render(<Lista filas={filas(12, "current")} clave="c-12" />);
    expect(alVer.mock.contexts.at(-1)).toBe(getByText("Ciudad 12"));
  });

  it("sin fila elegida no mueve nada", () => {
    render(<Lista filas={filas(null)} clave="" />);
    expect(alVer).not.toHaveBeenCalled();
  });

  it("un re-render con la misma clave no vuelve a mover; con otra clave, muestra la nueva elegida", () => {
    const { rerender, getByText } = render(<Lista filas={filas(3)} clave="c-3" />);
    alVer.mockClear();
    rerender(<Lista filas={filas(3)} clave="c-3" />);
    expect(alVer).not.toHaveBeenCalled();
    rerender(<Lista filas={filas(29)} clave="c-29" />);
    expect(alVer).toHaveBeenCalledTimes(1);
    expect(alVer.mock.contexts[0]).toBe(getByText("Ciudad 29"));
  });

  it("volver a «sin elegida» no lanza error ni mueve la lista", () => {
    const { rerender } = render(<Lista filas={filas(20)} clave="c-20" />);
    alVer.mockClear();
    expect(() => rerender(<Lista filas={filas(null)} clave="" />)).not.toThrow();
    expect(alVer).not.toHaveBeenCalled();
  });

  it("no roba el foco del teclado: el elemento enfocado sigue siendo el mismo", () => {
    const { getByText, rerender } = render(<Lista filas={filas(1)} clave="c-1" />);
    const enfocado = getByText("Ciudad 5");
    enfocado.focus();
    rerender(<Lista filas={filas(27)} clave="c-27" />);
    expect(document.activeElement).toBe(enfocado);
  });

  it("donde scrollIntoView no existe (entornos viejos) no rompe", () => {
    // @ts-expect-error: simula un navegador sin la API
    Element.prototype.scrollIntoView = undefined;
    expect(() => render(<Lista filas={filas(27)} clave="c-27" />)).not.toThrow();
  });

  it("si el ref no quedó colgado de ningún nodo, no rompe", () => {
    expect(() => render(<Lista filas={filas(27)} clave="c-27" conRef={false} />)).not.toThrow();
    expect(alVer).not.toHaveBeenCalled();
  });

  it("con una sola fila y elegida, la deja a la vista una vez", () => {
    render(<Lista filas={[{ nombre: "Única", marca: "pressed" }]} clave="u" />);
    expect(alVer).toHaveBeenCalledTimes(1);
  });
});
