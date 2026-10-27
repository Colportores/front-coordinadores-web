import type { DatosHoras, Fecha } from "@/datos/reportes/contrato";
import { diaYMes } from "@/datos/reportes/fechas";

import { pluralColportores, type Ambito, type AmbitoResuelto, resolverAmbito } from "./ambito";
import {
  CIFRA_SIN_DATOS,
  compararCon,
  crearCalendario,
  formatearCifra,
  periodosDe,
  ultimoDatoAntesDe,
  type Calendario,
  type Granularidad,
  type MedidaMostrada,
  type Periodo,
  type Tendencia,
} from "./calculo";
import {
  agregadoresDe,
  cifrasVisibles,
  listarNombres,
  MOSTRAR_POR_COBRAR,
  tendenciaDeCifra,
  type Agregadores,
  type DefinicionDeCifra,
} from "./metricas";
import type { CeldaDeTabla, FilaDeTabla } from "./TablaDeReporte";
import type { BarraDeCifra } from "./TarjetaDeCifra";

export function textoSinDatosDesde(fecha: Fecha): string {
  return `sin datos desde el ${diaYMes(fecha)}`;
}

/** Una tarjeta de la vista: la cifra del período con su tendencia, su gráfico y el total de la campaña. */
export interface TarjetaArmada {
  clave: MedidaMostrada;
  etiqueta: string;
  valor: string;
  tendencia: Tendencia | null;
  nota: string;
  campania: string;
  barras: BarraDeCifra[];
  resumenDelGrafico: string;
}

export interface ReporteArmado {
  resuelto: AmbitoResuelto;
  titulo: string;
  subtitulo: string;
  /** El período que se mira y contra cuál se compara: «S7 contra S6». Vacío si todavía no hay un período completo. */
  periodo: string;
  /** El rótulo del período que se mira («S7»), o `null` si todavía no hay uno completo. */
  rotuloDelPeriodo: string | null;
  /** Con un colportor elegido: la ciudad a la que se vuelve. */
  volverA: { nombre: string; ambito: Ambito } | null;
  tarjetas: TarjetaArmada[];
  tabla: {
    descripcion: string;
    primeraColumna: string;
    columnas: { clave: MedidaMostrada; encabezado: string }[];
    filas: FilaDeTabla[];
  };
}

export interface OpcionesDelReporte {
  /** Mostrar el % por cobrar (V2). Por omisión, lo que diga `MOSTRAR_POR_COBRAR`. */
  porCobrar?: boolean;
}

const NOMBRE_DE_GRANULARIDAD: Record<Granularidad, string> = { dia: "día", semana: "semana", mes: "mes" };
const PRIMERA_COLUMNA_DEL_COLPORTOR: Record<Granularidad, string> = { dia: "DÍA", semana: "SEMANA", mes: "MES" };

