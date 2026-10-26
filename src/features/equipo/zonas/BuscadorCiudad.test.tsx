import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CiudadDelCatalogo } from "@/datos/equipo/zonas";

import { BuscadorCiudad, MENSAJE_BUSQUEDA_SIN_CONEXION } from "./BuscadorCiudad";

const SAN_JOSE_DE_SAN_JOSE: CiudadDelCatalogo = { id: "cat-sj-1", nombre: "San José", departamento: "San José" };
const SAN_JOSE_DE_FLORES: CiudadDelCatalogo = { id: "cat-sj-2", nombre: "San José", departamento: "Flores" };
const SALTO: CiudadDelCatalogo = { id: "cat-salto", nombre: "Salto", departamento: "Salto" };
const VIEJA: CiudadDelCatalogo = { id: "cat-vieja", nombre: "Pueblo Viejo", departamento: null };

function montar(
  props: Partial<Parameters<typeof BuscadorCiudad>[0]> = {},
  catalogo: CiudadDelCatalogo[] = [SAN_JOSE_DE_SAN_JOSE, SAN_JOSE_DE_FLORES, SALTO, VIEJA],
) {
  const buscar = vi.fn<(texto: string) => Promise<CiudadDelCatalogo[]>>(async () => catalogo);
  const onElegir = vi.fn();
  const onCerrar = vi.fn();
  const resultado = render(
    <BuscadorCiudad buscar={buscar} excluidas={new Set()} ocupado={false} error={null} onElegir={onElegir} onCerrar={onCerrar} {...props} />,
  );
  return { ...resultado, buscar, onElegir, onCerrar, usuario: userEvent.setup() };
}

