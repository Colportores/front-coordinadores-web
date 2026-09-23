/**
 * Registro único del estado de cada historia de usuario (HU) del panel.
 * Lo usa el modo dev (chips, navegación y panel "Estado de HU").
 *
 * Lo mantiene el shell: las pestañas no lo editan. Cuando una HU cambia de
 * estado (se conecta al BFF, pasa el QA de vistas) se actualiza acá.
 *
 * Estados:
 * - bloqueada: no se puede conectar todavía (ver `motivo`).
 * - mockeada: UI hecha con datos simulados (src/datos/<pestaña>/simulado.ts).
 * - implementada: conectada al BFF real.
 * - validada-qa: pasó el QA de vistas del sprint de conexión.
 *
 * `schemaEnBack` se calcula cruzando las tablas que la HU necesita
 * (docs-organizacion: esquema-datos.md) con las que crean las migraciones
 * de backend-supabase (TABLAS_EN_BACK).
 */
import type { Pestana } from "@/config/flags";

export type EstadoHu = "bloqueada" | "mockeada" | "implementada" | "validada-qa";
export type SchemaEnBack = "si" | "parcial" | "no";

export interface TablaHu {
  nombre: string;
  existe: boolean;
}

export interface RegistroHu {
  id: string;
  titulo: string;
  pestana: Pestana;
  estado: EstadoHu;
  /** Obligatorio cuando `estado` es "bloqueada". */
  motivo?: string;
  /** Sprint en que se conecta al BFF (docs-organizacion: plan-sprints.md). */
  sprintConexion: string;
  schemaEnBack: SchemaEnBack;
  tablas: TablaHu[];
}

/**
 * Tablas del esquema público que crean las migraciones de backend-supabase
 * (rama develop): 0001_esquema_inicial, 0002_sync_infra, 0003_rls_performance.
 * Actualizar cuando entre una migración nueva.
 */
export const TABLAS_EN_BACK: ReadonlySet<string> = new Set([
  "pais",
  "ciudad",
  "zona",
  "usuario",
  "rol",
  "usuario_rol",
  "horario_colportor",
  "campania",
  "campania_colportor",
  "ubicacion",
  "espacio",
  "espacio_persona",
  "visita",
  "agenda",
  "venta",
  "venta_item",
  "entrega",
  "cobranza",
  "jornada",
  "house_status",
  "producto",
  "coleccion",
  "producto_coleccion",
  "precio_por_zona",
]);

export const ORDEN_ESTADOS: readonly EstadoHu[] = [
  "bloqueada",
  "mockeada",
  "implementada",
  "validada-qa",
];

export const ETIQUETA_ESTADO: Record<EstadoHu, string> = {
  bloqueada: "Bloqueada",
  mockeada: "Mockeada",
  implementada: "Implementada",
  "validada-qa": "Validada QA",
};

export const DESCRIPCION_ESTADO: Record<EstadoHu, string> = {
  bloqueada: "No se puede conectar todavía",
  mockeada: "UI con datos simulados",
  implementada: "Conectada al BFF real",
  "validada-qa": "Pasó el QA de vistas",
};

export const ETIQUETA_SCHEMA: Record<SchemaEnBack, string> = {
  si: "sí",
  parcial: "parcial",
  no: "no",
};

const MOTIVO_V2 =
  'Necesita la migración "Stock y cuenta (V2)" de esquema-datos.md, que todavía no existe en backend-supabase. Su conexión queda para V2, después del 27/11.';

const MOTIVO_HEATMAP =
  "HU de V2: su conexión queda para después del 27/11 (plan-sprints.md). Además falta decidir la librería de mapas (ADR-015 dice react-map-gl; la HU menciona react-leaflet).";

const SPRINT_V2 = "V2 · después del 27/11";
const SPRINT_V3 = "V3 · después del 27/11";

const MOTIVO_V3 =
  'HU de V3 (HistoriasDeUsuario.md). Además necesita las tablas deposito y ticket de la migración "Stock y cuenta (V2)", que todavía no existe en backend-supabase. Su conexión queda para después del 27/11.';

function calcularSchema(tablas: TablaHu[]): SchemaEnBack {
  const existentes = tablas.filter((t) => t.existe).length;
  if (existentes === tablas.length) return "si";
  if (existentes === 0) return "no";
  return "parcial";
}

function hu(datos: Omit<RegistroHu, "tablas" | "schemaEnBack"> & { tablas: string[] }): RegistroHu {
  const tablas = datos.tablas.map((nombre) => ({ nombre, existe: TABLAS_EN_BACK.has(nombre) }));
  return { ...datos, tablas, schemaEnBack: calcularSchema(tablas) };
}

