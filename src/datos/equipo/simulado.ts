import type { DatosAnadirColportor, DatosEquipo, FuenteDatosEquipo } from "@/datos/equipo/contrato";

/** Datos de ejemplo del diseño ("Panel Coordinador", sección Equipo). */
export const DATOS_EQUIPO_SIMULADO: DatosEquipo = {
  region: "Montevideo Oeste",
  colportores: [
    {
      id: "col-1",
      nombre: "Diego Rocha",
      zonaId: "cerro-norte",
      zonaNombre: "Cerro Norte",
      horasSemana: "28,4 h",
      ventas: "$U 84K",
      porcentajeCobrado: 78,
      estadoCobro: "bien",
      ultimaSync: "hace 20 min",
      sincronizacionVieja: false,
    },
    {
      id: "col-2",
      nombre: "Melina Vázquez",
      zonaId: "la-teja",
      zonaNombre: "La Teja",
      horasSemana: "31,0 h",
      ventas: "$U 92K",
      porcentajeCobrado: 74,
      estadoCobro: "bien",
      ultimaSync: "hace 1 h",
      sincronizacionVieja: false,
    },
    {
      id: "col-3",
      nombre: "Laura Suárez",
      zonaId: "paso-de-la-arena",
      zonaNombre: "Paso de la Arena",
      horasSemana: "26,2 h",
      ventas: "$U 67K",
      porcentajeCobrado: 81,
      estadoCobro: "bien",
      ultimaSync: "hace 3 h",
      sincronizacionVieja: false,
    },
    {
      id: "col-4",
      nombre: "Joel Cabrera",
      zonaId: "cerro-norte",
      zonaNombre: "Cerro Norte",
      horasSemana: "19,8 h",
      ventas: "$U 27K",
      porcentajeCobrado: 52,
      estadoCobro: "atencion",
      ultimaSync: "hace 40 min",
      sincronizacionVieja: false,
    },
    {
      id: "col-5",
      nombre: "Pablo Ferreira",
      zonaId: "belvedere",
      zonaNombre: "Belvedere",
      horasSemana: "11,5 h",
      ventas: "$U 14K",
      porcentajeCobrado: 39,
      estadoCobro: "critico",
      ultimaSync: "hace 4 días",
      sincronizacionVieja: true,
    },
    {
      id: "col-6",
      nombre: "Noelia Acosta",
      zonaId: "la-teja",
      zonaNombre: "La Teja",
      horasSemana: "24,6 h",
      ventas: "$U 58K",
      porcentajeCobrado: 69,
      estadoCobro: "bien",
      ultimaSync: "hace 2 h",
      sincronizacionVieja: false,
    },
  ],
  sinZonaAsignada: [{ id: "sz-1", nombre: "Ana Martínez", nota: "nueva colportora en tu región" }],
  preciosPorZona: [
    { id: "prod-1", producto: "El Deseado de Todas…", precioBase: "$U 1.450", precioZona: "$U 1.500" },
    { id: "prod-2", producto: "Vida Sana · 3 tomos", precioBase: "$U 2.900", precioZona: "$U 3.100" },
    { id: "prod-3", producto: "Historias para Niños", precioBase: "$U 1.980", precioZona: "$U 2.050" },
  ],
  acompanamiento: {
    jornadasSinAcompanamiento: [
      {
        id: "jor-1",
        titulo: "Jornada de J. Cabrera · ayer",
        detalle: "3,4 h · Cerro Norte · sin acompañamiento registrado",
      },
    ],
    porcentajeJornadasAcompanadas: 21,
  },
};

/**
 * Datos de ejemplo de la vista 23 (diseño "23 Anadir Colportor"). Las fechas
 * de creación de las cuentas que el diseño no muestra son inventadas.
 */
export const DATOS_ANADIR_COLPORTOR_SIMULADO: DatosAnadirColportor = {
  campaniaId: "campania-verano-2026",
  campania: "Verano 2026",
  candidatos: [
    {
      id: "usr-ana-martinez",
      nombre: "Ana Martínez",
      email: "ana.martinez@correo.uy",
      estadoCuenta: "pendiente_asignacion",
      campaniaActual: null,
      cuentaCreada: "2026-09-22",
    },
    {
      id: "usr-gonzalo-sosa",
      nombre: "Gonzalo Sosa",
      email: "gonza.sosa@correo.uy",
      estadoCuenta: "pendiente_asignacion",
      campaniaActual: null,
      cuentaCreada: "2026-09-24",
    },
    {
      id: "usr-valentina-bentancor",
      nombre: "Valentina Bentancor",
      email: "vbentancor@correo.uy",
      estadoCuenta: "pendiente_asignacion",
      campaniaActual: null,
      cuentaCreada: "2026-09-26",
    },
    // Antes que Rodrigo Barrios: el artboard B · 03 muestra primero a Silva (bloqueado). El orden real lo pondrá la búsqueda del servidor.
    {
      id: "usr-rodrigo-silva",
      nombre: "Rodrigo Silva",
      email: "rodrigo.silva@correo.uy",
      estadoCuenta: "activa",
      campaniaActual: "Otoño Norte",
      cuentaCreada: "2026-03-03",
    },
    {
      id: "usr-rodrigo-barrios",
      nombre: "Rodrigo Barrios",
      email: "rbarrios@correo.uy",
      estadoCuenta: "pendiente_asignacion",
      campaniaActual: null,
      cuentaCreada: "2026-09-27",
    },
    {
      id: "usr-anabel-pereira",
      nombre: "Anabel Pereira",
      email: "anabel.p@correo.uy",
      estadoCuenta: "activa",
      campaniaActual: null,
      cuentaCreada: "2026-05-14",
    },
    {
      id: "usr-mariana-olivera",
      nombre: "Mariana Olivera",
      email: "mariana.olivera@correo.uy",
      estadoCuenta: "suspendida",
      campaniaActual: null,
      cuentaCreada: "2026-04-02",
    },
  ],
  equipoActual: [
    { id: "col-1", nombre: "Diego Rocha", zonaNombre: "Cerro Norte" },
    { id: "col-2", nombre: "Melina Vázquez", zonaNombre: "La Teja" },
    { id: "col-3", nombre: "Laura Suárez", zonaNombre: "Paso de la Arena" },
    { id: "col-4", nombre: "Joel Cabrera", zonaNombre: "Cerro Norte" },
    { id: "col-5", nombre: "Pablo Ferreira", zonaNombre: "Belvedere" },
    { id: "col-6", nombre: "Noelia Acosta", zonaNombre: "La Teja" },
  ],
};

export const fuenteEquipoSimulada: FuenteDatosEquipo = {
  async obtenerEquipo() {
    return DATOS_EQUIPO_SIMULADO;
  },
  async obtenerAnadirColportor() {
    return DATOS_ANADIR_COLPORTOR_SIMULADO;
  },
  /** Simulado: no persiste nada; la vista lleva su propio estado local. */
  async inscribirColportor() {
    return { ok: true };
  },
};
