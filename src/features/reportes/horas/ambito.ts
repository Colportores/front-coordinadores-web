import type { CiudadHoras, ColportorHoras, DatosHoras } from "@/datos/reportes/contrato";

/**
 * Qué mira el reporte de la vista 32: todas las ciudades, un departamento, una ciudad o un colportor. La lista de la
 * izquierda elige el ámbito; el resto de la vista se arma a partir de él.
 */
export type Ambito =
  | { tipo: "todas" }
  | { tipo: "departamento"; departamento: string }
  | { tipo: "ciudad"; ciudadId: string }
  | { tipo: "colportor"; colportorId: string };

export const AMBITO_TODAS: Ambito = { tipo: "todas" };

export interface AmbitoResuelto {
  ambito: Ambito;
  /** Ciudades que entran en el ámbito (la del colportor, si se eligió uno). */
  ciudades: CiudadHoras[];
  /** Si se eligió un colportor: él y su ciudad. */
  colportor: { colportor: ColportorHoras; ciudad: CiudadHoras } | null;
  /** Colportores que entran en el ámbito, en el orden de la lista. */
  colportores: ColportorHoras[];
  titulo: string;
}

export function mismoAmbito(a: Ambito, b: Ambito): boolean {
  switch (a.tipo) {
    case "todas":
      return b.tipo === "todas";
    case "departamento":
      return b.tipo === "departamento" && b.departamento === a.departamento;
    case "ciudad":
      return b.tipo === "ciudad" && b.ciudadId === a.ciudadId;
    case "colportor":
      return b.tipo === "colportor" && b.colportorId === a.colportorId;
  }
}

export function pluralColportores(cantidad: number): string {
  return `${cantidad} ${cantidad === 1 ? "colportor" : "colportores"}`;
}

/** Un ámbito que ya no existe en los datos (la ciudad o el colportor desaparecieron) vuelve a «todas». */
export function resolverAmbito(datos: DatosHoras, ambito: Ambito): AmbitoResuelto {
  const todas = (): AmbitoResuelto => ({
    ambito: AMBITO_TODAS,
    ciudades: datos.ciudades,
    colportor: null,
    colportores: datos.ciudades.flatMap((c) => c.colportores),
    titulo: "Todas las ciudades",
  });

  if (ambito.tipo === "departamento") {
    const ciudades = datos.ciudades.filter((c) => c.departamento === ambito.departamento);
    if (ciudades.length === 0) return todas();
    return {
      ambito,
      ciudades,
      colportor: null,
      colportores: ciudades.flatMap((c) => c.colportores),
      titulo: `Departamento ${ambito.departamento}`,
    };
  }

  if (ambito.tipo === "ciudad") {
    const ciudad = datos.ciudades.find((c) => c.id === ambito.ciudadId);
    if (!ciudad) return todas();
    return { ambito, ciudades: [ciudad], colportor: null, colportores: ciudad.colportores, titulo: ciudad.nombre };
  }

  if (ambito.tipo === "colportor") {
    for (const ciudad of datos.ciudades) {
      const colportor = ciudad.colportores.find((c) => c.id === ambito.colportorId);
      if (colportor) {
        return { ambito, ciudades: [ciudad], colportor: { colportor, ciudad }, colportores: [colportor], titulo: colportor.nombre };
      }
    }
    return todas();
  }

  return todas();
}

export interface NodoLista {
  clave: string;
  ambito: Ambito;
  nombre: string;
  /** Segunda línea: «10 colportores» o «sin datos desde el 17/10». */
  detalle: string | null;
  seleccionado: boolean;
  /** Los colportores de la ciudad elegida. */
  hijos: NodoLista[];
}

export interface GrupoLista {
  clave: string;
  /** «DEPTO. RIVERA»; `null` para las ciudades cuyo departamento no se conoce. */
  titulo: string | null;
  nodos: NodoLista[];
}

export interface ModeloLista {
  todas: NodoLista;
  grupos: GrupoLista[];
}

/** Departamentos en el orden en que aparecen; las ciudades sin departamento van al final, sin título. */
function agruparPorDepartamento(ciudades: CiudadHoras[]): { departamento: string | null; ciudades: CiudadHoras[] }[] {
  const grupos: { departamento: string | null; ciudades: CiudadHoras[] }[] = [];
  for (const ciudad of ciudades.filter((c) => c.departamento !== null)) {
    const grupo = grupos.find((g) => g.departamento === ciudad.departamento);
    if (grupo) grupo.ciudades.push(ciudad);
    else grupos.push({ departamento: ciudad.departamento, ciudades: [ciudad] });
  }
  const sinDepartamento = ciudades.filter((c) => c.departamento === null);
  if (sinDepartamento.length > 0) grupos.push({ departamento: null, ciudades: sinDepartamento });
  return grupos;
}

