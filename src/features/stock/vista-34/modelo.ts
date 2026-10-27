import { fechaYHoraEnMontevideo } from "@/lib/momento";
import type { ColportorDeStock, DatosDeStock, ProductoDeStock, TipoDeProducto } from "@/datos/stock/contrato";

/**
 * Lo que arma la vista 34 (HU-STK-010) a partir de los datos: qué mira (todas las ciudades, un departamento, una ciudad
 * o los colportores sin ciudad), la lista de ciudades de la izquierda, las tarjetas por tipo, los avisos y la tabla por
 * producto con quién lo tiene. Todo puro: cambiar de ciudad no pide nada al servidor.
 *
 * Las cuentas son las del canvas (`34 Stock por Ciudad.dc.html`, opción A):
 * - El stock de una ciudad es la suma del de sus colportores. Un colportor en cero no es un aviso: se prestan entre ellos.
 * - Libros y material se miran producto por producto; revistas y misioneros por categoría (basta que haya de esa
 *   categoría, no cuál).
 * - Solo hay dos avisos y ninguno tiene umbral: «Agotado en la ciudad» (nadie lo tiene) y «Faltan N para entregar» (lo que
 *   hay en la ciudad no alcanza para lo vendido y no entregado).
 * - La plata no está acá: es de Cuentas. «Por cobrar» se cuenta en unidades.
 */

export type Ambito =
  | { tipo: "todas" }
  | { tipo: "departamento"; clave: string }
  | { tipo: "ciudad"; ciudadId: string }
  | { tipo: "sin-ciudad" };

export const AMBITO_TODAS: Ambito = { tipo: "todas" };

export function mismoAmbito(a: Ambito, b: Ambito): boolean {
  switch (a.tipo) {
    case "todas":
    case "sin-ciudad":
      return b.tipo === a.tipo;
    case "departamento":
      return b.tipo === "departamento" && b.clave === a.clave;
    case "ciudad":
      return b.tipo === "ciudad" && b.ciudadId === a.ciudadId;
  }
}

const ORDEN = new Intl.Collator("es", { sensitivity: "base" });