export const HISTORIAS: readonly RegistroHu[] = [
  // Inicio
  hu({
    id: "HU-CAM-008",
    titulo: "Tablero de avance de colportores en zona",
    pestana: "inicio",
    estado: "mockeada",
    sprintConexion: "Sprint 11 · 09/11–13/11",
    tablas: ["campania", "campania_colportor", "zona", "jornada", "visita", "venta"],
  }),
  // Equipo
  hu({
    id: "HU-CAM-004",
    titulo: "Añadir colportor a campaña",
    pestana: "equipo",
    estado: "mockeada",
    sprintConexion: "Sprint 6 · 05/10–09/10",
    tablas: ["campania", "campania_colportor", "usuario", "usuario_rol"],
  }),
  hu({
    id: "HU-CAM-006",
    titulo: "Asignar zona a colportor",
    pestana: "equipo",
    estado: "mockeada",
    sprintConexion: "Sprint 6 · 05/10–09/10",
    tablas: ["campania_colportor", "zona"],
  }),
  hu({
    id: "HU-CAT-005",
    titulo: "Coordinador: configurar precio de venta por zona",
    pestana: "equipo",
    estado: "mockeada",
    sprintConexion: "Sprint 7 · 12/10–16/10",
    tablas: ["precio_por_zona", "producto", "zona"],
  }),
  hu({
    id: "HU-JOR-004",
    titulo: "Coordinador: agregar acompañamiento a jornada finalizada",
    pestana: "equipo",
    estado: "mockeada",
    sprintConexion: "Sprint 8 · 19/10–23/10",
    tablas: ["jornada", "usuario"],
  }),
  // Stock (V2)
  hu({
    id: "HU-STK-001",
    titulo: "Coordinador: registrar pedido a casa editora",
    pestana: "stock",
    estado: "bloqueada",
    motivo: MOTIVO_V2,
    sprintConexion: SPRINT_V2,
    tablas: ["pedido_casa_editora", "pedido_item", "producto"],
  }),
  hu({
    id: "HU-STK-003",
    titulo: "Coordinador: autorizar pedido según situación financiera",
    pestana: "stock",
    estado: "bloqueada",
    motivo: MOTIVO_V2,
    sprintConexion: SPRINT_V2,
    tablas: ["pedido_casa_editora", "estado_cuenta"],
  }),
  hu({
    id: "HU-STK-004",
    titulo: "Colportor: consultar stock propio",
    pestana: "stock",
    estado: "bloqueada",
    motivo: MOTIVO_V2,
    sprintConexion: SPRINT_V2,
    tablas: ["stock", "producto"],
  }),
  hu({
    id: "HU-STK-005",
    titulo: "Colportor: solicitar transferencia de stock",
    pestana: "stock",
    estado: "bloqueada",
    motivo: MOTIVO_V2,
    sprintConexion: SPRINT_V2,
    tablas: ["transferencia_stock", "stock", "movimiento_stock"],
  }),
  // Cuentas (V2)
  hu({
    id: "HU-CTA-005",
    titulo: "Coordinador: revisar estado de cuenta de colportor",
    pestana: "cuentas",
    estado: "bloqueada",
    motivo: MOTIVO_V2,
    sprintConexion: SPRINT_V2,
    tablas: ["estado_cuenta", "deposito", "venta", "cobranza"],
  }),
  hu({
    id: "HU-COB-008",
    titulo: "Coordinador: revisar tickets cargados",
    pestana: "cuentas",
    estado: "bloqueada",
    motivo: MOTIVO_V2,
    sprintConexion: SPRINT_V2,
    tablas: ["ticket", "cobranza"],
  }),
  hu({
    id: "HU-CTA-006",
    titulo: "Cargar comprobante de depósito bancario",
    pestana: "cuentas",
    estado: "bloqueada",
    motivo: MOTIVO_V3,
    sprintConexion: SPRINT_V3,
    tablas: ["deposito", "ticket"],
  }),
  // Reportes
  hu({
    id: "HU-REP-001",
    titulo: "Reporte de horas trabajadas",
    pestana: "reportes",
    estado: "mockeada",
    sprintConexion: "Sprint 9 · 26/10–30/10",
    tablas: ["jornada", "usuario"],
  }),
  hu({
    id: "HU-REP-002",
    titulo: "Reporte de ventas y desempeño por colportor",
    pestana: "reportes",
    estado: "mockeada",
    sprintConexion: "Sprint 10 · 02/11–06/11",
    tablas: ["venta", "venta_item", "visita", "jornada", "usuario"],
  }),
  hu({
    id: "HU-REP-005",
    titulo: "Exportar reportes a CSV y PDF",
    pestana: "reportes",
    estado: "mockeada",
    sprintConexion: "Sprint 12 · 16/11–20/11",
    tablas: ["jornada", "venta", "venta_item"],
  }),
  hu({
    id: "HU-REP-004",
    titulo: "Mapa de ventas con heatmap",
    pestana: "reportes",
    estado: "bloqueada",
    motivo: MOTIVO_HEATMAP,
    sprintConexion: SPRINT_V2,
    tablas: ["venta", "ubicacion", "house_status"],
  }),
];

export function buscarHu(id: string): RegistroHu | undefined {
  return HISTORIAS.find((h) => h.id === id);
}

export function husDePestana(pestana: Pestana): RegistroHu[] {
  return HISTORIAS.filter((h) => h.pestana === pestana);
}

/** Estado agregado de una pestaña: el menos avanzado de sus HU. */
export function estadoDePestana(pestana: Pestana): EstadoHu | undefined {
  const estados = husDePestana(pestana).map((h) => ORDEN_ESTADOS.indexOf(h.estado));
  if (estados.length === 0) return undefined;
  return ORDEN_ESTADOS[Math.min(...estados)];
}

export function contarPorEstado(historias: readonly RegistroHu[] = HISTORIAS): Record<EstadoHu, number> {
  const conteo: Record<EstadoHu, number> = {
    bloqueada: 0,
    mockeada: 0,
    implementada: 0,
    "validada-qa": 0,
  };
  for (const h of historias) conteo[h.estado] += 1;
  return conteo;
}