describe("BuscadorCiudad · el departamento sale del catálogo", () => {
  it("el rótulo dice que se busca por nombre o departamento", async () => {
    montar();

    expect(await screen.findByRole("list", { name: "Ciudades del catálogo" })).toBeInTheDocument();
    expect(screen.getByText("BUSCAR POR NOMBRE O DEPARTAMENTO")).toBeInTheDocument();
    expect(screen.queryByText(/provincia/i)).not.toBeInTheDocument();
  });

  it("no hay ningún campo de texto para el departamento: solo la búsqueda", async () => {
    montar();
    await screen.findByRole("list", { name: "Ciudades del catálogo" });

    expect(screen.getAllByRole("searchbox")).toHaveLength(1);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("cada ciudad se ve con su departamento, también en el nombre accesible del botón", async () => {
    montar();
    const lista = await screen.findByRole("list", { name: "Ciudades del catálogo" });

    expect(within(lista).getByRole("button", { name: "Agregar Salto, Salto" })).toHaveTextContent("Salto" + "Salto");
    expect(within(lista).getByRole("button", { name: "Agregar San José, Flores" })).toHaveTextContent("Flores");
  });

  it("dos ciudades con el mismo nombre se distinguen por el departamento y se elige la correcta", async () => {
    const { usuario, onElegir } = montar();
    const lista = await screen.findByRole("list", { name: "Ciudades del catálogo" });

    expect(within(lista).getAllByRole("button", { name: /^Agregar San José/ })).toHaveLength(2);
    await usuario.click(within(lista).getByRole("button", { name: "Agregar San José, Flores" }));

    expect(onElegir).toHaveBeenCalledTimes(1);
    expect(onElegir).toHaveBeenCalledWith(SAN_JOSE_DE_FLORES);
  });

  it("una ciudad vieja sin departamento se ofrece solo con su nombre, sin «null» ni «undefined»", async () => {
    montar();
    const lista = await screen.findByRole("list", { name: "Ciudades del catálogo" });

    const boton = within(lista).getByRole("button", { name: "Agregar Pueblo Viejo" });
    expect(boton).toHaveTextContent(/^Pueblo Viejo$/);
    expect(lista).not.toHaveTextContent(/null|undefined/);
  });

  it("una ciudad que ya está en la campaña no se ofrece, pero la que se llama igual de otro departamento sí", async () => {
    montar({ excluidas: new Set([SAN_JOSE_DE_SAN_JOSE.id]) });
    const lista = await screen.findByRole("list", { name: "Ciudades del catálogo" });

    expect(within(lista).queryByRole("button", { name: "Agregar San José, San José" })).not.toBeInTheDocument();
    expect(within(lista).getByRole("button", { name: "Agregar San José, Flores" })).toBeInTheDocument();
  });

  it("al escribir pide al catálogo lo que se escribió (la base busca por nombre o por departamento)", async () => {
    const { usuario, buscar } = montar();
    await screen.findByRole("list", { name: "Ciudades del catálogo" });

    await usuario.type(screen.getByRole("searchbox"), "flores");

    await waitFor(() => expect(buscar).toHaveBeenLastCalledWith("flores"));
  });

  it("un departamento larguísimo no rompe la fila", async () => {
    const largo = { id: "cat-largo", nombre: "Ciudad", departamento: "Departamento de nombre larguísimo ".repeat(4).trim() };
    montar({}, [largo]);
    const lista = await screen.findByRole("list", { name: "Ciudades del catálogo" });

    expect(within(lista).getByRole("button", { name: `Agregar Ciudad, ${largo.departamento}` })).toBeInTheDocument();
  });
});

describe("BuscadorCiudad · estados y casos límite", () => {
  it("cargando, vacío y sin coincidencias", async () => {
    let liberar: (c: CiudadDelCatalogo[]) => void = () => undefined;
    const pedir = vi.fn(() => new Promise<CiudadDelCatalogo[]>((r) => (liberar = r)));
    const { usuario } = montar({ buscar: pedir });
    expect(screen.getByText("Buscando ciudades…")).toBeInTheDocument();
    await waitFor(() => expect(pedir).toHaveBeenCalledTimes(1));

    await act(async () => liberar([]));
    expect(await screen.findByText("Ya están todas las ciudades del catálogo en la campaña.")).toBeInTheDocument();

    await usuario.type(screen.getByRole("searchbox"), "zzz");
    expect(await screen.findByText("No hay ciudades que coincidan con «zzz».")).toBeInTheDocument();
  });

  it("sin conexión avisa y «Reintentar» vuelve a pedir; no queda trabado en «Buscando»", async () => {
    const buscar = vi.fn<(t: string) => Promise<CiudadDelCatalogo[]>>().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValue([SALTO]);
    const { usuario } = montar({ buscar });

    expect(await screen.findByRole("alert")).toHaveTextContent(MENSAJE_BUSQUEDA_SIN_CONEXION);
    expect(screen.queryByText("Buscando ciudades…")).not.toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByRole("button", { name: "Agregar Salto, Salto" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("mientras se agrega la ciudad elegida no se puede tocar nada", async () => {
    montar({ ocupado: true });
    const lista = await screen.findByRole("list", { name: "Ciudades del catálogo" });

    for (const boton of within(lista).getAllByRole("button")) expect(boton).toBeDisabled();
    expect(screen.getByRole("searchbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cerrar el buscador de ciudades" })).toBeDisabled();
    expect(screen.getByText("Agregando la ciudad…")).toBeInTheDocument();
  });

  it("si no se pudo agregar, el aviso queda y el buscador sigue abierto con la lista", async () => {
    montar({ error: "La ciudad ya no está en el catálogo." });

    expect(await screen.findByRole("alert")).toHaveTextContent("La ciudad ya no está en el catálogo.");
    expect(await screen.findByRole("button", { name: "Agregar Salto, Salto" })).toBeEnabled();
  });

  it("Esc cierra el buscador, salvo mientras agrega", async () => {
    const { usuario, onCerrar, rerender, buscar, onElegir } = montar();
    await screen.findByRole("list", { name: "Ciudades del catálogo" });
    await usuario.keyboard("{Escape}");
    expect(onCerrar).toHaveBeenCalledTimes(1);

    rerender(<BuscadorCiudad buscar={buscar} excluidas={new Set()} ocupado error={null} onElegir={onElegir} onCerrar={onCerrar} />);
    screen.getByRole("region", { name: "Agregar ciudad" }).focus();
    await usuario.keyboard("{Escape}");
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });
});