/** Sin mayúsculas, tildes ni espacios de más: «Paysandu» y «Paysandú» son un solo departamento (como en Inicio). */
export function claveDeDepartamento(nombre: string): string {
  return nombre.normalize("NFD").replace(/\p{M}/gu, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

export function formatearCantidad(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
export const pluralColportores = (n: number) => plural(n, "colportor", "colportores");
export const pluralProductos = (n: number) => plural(n, "producto", "productos");
export const pluralAvisos = (n: number) => plural(n, "aviso", "avisos");

// ---------------------------------------------------------------------------------------------------------------------
// Los datos, ya ordenados y con las cantidades saneadas
// ---------------------------------------------------------------------------------------------------------------------

export interface Cantidades {
  tiene: number;
  porEntregar: number;
  entregados: number;
  porCobrar: number;
}

const CERO: Cantidades = { tiene: 0, porEntregar: 0, entregados: 0, porCobrar: 0 };

/** Una cantidad que no es un entero positivo (negativa, NaN) cuenta como cero: no hay stock negativo que mostrar. */
function cantidad(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export interface PersonaDeStock {
  id: string;
  nombre: string;
  ciudadId: string | null;
  ciudadNombre: string | null;
  /** «Sincronizó el 22/10 a las 18:30», o «Todavía no sincronizó» si no llegó ningún dato de su teléfono. */
  sincronizo: string;
  porProducto: ReadonlyMap<string, Cantidades>;
}

/** Lo que dice la fila del colportor de cuándo llegó su último dato (hora de Montevideo). */
export function textoDeSincronizacion(ultimoDatoAt: string | null): string {
  const cuando = fechaYHoraEnMontevideo(ultimoDatoAt);
  return cuando === null ? "Todavía no sincronizó" : `Sincronizó el ${cuando}`;
}

export interface CiudadConGente {
  id: string;
  nombre: string;
  departamento: string | null;
  claveDepartamento: string | null;
  personas: PersonaDeStock[];
}

/** Lo que se controla como una sola fila: un producto, o toda una categoría (revistas, misioneros). */
export interface Unidad {
  clave: string;
  nombre: string;
  tipo: TipoDeProducto;
  agrupada: boolean;
  nota: string | null;
  productoIds: string[];
}

export interface TipoDeUnidades {
  tipo: TipoDeProducto;
  etiqueta: string;
  agrupado: boolean;
  unidades: Unidad[];
  productos: number;
}

export interface Mundo {
  campaniaId: string;
  /** Departamento primero (A-Z), después ciudad (A-Z); las ciudades sin departamento, al final. */
  ciudades: CiudadConGente[];
  sinCiudad: PersonaDeStock[];
  tipos: TipoDeUnidades[];
  totalProductos: number;
}

const TIPOS: { tipo: TipoDeProducto; etiqueta: string; agrupado: boolean; categoria: string }[] = [
  { tipo: "LIBRO", etiqueta: "Libros", agrupado: false, categoria: "" },
  { tipo: "REVISTA", etiqueta: "Revistas", agrupado: true, categoria: "Revistas · todas" },
  { tipo: "MATERIAL", etiqueta: "Material", agrupado: false, categoria: "" },
  { tipo: "MISIONERO", etiqueta: "Misioneros", agrupado: true, categoria: "Misioneros · todos" },
];

function tiposDe(productos: ProductoDeStock[]): TipoDeUnidades[] {
  return TIPOS.map(({ tipo, etiqueta, agrupado, categoria }) => {
    const delTipo = productos.filter((p) => p.tipo === tipo);
    const unidades: Unidad[] = [];
    if (delTipo.length > 0 && agrupado) {
      unidades.push({
        clave: `categoria:${tipo}`,
        nombre: categoria,
        tipo,
        agrupada: true,
        nota: delTipo.map((p) => p.nombre).join(", "),
        productoIds: delTipo.map((p) => p.id),
      });
    } else if (!agrupado) {
      for (const p of delTipo) {
        unidades.push({ clave: `producto:${p.id}`, nombre: p.nombre, tipo, agrupada: false, nota: p.nota, productoIds: [p.id] });
      }
    }
    return { tipo, etiqueta, agrupado, unidades, productos: delTipo.length };
  });
}

function personaDe(c: ColportorDeStock, ciudadNombre: string | null, ciudadId: string | null): PersonaDeStock {
  const porProducto = new Map<string, Cantidades>();
  for (const e of c.existencias) {
    const antes = porProducto.get(e.productoId) ?? CERO;
    porProducto.set(e.productoId, {
      tiene: antes.tiene + cantidad(e.tiene),
      porEntregar: antes.porEntregar + cantidad(e.porEntregar),
      entregados: antes.entregados + cantidad(e.entregados),
      porCobrar: antes.porCobrar + cantidad(e.porCobrar),
    });
  }
  return { id: c.id, nombre: c.nombre, ciudadId, ciudadNombre, sincronizo: textoDeSincronizacion(c.ultimoDatoAt), porProducto };
}

const porNombre = (a: { nombre: string }, b: { nombre: string }) => ORDEN.compare(a.nombre, b.nombre);

export function construirMundo(datos: DatosDeStock): Mundo {
  const ciudades: CiudadConGente[] = datos.ciudades.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    departamento: c.departamento === null ? null : c.departamento.trim().replace(/\s+/g, " "),
    claveDepartamento: c.departamento === null || claveDeDepartamento(c.departamento) === "" ? null : claveDeDepartamento(c.departamento),
    personas: [],
  }));
  ciudades.sort((a, b) => {
    if (a.claveDepartamento === null && b.claveDepartamento !== null) return 1;
    if (a.claveDepartamento !== null && b.claveDepartamento === null) return -1;
    return ORDEN.compare(a.departamento ?? "", b.departamento ?? "") || ORDEN.compare(a.nombre, b.nombre);
  });
  const sinCiudad: PersonaDeStock[] = [];
  const vistos = new Set<string>();
  for (const c of datos.colportores) {
    // El mismo colportor dos veces cuenta una sola.
    if (vistos.has(c.id)) continue;
    vistos.add(c.id);
    const ciudad = c.ciudadId === null ? undefined : ciudades.find((x) => x.id === c.ciudadId);
    // Una ciudad que no figura en la lista tampoco tiene a dónde ir: el colportor figura como «sin ciudad».
    if (ciudad) ciudad.personas.push(personaDe(c, ciudad.nombre, ciudad.id));
    else sinCiudad.push(personaDe(c, null, null));
  }
  for (const c of ciudades) c.personas.sort(porNombre);
  sinCiudad.sort(porNombre);
  return { campaniaId: datos.campaniaId, ciudades, sinCiudad, tipos: tiposDe(datos.productos), totalProductos: datos.productos.length };
}

// ---------------------------------------------------------------------------------------------------------------------
// Cuentas por unidad
// ---------------------------------------------------------------------------------------------------------------------

export interface Suma extends Cantidades {
  /** Cuántos colportores tienen algo en mano. */
  poseedores: number;
}

export function cantidadesDe(persona: PersonaDeStock, unidad: Unidad): Cantidades {
  const suma = { ...CERO };
  for (const id of unidad.productoIds) {
    const c = persona.porProducto.get(id);
    if (!c) continue;
    suma.tiene += c.tiene;
    suma.porEntregar += c.porEntregar;
    suma.entregados += c.entregados;
    suma.porCobrar += c.porCobrar;
  }
  return suma;
}

export function sumar(personas: PersonaDeStock[], unidad: Unidad): Suma {
  const total: Suma = { ...CERO, poseedores: 0 };
  for (const p of personas) {
    const c = cantidadesDe(p, unidad);
    total.tiene += c.tiene;
    total.porEntregar += c.porEntregar;
    total.entregados += c.entregados;
    total.porCobrar += c.porCobrar;
    if (c.tiene > 0) total.poseedores++;
  }
  return total;
}

export interface EstadoDeUnidad {
  tipo: "agotado" | "faltan" | "alcanza";
  simbolo: "⊘" | "△" | "✓";
  texto: string;
  /** Cuántas unidades faltan para lo que hay por entregar (solo con `faltan`). */
  faltan: number;
}

export function estadoDe(suma: Cantidades): EstadoDeUnidad {
  if (suma.tiene === 0) return { tipo: "agotado", simbolo: "⊘", texto: "Agotado en la ciudad", faltan: suma.porEntregar };
  if (suma.tiene < suma.porEntregar) {
    const faltan = suma.porEntregar - suma.tiene;
    return { tipo: "faltan", simbolo: "△", texto: `Faltan ${faltan} para entregar`, faltan };
  }
  return { tipo: "alcanza", simbolo: "✓", texto: "Alcanza", faltan: 0 };
}

const unidadesDe = (mundo: Mundo): Unidad[] => mundo.tipos.flatMap((t) => t.unidades);

// ---------------------------------------------------------------------------------------------------------------------
// Qué se mira
// ---------------------------------------------------------------------------------------------------------------------

export interface AmbitoResuelto {
  ambito: Ambito;
  titulo: string;
  subtitulo: string;
  /** Las ciudades del ámbito (vacío en «Sin ciudad»). */
  ciudades: CiudadConGente[];
  /** Todos los colportores que se ven, una sola vez. */
  personas: PersonaDeStock[];
  /** El ámbito junta más de un lugar: en «quién lo tiene» cada nombre lleva su ciudad. */
  variosLugares: boolean;
}

/** Los departamentos con más de una ciudad: son los únicos que ofrecen «Todo el departamento». */
function departamentosConVarias(mundo: Mundo): Map<string, { etiqueta: string; ciudades: CiudadConGente[] }> {
  const porClave = new Map<string, { etiqueta: string; ciudades: CiudadConGente[] }>();
  for (const c of mundo.ciudades) {
    if (c.claveDepartamento === null || c.departamento === null) continue;
    const grupo = porClave.get(c.claveDepartamento) ?? { etiqueta: c.departamento, ciudades: [] };
    grupo.ciudades.push(c);
    porClave.set(c.claveDepartamento, grupo);
  }
  for (const [clave, grupo] of porClave) if (grupo.ciudades.length < 2) porClave.delete(clave);
  return porClave;
}

/** Un ámbito que ya no existe en los datos (la ciudad o el departamento desaparecieron) vuelve a «todas». */
export function resolverAmbito(mundo: Mundo, ambito: Ambito): AmbitoResuelto {
  const armar = (a: Ambito, titulo: string, ciudades: CiudadConGente[], extraSinCiudad: PersonaDeStock[], partes: string[]): AmbitoResuelto => {
    const personas = [...ciudades.flatMap((c) => c.personas), ...extraSinCiudad];
    return {
      ambito: a,
      titulo,
      subtitulo: [pluralColportores(personas.length), pluralProductos(mundo.totalProductos), ...partes].join(" · "),
      ciudades,
      personas,
      variosLugares: ciudades.length + (extraSinCiudad.length > 0 ? 1 : 0) > 1,
    };
  };

  if (ambito.tipo === "departamento") {
    const grupo = departamentosConVarias(mundo).get(ambito.clave);
    if (grupo) return armar(ambito, `Departamento ${grupo.etiqueta}`, grupo.ciudades, [], []);
  }
  if (ambito.tipo === "ciudad") {
    const ciudad = mundo.ciudades.find((c) => c.id === ambito.ciudadId);
    if (ciudad) return armar(ambito, ciudad.nombre, [ciudad], [], ciudad.departamento ? [`Departamento ${ciudad.departamento}`] : []);
  }
  if (ambito.tipo === "sin-ciudad" && mundo.sinCiudad.length > 0) {
    return armar(ambito, "Sin ciudad", [], mundo.sinCiudad, ["no tienen zona asignada"]);
  }
  return armar(AMBITO_TODAS, "Todas las ciudades", mundo.ciudades, mundo.sinCiudad, mundo.sinCiudad.length > 0 ? [`${mundo.sinCiudad.length} sin ciudad`] : []);
}

// ---------------------------------------------------------------------------------------------------------------------
// Lista de ciudades
// ---------------------------------------------------------------------------------------------------------------------

export interface NodoLista {
  clave: string;
  ambito: Ambito;
  nombre: string;
  /** «2 avisos», «sin avisos»; vacío en los nodos que juntan varias ciudades. */
  detalle: string;
  seleccionado: boolean;
}

export interface GrupoLista {
  clave: string;
  /** «DEPTO. RIVERA»; `null` para las ciudades sin departamento y para «Sin ciudad». */
  titulo: string | null;
  nodos: NodoLista[];
}

export interface ModeloLista {
  todas: NodoLista;
  grupos: GrupoLista[];
}

function avisosDeCiudad(mundo: Mundo, personas: PersonaDeStock[]): number {
  return unidadesDe(mundo).filter((u) => estadoDe(sumar(personas, u)).tipo !== "alcanza").length;
}

export function construirLista(mundo: Mundo, resuelto: AmbitoResuelto): ModeloLista {
  const nodo = (clave: string, ambito: Ambito, nombre: string, detalle: string): NodoLista => ({
    clave,
    ambito,
    nombre,
    detalle,
    seleccionado: mismoAmbito(ambito, resuelto.ambito),
  });
  const conVarias = departamentosConVarias(mundo);
  const grupos: GrupoLista[] = [];
  for (const ciudad of mundo.ciudades) {
    const claveGrupo = ciudad.claveDepartamento ?? "sin-departamento";
    let grupo = grupos.find((g) => g.clave === claveGrupo);
    if (!grupo) {
      grupo = { clave: claveGrupo, titulo: ciudad.departamento === null ? null : `DEPTO. ${ciudad.departamento.toLocaleUpperCase("es")}`, nodos: [] };
      grupos.push(grupo);
      if (ciudad.claveDepartamento !== null && conVarias.has(ciudad.claveDepartamento)) {
        grupo.nodos.push(nodo(`departamento:${ciudad.claveDepartamento}`, { tipo: "departamento", clave: ciudad.claveDepartamento }, "Todo el departamento", ""));
      }
    }
    const avisos = avisosDeCiudad(mundo, ciudad.personas);
    const detalle = ciudad.personas.length === 0 ? "sin colportores" : avisos > 0 ? pluralAvisos(avisos) : "sin avisos";
    grupo.nodos.push(nodo(`ciudad:${ciudad.id}`, { tipo: "ciudad", ciudadId: ciudad.id }, ciudad.nombre, detalle));
  }
  if (mundo.sinCiudad.length > 0) {
    grupos.push({
      clave: "sin-ciudad",
      titulo: null,
      nodos: [nodo("sin-ciudad", { tipo: "sin-ciudad" }, "Sin ciudad", pluralColportores(mundo.sinCiudad.length))],
    });
  }
  return { todas: nodo("todas", AMBITO_TODAS, "Todas las ciudades", ""), grupos };
}

export interface ItemRiel {
  clave: string;
  ambito: Ambito;
  nombre: string;
  abreviatura: string;
  seleccionado: boolean;
}

/** «Rivera» → «Riv.»; «Bella Unión» → «B. Un.». */
export function abreviar(nombre: string): string {
  const palabras = nombre.split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return "";
  if (palabras.length === 1) return palabras[0].length <= 4 ? palabras[0] : `${palabras[0].slice(0, 3)}.`;
  const [primera, ...resto] = palabras;
  return `${primera[0]}. ${resto.map((p) => `${p.slice(0, 2)}.`).join(" ")}`;
}

export function construirRiel(lista: ModeloLista): ItemRiel[] {
  const item = (n: NodoLista, abreviatura: string): ItemRiel => ({
    clave: n.clave,
    ambito: n.ambito,
    nombre: n.ambito.tipo === "departamento" ? "Todo el departamento" : n.nombre,
    abreviatura,
    seleccionado: n.seleccionado,
  });
  const items = [item(lista.todas, "Todas")];
  for (const grupo of lista.grupos) {
    for (const n of grupo.nodos) {
      const sigla = n.ambito.tipo === "departamento" ? "Dpto." : n.ambito.tipo === "sin-ciudad" ? "Sin c." : abreviar(n.nombre);
      items.push(item(n, sigla));
    }
  }
  return items;
}

// ---------------------------------------------------------------------------------------------------------------------
// Tarjetas por tipo
// ---------------------------------------------------------------------------------------------------------------------

export interface TarjetaDeTipo {
  tipo: TipoDeProducto;
  etiqueta: string;
  total: number;
  /** «5 productos» o «se cuentan juntos». */
  extra: string;
  /** Cómo está el tipo: «1 con aviso», «todos alcanzan», «hay en la ciudad» o el aviso de la categoría. */
  detalle: string;
}

export function construirTarjetas(mundo: Mundo, resuelto: AmbitoResuelto): TarjetaDeTipo[] {
  return mundo.tipos.map((t) => {
    const sumas = t.unidades.map((u) => ({ u, suma: sumar(resuelto.personas, u) }));
    const total = sumas.reduce((acc, { suma }) => acc + suma.tiene, 0);
    const conAviso = sumas.filter(({ suma }) => estadoDe(suma).tipo !== "alcanza");
    if (t.productos === 0) return { tipo: t.tipo, etiqueta: t.etiqueta, total, extra: "sin productos", detalle: "" };
    if (t.agrupado) {
      const categoria = sumas[0];
      return {
        tipo: t.tipo,
        etiqueta: t.etiqueta,
        total,
        extra: t.tipo === "REVISTA" ? "se cuentan juntas" : "se cuentan juntos",
        detalle: conAviso.length > 0 ? estadoDe(categoria.suma).texto : "hay en la ciudad",
      };
    }
    return {
      tipo: t.tipo,
      etiqueta: t.etiqueta,
      total,
      extra: pluralProductos(t.productos),
      detalle: conAviso.length > 0 ? `${conAviso.length} con aviso` : "todos alcanzan",
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------------------------------------------------

export interface AvisoDeStock {
  clave: string;
  ciudadId: string;
  ciudadNombre: string;
  /** El ámbito junta varias ciudades: el texto del aviso nombra la ciudad. */
  nombraCiudad: boolean;
  unidadClave: string;
  tipo: "agotado" | "faltan";
  /** El producto o la categoría, en negrita. */
  negrita: string;
  texto: string;
  /** «Ver pedidos» cuando se agotó, «Ver quién tiene» cuando no alcanza. */
  boton: "Ver pedidos" | "Ver quién tiene";
}

/** Una ciudad sin colportores no avisa nada: no hay quién tenga ni quién espere. */
export function construirAvisos(mundo: Mundo, resuelto: AmbitoResuelto): AvisoDeStock[] {
  const avisos: AvisoDeStock[] = [];
  const una = resuelto.ciudades.length === 1;
  for (const ciudad of resuelto.ciudades) {
    if (ciudad.personas.length === 0) continue;
    for (const unidad of unidadesDe(mundo)) {
      const suma = sumar(ciudad.personas, unidad);
      const estado = estadoDe(suma);
      if (estado.tipo === "alcanza") continue;
      const base = { clave: `${ciudad.id}:${unidad.clave}`, ciudadId: ciudad.id, ciudadNombre: ciudad.nombre, nombraCiudad: !una, unidadClave: unidad.clave, negrita: unidad.nombre };
      avisos.push(
        estado.tipo === "agotado"
          ? {
              ...base,
              tipo: "agotado",
              texto: `${una ? "agotado" : `agotado en ${ciudad.nombre}`}${suma.porEntregar > 0 ? ` · ${suma.porEntregar} por entregar` : ""}`,
              boton: "Ver pedidos",
            }
          : { ...base, tipo: "faltan", texto: `${una ? "" : `${ciudad.nombre}: `}hay ${suma.tiene}, faltan ${estado.faltan}`, boton: "Ver quién tiene" },
      );
    }
  }
  return avisos;
}

// ---------------------------------------------------------------------------------------------------------------------
// Tabla por producto
// ---------------------------------------------------------------------------------------------------------------------

export interface QuienTiene {
  id: string;
  /** «Sofía Cabral» o, si el ámbito junta varias ciudades, «Sofía Cabral · Artigas». */
  nombre: string;
  /** «Sincronizó el 22/10 a las 18:30» (ver `PersonaDeStock`). */
  sincronizo: string;
  tiene: number;
  porEntregar: number;
  entregados: number;
  porCobrar: number;
}

export interface FilaDeUnidad {
  clave: string;
  nombre: string;
  nota: string | null;
  tiene: number;
  poseedores: number;
  totalPersonas: number;
  porEntregar: number;
  entregados: number;
  porCobrar: number;
  estado: EstadoDeUnidad;
  quien: QuienTiene[];
  /** «Nadie lo tiene en Artigas.» cuando `quien` queda vacío. */
  sinNadie: string;
}

export interface GrupoDeFilas {
  tipo: TipoDeProducto;
  titulo: string;
  /** «5 productos» o «por categoría». */
  detalle: string;
  filas: FilaDeUnidad[];
}

export function construirTabla(mundo: Mundo, resuelto: AmbitoResuelto): GrupoDeFilas[] {
  return mundo.tipos
    .filter((t) => t.unidades.length > 0)
    .map((t) => ({
      tipo: t.tipo,
      titulo: t.etiqueta,
      detalle: t.agrupado ? "por categoría" : pluralProductos(t.productos),
      filas: t.unidades.map((unidad): FilaDeUnidad => {
        const suma = sumar(resuelto.personas, unidad);
        const quien = resuelto.personas
          .map((p) => ({ p, c: cantidadesDe(p, unidad) }))
          .filter(({ c }) => c.tiene > 0 || c.porEntregar > 0)
          .map(({ p, c }) => ({
            id: p.id,
            nombre: resuelto.variosLugares ? `${p.nombre} · ${p.ciudadNombre ?? "Sin ciudad"}` : p.nombre,
            sincronizo: p.sincronizo,
            ...c,
          }));
        return {
          clave: unidad.clave,
          nombre: unidad.nombre,
          nota: unidad.nota,
          tiene: suma.tiene,
          poseedores: suma.poseedores,
          totalPersonas: resuelto.personas.length,
          porEntregar: suma.porEntregar,
          entregados: suma.entregados,
          porCobrar: suma.porCobrar,
          estado: estadoDe(suma),
          quien,
          sinNadie: `Nadie lo tiene en ${resuelto.titulo}.`,
        };
      }),
    }));
}
