import type { DatosEquipo, FuenteDatosEquipo } from "@/datos/equipo/contrato";

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

export const fuenteEquipoSimulada: FuenteDatosEquipo = {
  async obtenerEquipo() {
    return DATOS_EQUIPO_SIMULADO;
  },
};