export function construirLista(datos: DatosHoras, resuelto: AmbitoResuelto, formatearSinDatos: (fecha: string) => string): ModeloLista {
  const { ambito } = resuelto;
  const total = datos.ciudades.reduce((suma, c) => suma + c.colportores.length, 0);
  const nodo = (
    clave: string,
    destino: Ambito,
    nombre: string,
    detalle: string | null,
    hijos: NodoLista[] = [],
  ): NodoLista => ({ clave, ambito: destino, nombre, detalle, seleccionado: mismoAmbito(ambito, destino), hijos });

  const ciudadAbierta = ambito.tipo === "ciudad" ? ambito.ciudadId : resuelto.colportor?.ciudad.id;

  const nodoCiudad = (ciudad: CiudadHoras): NodoLista =>
    nodo(
      `ciudad:${ciudad.id}`,
      { tipo: "ciudad", ciudadId: ciudad.id },
      ciudad.nombre,
      pluralColportores(ciudad.colportores.length),
      ciudad.id === ciudadAbierta
        ? ciudad.colportores.map((c) =>
            nodo(
              `colportor:${c.id}`,
              { tipo: "colportor", colportorId: c.id },
              c.nombre,
              c.sinDatosDesde ? formatearSinDatos(c.sinDatosDesde) : null,
            ),
          )
        : [],
    );

  return {
    todas: nodo("todas", AMBITO_TODAS, "Todas las ciudades", pluralColportores(total)),
    grupos: agruparPorDepartamento(datos.ciudades).map((grupo) => {
      const nodos: NodoLista[] = [];
      // «Todo el departamento» solo tiene sentido si el departamento tiene más de una ciudad.
      if (grupo.departamento !== null && grupo.ciudades.length > 1) {
        nodos.push(
          nodo(
            `departamento:${grupo.departamento}`,
            { tipo: "departamento", departamento: grupo.departamento },
            "Todo el departamento",
            pluralColportores(grupo.ciudades.reduce((suma, c) => suma + c.colportores.length, 0)),
          ),
        );
      }
      nodos.push(...grupo.ciudades.map(nodoCiudad));
      return {
        clave: grupo.departamento ?? "sin-departamento",
        titulo: grupo.departamento === null ? null : `DEPTO. ${grupo.departamento.toUpperCase()}`,
        nodos,
      };
    }),
  };
}

export interface ItemRiel {
  clave: string;
  ambito: Ambito;
  /** Nombre completo, para el tooltip y el lector de pantalla. */
  nombre: string;
  abreviatura: string;
  seleccionado: boolean;
}

/** «Rivera» → «Riv.»; «Bella Unión» → «B. Un.»; «Paso de los Toros» → «P. To.» (sin «de», «los»…). */
export function abreviarCiudad(nombre: string): string {
  const todas = nombre.trim().split(/\s+/);
  const significativas = todas.filter((p) => p.charAt(0) === p.charAt(0).toUpperCase());
  const palabras = significativas.length > 0 ? significativas : todas;
  if (palabras.length === 1) return `${palabras[0].slice(0, 3)}.`;
  return palabras.map((p, i) => (i === 0 ? `${p.charAt(0)}.` : `${p.slice(0, 2)}.`)).join(" ");
}

/** La lista angosta (lista contraída): todas, cada departamento con varias ciudades y cada ciudad. */
export function construirRiel(datos: DatosHoras, resuelto: AmbitoResuelto): ItemRiel[] {
  const { ambito } = resuelto;
  const ciudadElegida = ambito.tipo === "ciudad" ? ambito.ciudadId : resuelto.colportor?.ciudad.id;
  const item = (clave: string, destino: Ambito, nombre: string, abreviatura: string, resaltar: boolean): ItemRiel => ({
    clave,
    ambito: destino,
    nombre,
    abreviatura,
    seleccionado: resaltar || mismoAmbito(ambito, destino),
  });

  const items: ItemRiel[] = [item("todas", AMBITO_TODAS, "Todas las ciudades", "Todas", false)];
  for (const grupo of agruparPorDepartamento(datos.ciudades)) {
    if (grupo.departamento !== null && grupo.ciudades.length > 1) {
      items.push(
        item(
          `departamento:${grupo.departamento}`,
          { tipo: "departamento", departamento: grupo.departamento },
          `Departamento ${grupo.departamento}`,
          "Dpto.",
          false,
        ),
      );
    }
    for (const ciudad of grupo.ciudades) {
      items.push(
        item(
          `ciudad:${ciudad.id}`,
          { tipo: "ciudad", ciudadId: ciudad.id },
          ciudad.nombre,
          abreviarCiudad(ciudad.nombre),
          ciudad.id === ciudadElegida,
        ),
      );
    }
  }
  return items;
}