/** Todo lo que muestra la vista 32 para un ámbito y una granularidad: las tarjetas con su gráfico y la tabla. */
export function armarReporte(
  datos: DatosHoras,
  ambito: Ambito,
  granularidad: Granularidad,
  opciones: OpcionesDelReporte = {},
): ReporteArmado {
  const cifras = cifrasVisibles(opciones.porCobrar ?? MOSTRAR_POR_COBRAR);
  const resuelto = resolverAmbito(datos, ambito);
  const calendario = crearCalendario(datos.inicioCampania, datos.hoy, datos.finCampania);
  const elegido = resuelto.colportor;
  // Una cifra de varios colportores se muestra entera; la de uno solo, con un decimal.
  const esTotal = elegido === null;

  const periodos = periodosDe(granularidad, calendario);
  const agregadores = agregadoresDe(resuelto.colportores);
  const tarjetas = cifras.flatMap((cifra) => {
    const tarjeta = armarTarjeta(cifra, agregadores, granularidad, calendario, periodos, esTotal);
    return tarjeta ? [tarjeta] : [];
  });

  // Qué período se compara no depende de la cifra: sale de los días y las semanas del calendario.
  const comparacion = compararCon(granularidad, agregadores.horas, calendario);
  const rotuloActual = comparacion?.rotulo ?? null;
  const frasePeriodo = comparacion ? [comparacion.rotulo, comparacion.contra].filter(Boolean).join(" ") : "";

  const unaCiudad = resuelto.ciudades.length === 1 ? resuelto.ciudades[0] : null;
  const ubicacion = elegido
    ? [elegido.ciudad.nombre, elegido.ciudad.departamento ? `Departamento ${elegido.ciudad.departamento}` : null]
        .filter(Boolean)
        .join(" · ")
    : [
        unaCiudad?.departamento ? `Departamento ${unaCiudad.departamento}` : null,
        pluralColportores(resuelto.colportores.length),
      ]
        .filter(Boolean)
        .join(" · ");

  const nombres = listarNombres(cifras);
  let filas: FilaDeTabla[];
  let primeraColumna: string;
  let descripcion: string;

  if (elegido) {
    descripcion = `${capitalizar(nombres)} de ${elegido.colportor.nombre} por ${NOMBRE_DE_GRANULARIDAD[granularidad]}`;
    primeraColumna = PRIMERA_COLUMNA_DEL_COLPORTOR[granularidad];
    const propios = agregadoresDe([elegido.colportor]);
    const cifrasDePeriodos = periodos.map((p) => cifras.map((c) => propios[c.clave](p.dias)));
    filas = periodos.map((p, i) => {
      const sinDatos = !propios.horas(p.dias).hayDatos;
      const ultimo = sinDatos ? ultimoDatoAntesDe(elegido.colportor, p.inicio) : null;
      return {
        tipo: "fila",
        clave: p.inicio,
        nombre: granularidad === "semana" ? `${p.rotulo} · ${p.detalle}` : p.detalle,
        nota: sinDatos
          ? ultimo
            ? `sin datos · últimos datos el ${diaYMes(ultimo)}`
            : "sin datos"
          : p.enCurso
            ? "en curso"
            : null,
        enCurso: p.enCurso,
        celdas: cifras.map((c, k): CeldaDeTabla => {
          const cifra = cifrasDePeriodos[i][k];
          return {
            clave: c.clave,
            valor: formatearCifra(cifra, false, c.clave),
            crudo: cifra.hayDatos ? cifra.valor : null,
            sinDatos: !cifra.hayDatos,
            // Cada fila compara con la anterior; la que está en curso no lleva tendencia.
            tendencia: i > 0 && !p.enCurso ? tendenciaDeCifra(c.clave, cifra, cifrasDePeriodos[i - 1][k]) : null,
          };
        }),
      };
    });
  } else {
    descripcion = `${capitalizar(nombres)} por colportor, ${NOMBRE_DE_GRANULARIDAD[granularidad]}`;
    primeraColumna = rotuloActual ? `COLPORTOR · ${rotuloActual.toUpperCase()}` : "COLPORTOR";
    filas = [];
    for (const ciudad of resuelto.ciudades) {
      if (resuelto.ciudades.length > 1) {
        filas.push({
          tipo: "grupo",
          clave: `ciudad:${ciudad.id}`,
          nombre: ciudad.nombre,
          detalle: pluralColportores(ciudad.colportores.length),
        });
      }
      for (const colportor of ciudad.colportores) {
        const propios = agregadoresDe([colportor]);
        const comparaciones = cifras.map((c) => compararCon(granularidad, propios[c.clave], calendario));
        const horas = compararCon(granularidad, propios.horas, calendario)?.actual ?? CIFRA_SIN_DATOS;
        filas.push({
          tipo: "fila",
          clave: colportor.id,
          nombre: colportor.nombre,
          nota: horas.hayDatos ? null : colportor.sinDatosDesde ? textoSinDatosDesde(colportor.sinDatosDesde) : "sin datos",
          enCurso: false,
          celdas: cifras.map((c, k): CeldaDeTabla => {
            const propia = comparaciones[k];
            const actual = propia?.actual ?? CIFRA_SIN_DATOS;
            return {
              clave: c.clave,
              valor: formatearCifra(actual, false, c.clave),
              crudo: actual.hayDatos ? actual.valor : null,
              sinDatos: !actual.hayDatos,
              tendencia: propia ? tendenciaDeCifra(c.clave, propia.actual, propia.base) : null,
            };
          }),
        });
      }
    }
  }

  return {
    resuelto,
    titulo: resuelto.titulo,
    subtitulo: [ubicacion, frasePeriodo].filter(Boolean).join(" · "),
    periodo: frasePeriodo,
    rotuloDelPeriodo: rotuloActual,
    volverA: elegido ? { nombre: elegido.ciudad.nombre, ambito: { tipo: "ciudad", ciudadId: elegido.ciudad.id } } : null,
    tarjetas,
    tabla: { descripcion, primeraColumna, columnas: cifras.map((c) => ({ clave: c.clave, encabezado: c.columna })), filas },
  };
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** La tarjeta de una cifra, o nada si esa cifra no tiene tarjeta (el monto va dentro de la de ventas). */
function armarTarjeta(
  cifra: DefinicionDeCifra,
  agregadores: Agregadores,
  granularidad: Granularidad,
  calendario: Calendario,
  periodos: Periodo[],
  esTotal: boolean,
): TarjetaArmada | null {
  if (!cifra.tarjeta) return null;
  const { etiqueta, nombre } = cifra.tarjeta;
  const agregar = agregadores[cifra.clave];
  const comparacion = compararCon(granularidad, agregar, calendario);
  const cifrasDePeriodos = periodos.map((p) => agregar(p.dias));

  const maximo = Math.max(1, ...cifrasDePeriodos.filter((c) => c.hayDatos).map((c) => c.valor));
  const barras: BarraDeCifra[] = periodos.map((p, i) => ({
    rotulo: p.rotulo,
    proporcion: cifrasDePeriodos[i].valor / maximo,
    sinDatos: !cifrasDePeriodos[i].hayDatos,
    enCurso: p.enCurso,
  }));
  const resumenDelGrafico = `${nombre} por ${NOMBRE_DE_GRANULARIDAD[granularidad]}: ${periodos
    .map((p, i) => {
      const etiquetaDelPeriodo = granularidad === "dia" ? p.detalle : p.rotulo;
      const valor = cifrasDePeriodos[i].hayDatos ? formatearCifra(cifrasDePeriodos[i], esTotal, cifra.clave) : "sin datos";
      return `${etiquetaDelPeriodo}: ${valor}${p.enCurso ? " (en curso)" : ""}`;
    })
    .join("; ")}.`;

  const nota = !comparacion
    ? "Todavía no hay un período completo"
    : comparacion.actual.hayDatos
      ? [comparacion.rotulo, comparacion.contra].filter(Boolean).join(" · ")
      : `${comparacion.rotulo}: sin datos`;

  const deLaCampania = agregar(calendario.diasHabiles);
  // Las ventas de la campaña van con lo que sumaron en $U.
  const montoDeLaCampania = cifra.clave === "ventas" ? agregadores.monto(calendario.diasHabiles) : CIFRA_SIN_DATOS;
  const campania = [
    `Campaña: ${formatearCifra(deLaCampania, true, cifra.clave)}`,
    montoDeLaCampania.hayDatos ? formatearCifra(montoDeLaCampania, true, "monto") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    clave: cifra.clave,
    etiqueta,
    valor: comparacion ? formatearCifra(comparacion.actual, esTotal, cifra.clave) : "—",
    tendencia: comparacion ? tendenciaDeCifra(cifra.clave, comparacion.actual, comparacion.base) : null,
    nota,
    campania,
    barras,
    resumenDelGrafico,
  };
}
