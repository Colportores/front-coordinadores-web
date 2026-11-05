/**
 * Contrato de datos de la pestaña Inicio (vista 31, HU-CAM-008): cómo está la gente del coordinador en un día,
 * por ciudad y por colportor. Lo implementa la RPC `tablero_de_inicio()` de Supabase (ADR-013, sin BFF) y la fuente
 * simulada del sitio de prueba. Describe datos de negocio: solo cifras y nombres de colportores, nunca datos de
 * clientes (R-RP01).
 *
 * El panel no repite lo que la base ya contó: las cifras de una ciudad, de un departamento y del total son la suma de
 * sus colportores (`resumenDe` en `features/inicio/modelo.ts`), así la columna siempre cierra con lo que muestra la tabla.
 */

/**
 * Qué hizo el colportor ese día, decidido solo por su jornada (nunca por sus ventas):
 * - `en-jornada`: tiene una jornada abierta que empezó ese día, y ese día es hoy.
 * - `sin-cerrar`: un día anterior en que empezó una jornada que quedó abierta (nada inventa su fin: HU-JOR-002).
 * - `finalizada`: tuvo jornada ese día y no queda ninguna abierta.
 * - `sin-iniciar`: no tuvo jornada ese día.
 */
export type EstadoJornada = "en-jornada" | "sin-cerrar" | "finalizada" | "sin-iniciar";

/** Un colportor con la inscripción vigente ese día y su zona en una ciudad. */
export interface ColportorDelDia {
  id: string;
  /** «Nombre Apellido». */
  nombre: string;
  estado: EstadoJornada;
  /** Horas de sus jornadas de ese día (una abierta de hoy suma hasta ahora). */
  horas: number;
  /** Visitas con la entrevista hecha (`VENTA` o `ENTREVISTA`, HU-VIS-005). */
  presentaciones: number;
  ventas: number;
  /** Lo vendido (no lo cobrado ni lo depositado: eso es de Cuentas), en centavos. */
  montoCentavos: number;
  /**
   * Cuándo recibió el servidor el último `sync_push` de su teléfono (ISO 8601); `null` si nunca llegó uno («Sin datos»).
   * Es solo visual: sin umbral ni alerta.
   */
  ultimoPushAt: string | null;
}

export interface CiudadDelDia {
  /** El id de la ciudad del catálogo. */
  id: string;
  nombre: string;
  /** `null` mientras la ciudad no tiene departamento cargado. */
  departamento: string | null;
  /** Ordenados por apellido y nombre. */
  colportores: ColportorDelDia[];
}

/** Un inscripto sin zona asignada: no entra en ninguna ciudad ni en ninguna cifra hasta que tenga una. */
export interface ColportorSinZona {
  id: string;
  nombre: string;
  estado: EstadoJornada;
  /** Su inscripción ya se dio de baja: no está en la campaña y no se le ofrece «Asignar zona». */
  deBaja: boolean;
  /** Cuándo se inscribió (ISO 8601). */
  inscriptoAt: string;
  ultimoPushAt: string | null;
}

/**
 * Lo que espera la coordinadora en otras pestañas (V2: HU-COB-008 y HU-STK-003). La base devuelve la lista vacía hasta
 * que se conecten; la fuente simulada trae los del diseño.
 */
export type PendienteDeAccion =
  | {
      tipo: "ticket-por-validar";
      id: string;
      ciudadId: string;
      colportor: string;
      ciudad: string;
      montoCentavos: number;
      /** Cuándo se subió (ISO 8601). */
      cuando: string;
    }
  | {
      tipo: "pedido-por-autorizar";
      id: string;
      ciudadId: string;
      colportor: string;
      ciudad: string;
      libros: number;
      montoCentavos: number;
      cuando: string;
    };

export interface TableroDelDia {
  campaniaId: string;
  /** El día que se mira (día de Montevideo), `AAAA-MM-DD`. */
  fecha: string;
  esHoy: boolean;
  /** Cuándo se calculó (ISO 8601): el «Actualizado 10:40» y el «hace 12 min» no dependen del reloj del navegador. */
  calculadoA: string;
  /** Una por cada ciudad viva de la campaña, aunque no tenga colportores. Por nombre. */
  ciudades: CiudadDelDia[];
  sinZona: ColportorSinZona[];
  pendientes: PendienteDeAccion[];
}

export interface OpcionesTablero {
  /** `AAAA-MM-DD`: hoy o un día anterior. Sin ella, hoy. */
  fecha?: string | null;
  /** Sin ella, la campaña que eligió la coordinadora en el topbar. */
  campaniaId?: string;
}

export interface FuenteDatosInicio {
  /** `null` si la coordinadora no tiene una campaña que no haya terminado. Una falla sale como excepción. */
  obtenerTablero(opciones?: OpcionesTablero): Promise<TableroDelDia | null>;
}

/**
 * Lo que recibe la pantalla al pedir otro día: el tablero o por qué no se pudo traer. Una server action de producción
 * tapa el mensaje de lo que tira, así que la causa viaja en el resultado.
 */
export type ResultadoTablero =
  | { ok: true; tablero: TableroDelDia | null }
  | { ok: false; causa: "sin-conexion" | "error" | "rechazo"; mensaje?: string };
