import { paginaDeBusqueda, sugeridosDe } from "@/datos/equipo/busqueda";
import type {
  CandidatoColportor,
  DatosAnadirColportor,
  FuenteDatosEquipo,
  MiembroEquipo,
} from "@/datos/equipo/contrato";
import { crearEquipoSimulado } from "@/datos/equipo/equipo-simulado";

/**
 * Las cuentas de ejemplo de la vista 23 (diseño "23 Anadir Colportor"). Las fechas de creación que el diseño no
 * muestra son inventadas. La búsqueda las recorre como lo haría el servidor (`busqueda.ts`).
 */
export const CANDIDATOS_SIMULADOS: CandidatoColportor[] = [
  {
    id: "usr-ana-martinez",
    nombre: "Ana Martínez",
    email: "ana.martinez@example.com",
    estadoCuenta: "pendiente_asignacion",
    campaniaActual: null,
    cuentaCreada: "2026-09-22",
  },
  {
    id: "usr-gonzalo-sosa",
    nombre: "Gonzalo Sosa",
    email: "gonza.sosa@example.com",
    estadoCuenta: "pendiente_asignacion",
    campaniaActual: null,
    cuentaCreada: "2026-09-24",
  },
  {
    id: "usr-valentina-bentancor",
    nombre: "Valentina Bentancor",
    email: "vbentancor@example.com",
    estadoCuenta: "pendiente_asignacion",
    campaniaActual: null,
    cuentaCreada: "2026-09-26",
  },
  {
    id: "usr-rodrigo-silva",
    nombre: "Rodrigo Silva",
    email: "rodrigo.silva@example.com",
    estadoCuenta: "activa",
    campaniaActual: "Otoño Norte",
    cuentaCreada: "2026-03-03",
  },
  {
    id: "usr-rodrigo-barrios",
    nombre: "Rodrigo Barrios",
    email: "rbarrios@example.com",
    estadoCuenta: "pendiente_asignacion",
    campaniaActual: null,
    cuentaCreada: "2026-09-27",
  },
  {
    id: "usr-anabel-pereira",
    nombre: "Anabel Pereira",
    email: "anabel.p@example.com",
    estadoCuenta: "activa",
    campaniaActual: null,
    cuentaCreada: "2026-05-14",
  },
  {
    id: "usr-mariana-olivera",
    nombre: "Mariana Olivera",
    email: "mariana.olivera@example.com",
    estadoCuenta: "suspendida",
    campaniaActual: null,
    cuentaCreada: "2026-04-02",
  },
];

const EQUIPO_ACTUAL_SIMULADO: MiembroEquipo[] = [
  { id: "col-1", nombre: "Diego Rocha", zonaNombre: "Cerro Norte" },
  { id: "col-2", nombre: "Melina Vázquez", zonaNombre: "La Teja" },
  { id: "col-3", nombre: "Laura Suárez", zonaNombre: "Paso de la Arena" },
  { id: "col-4", nombre: "Joel Cabrera", zonaNombre: "Cerro Norte" },
  { id: "col-5", nombre: "Pablo Ferreira", zonaNombre: "Belvedere" },
  { id: "col-6", nombre: "Noelia Acosta", zonaNombre: "La Teja" },
];

/** Lo que la página trae al abrir: la campaña, los sugeridos (como los daría el servidor) y el equipo actual. */
export const DATOS_ANADIR_COLPORTOR_SIMULADO: DatosAnadirColportor = {
  campaniaId: "campania-verano-2026",
  campania: "Verano 2026",
  sugeridos: sugeridosDe(CANDIDATOS_SIMULADOS),
  equipoActual: EQUIPO_ACTUAL_SIMULADO,
};

export const fuenteEquipoSimulada: FuenteDatosEquipo = {
  ...crearEquipoSimulado(),
  async obtenerAnadirColportor() {
    return DATOS_ANADIR_COLPORTOR_SIMULADO;
  },
  async buscarCandidatos(_campaniaId, texto, despuesDe) {
    const pagina = paginaDeBusqueda(CANDIDATOS_SIMULADOS, texto, despuesDe);
    if (!pagina) {
      return {
        ok: false,
        mensaje: "No se encontró la última cuenta de la página anterior. Volvé a buscar desde el principio.",
        reiniciar: true,
      };
    }
    return { ok: true, ...pagina };
  },
  /** Simulado: no persiste nada; la vista lleva su propio estado local. */
  async inscribirColportor() {
    return { ok: true };
  },
};
