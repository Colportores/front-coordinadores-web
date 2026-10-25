import type { DatosHoras, Fecha } from "@/datos/reportes/contrato";
import { diaYMes } from "@/datos/reportes/fechas";

import { pluralColportores, type Ambito, type AmbitoResuelto, resolverAmbito } from "./ambito";
import {
  CIFRA_SIN_DATOS,
  cifraDeDias,
  compararPeriodos,
  crearCalendario,
  formatearCifra,
  periodosDe,
  serieDeColportor,
  serieSuma,
  sumarCifras,
  tendenciaDe,
  ultimoDatoAntesDe,
  type Granularidad,
  type Tendencia,
} from "./calculo";
import type { BarraDeCifra } from "./TarjetaDeCifra";
import type { FilaDeTabla } from "./TablaDeHoras";

export function textoSinDatosDesde(fecha: Fecha): string {
  return `sin datos desde el ${diaYMes(fecha)}`;
}

export interface ReporteArmado {
  resuelto: AmbitoResuelto;
  titulo: string;
  subtitulo: string;
  /** Con un colportor elegido: la ciudad a la que se vuelve. */
  volverA: { nombre: string; ambito: Ambito } | null;
  cifra: {
    valor: string;
    tendencia: Tendencia | null;
    nota: string;
    campania: string;
    barras: BarraDeCifra[];
    resumenDelGrafico: string;
  };
  tabla: {
    descripcion: string;
    primeraColumna: string;
    filas: FilaDeTabla[];
  };
}

const NOMBRE_DE_GRANULARIDAD: Record<Granularidad, string> = { dia: "día", semana: "semana", mes: "mes" };
const PRIMERA_COLUMNA_DEL_COLPORTOR: Record<Granularidad, string> = { dia: "DÍA", semana: "SEMANA", mes: "MES" };

/** Todo lo que muestra la vista 32 para un ámbito y una granularidad: la cifra con su gráfico y la tabla. */
export function armarReporte(datos: DatosHoras, ambito: Ambito, granularidad: Granularidad): ReporteArmado {
  const resuelto = resolverAmbito(datos, ambito);
  const calendario = crearCalendario(datos.inicioCampania, datos.hoy, datos.finCampania);
  const elegido = resuelto.colportor;
  // Una cifra de varios colportores se muestra entera; la de uno solo, con un decimal.
  const esTotal = elegido === null;

  const serie = elegido
    ? serieDeColportor(elegido.colportor)
    : serieSuma(resuelto.colportores.map((c) => serieDeColportor(c)));
  const comparacion = compararPeriodos(granularidad, serie, calendario);
  const periodos = periodosDe(granularidad, calendario);
  const cifrasDePeriodos = periodos.map((p) => cifraDeDias(serie, p.dias));

  const maximo = Math.max(1, ...cifrasDePeriodos.filter((c) => c.hayDatos).map((c) => c.horas));
  const barras: BarraDeCifra[] = periodos.map((p, i) => ({
    rotulo: p.rotulo,
    proporcion: cifrasDePeriodos[i].horas / maximo,
    sinDatos: !cifrasDePeriodos[i].hayDatos,
    enCurso: p.enCurso,
  }));
  const resumenDelGrafico = `Horas por ${NOMBRE_DE_GRANULARIDAD[granularidad]}: ${periodos
    .map((p, i) => {
      const etiqueta = granularidad === "dia" ? p.detalle : p.rotulo;
      const cifra = cifrasDePeriodos[i].hayDatos ? formatearCifra(cifrasDePeriodos[i], esTotal) : "sin datos";
      return `${etiqueta}: ${cifra}${p.enCurso ? " (en curso)" : ""}`;
    })
    .join("; ")}.`;

  const rotuloActual = comparacion?.rotulo ?? null;
  const frasePeriodo = comparacion ? [comparacion.rotulo, comparacion.contra].filter(Boolean).join(" ") : "";
  const nota = !comparacion
    ? "Todavía no hay un período completo"
    : comparacion.actual.hayDatos
      ? [comparacion.rotulo, comparacion.contra].filter(Boolean).join(" · ")
      : `${comparacion.rotulo}: sin datos`;

  const campania = `Campaña: ${formatearCifra(sumarCifras(calendario.diasHabiles.map(serie)), true)}`;

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

  let filas: FilaDeTabla[];
  let primeraColumna: string;
  let descripcion: string;

  if (elegido) {
    descripcion = `Horas de ${elegido.colportor.nombre} por ${NOMBRE_DE_GRANULARIDAD[granularidad]}`;
    primeraColumna = PRIMERA_COLUMNA_DEL_COLPORTOR[granularidad];
    filas = periodos.map((p, i) => {
      const cifra = cifrasDePeriodos[i];
      const sinDatos = !cifra.hayDatos;
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
        valor: formatearCifra(cifra, false),
        sinDatos,
        enCurso: p.enCurso,
        // Cada fila compara con la anterior; la que está en curso no lleva tendencia.
        tendencia: i > 0 && !p.enCurso ? tendenciaDe(cifra, cifrasDePeriodos[i - 1]) : null,
      };
    });
  } else {
    descripcion = `Horas por colportor, ${NOMBRE_DE_GRANULARIDAD[granularidad]}`;
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
        const propia = compararPeriodos(granularidad, serieDeColportor(colportor), calendario);
        const actual = propia?.actual ?? CIFRA_SIN_DATOS;
        filas.push({
          tipo: "fila",
          clave: colportor.id,
          nombre: colportor.nombre,
          nota: actual.hayDatos ? null : colportor.sinDatosDesde ? textoSinDatosDesde(colportor.sinDatosDesde) : "sin datos",
          valor: formatearCifra(actual, false),
          sinDatos: !actual.hayDatos,
          enCurso: false,
          tendencia: propia ? tendenciaDe(propia.actual, propia.base) : null,
        });
      }
    }
  }

  return {
    resuelto,
    titulo: resuelto.titulo,
    subtitulo: [ubicacion, frasePeriodo].filter(Boolean).join(" · "),
    volverA: elegido ? { nombre: elegido.ciudad.nombre, ambito: { tipo: "ciudad", ciudadId: elegido.ciudad.id } } : null,
    cifra: {
      valor: comparacion ? formatearCifra(comparacion.actual, esTotal) : "—",
      tendencia: comparacion ? tendenciaDe(comparacion.actual, comparacion.base) : null,
      nota,
      campania,
      barras,
      resumenDelGrafico,
    },
    tabla: { descripcion, primeraColumna, filas },
  };
}
