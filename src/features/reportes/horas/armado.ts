import type { DatosHoras, Fecha } from "@/datos/reportes/contrato";
import { diaYMes, nombreDelDia } from "@/datos/reportes/fechas";

import { acotarAColportores, pluralColportores, type Ambito, type AmbitoResuelto, resolverAmbito } from "./ambito";
import {
  CIFRA_SIN_DATOS,
  compararCon,
  crearCalendario,
  domingosConDatos,
  formatearCifra,
  formatearEntero,
  periodosDe,
  ultimoDatoAntesDe,
  type Calendario,
  type ColumnaDeReporte,
  type Granularidad,
  type Periodo,
  type Tendencia,
} from "./calculo";
import {
  agregadoresDe,
  cifrasDelRango,
  cifrasVisibles,
  listarNombres,
  MOSTRAR_POR_COBRAR,
  tendenciaDeCifra,
  type Agregadores,
  type DefinicionDeCifra,
} from "./metricas";
import { diasDelRango, fechaConAnio, limitesDelRango, textoDelRango, validarRango } from "./rango";
import type { CeldaDeTabla, FilaDeTabla } from "./TablaDeReporte";
import type { BarraDeCifra } from "./TarjetaDeCifra";

export function textoSinDatosDesde(fecha: Fecha): string {
  return `sin datos desde el ${diaYMes(fecha)}`;
}

/** Una tarjeta de la vista: la cifra del período con su tendencia, su gráfico y el total de la campaña. */
export interface TarjetaArmada {
  clave: ColumnaDeReporte;
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
    columnas: { clave: ColumnaDeReporte; encabezado: string }[];
    filas: FilaDeTabla[];
  };
  /**
   * Solo en el rango libre: por qué no se puede armar el reporte con las fechas escritas («desde» después de «hasta»,
   * fuera de la campaña, sin completar), dicho para la persona. Entonces no hay tarjetas ni filas. `null` si no hay problema.
   */
  problemaDeRango: string | null;
}

export interface OpcionesDelReporte {
  /** Mostrar el % por cobrar (V2). Por omisión, lo que diga `MOSTRAR_POR_COBRAR`. */
  porCobrar?: boolean;
  /** Los colportores elegidos del ámbito (issue #107); vacío o ausente = todos los del ámbito. */
  elegidos?: readonly string[];
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
  const resuelto = acotarAColportores(resolverAmbito(datos, ambito), opciones.elegidos ?? []);
  const calendario = crearCalendario(datos.inicioCampania, datos.hoy, datos.finCampania, domingosConDatos(resuelto.colportores));
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

  const ubicacion = textoDeUbicacion(resuelto);

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
    volverA: volverALaCiudad(resuelto),
    tarjetas,
    tabla: { descripcion, primeraColumna, columnas: cifras.map((c) => ({ clave: c.clave, encabezado: c.columna })), filas },
    problemaDeRango: null,
  };
}

/** Debajo del título: la ciudad del colportor, o el departamento y cuántos colportores se ven. */
function textoDeUbicacion(resuelto: AmbitoResuelto): string {
  const elegido = resuelto.colportor;
  const unaCiudad = resuelto.ciudades.length === 1 ? resuelto.ciudades[0] : null;
  return elegido
    ? [elegido.ciudad.nombre, elegido.ciudad.departamento ? `Departamento ${elegido.ciudad.departamento}` : null].filter(Boolean).join(" · ")
    : [unaCiudad?.departamento ? `Departamento ${unaCiudad.departamento}` : null, pluralColportores(resuelto.colportores.length)]
        .filter(Boolean)
        .join(" · ");
}

/** «‹ Rivera» solo si se llegó al colportor desde la lista; uno elegido con las casillas se deja quitando la elección. */
function volverALaCiudad(resuelto: AmbitoResuelto): ReporteArmado["volverA"] {
  const elegido = resuelto.colportor;
  return elegido && resuelto.ambito.tipo === "colportor"
    ? { nombre: elegido.ciudad.nombre, ambito: { tipo: "ciudad", ciudadId: elegido.ciudad.id } }
    : null;
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

/**
 * El reporte de un rango de fechas libre (issue #107, «Rango horas», HU-REP-001): las cifras de todo el rango (total de
 * horas, promedio por día trabajado y jornadas con acompañamiento) y la tabla por colportor o, con uno solo, por día.
 * `desde` y `hasta` son lo que escribió la persona: si no sirven (vacías, al revés, fuera de la campaña) el reporte
 * viene sin cifras y con `problemaDeRango`. Sin tendencia: un rango libre no tiene período anterior contra el cual comparar.
 */
export function armarReporteDeRango(
  datos: DatosHoras,
  ambito: Ambito,
  rango: { desde: string; hasta: string },
  opciones: OpcionesDelReporte = {},
): ReporteArmado {
  const cifras = cifrasDelRango(opciones.porCobrar ?? MOSTRAR_POR_COBRAR);
  const resuelto = acotarAColportores(resolverAmbito(datos, ambito), opciones.elegidos ?? []);
  const validado = validarRango(rango.desde, rango.hasta, limitesDelRango(datos));
  const ubicacion = textoDeUbicacion(resuelto);
  const columnas = cifras.map((c) => ({ clave: c.clave, encabezado: c.columna }));

  if (!validado.ok) {
    return {
      resuelto,
      titulo: resuelto.titulo,
      subtitulo: ubicacion,
      periodo: "",
      rotuloDelPeriodo: null,
      volverA: volverALaCiudad(resuelto),
      tarjetas: [],
      tabla: { descripcion: "Reporte del rango de fechas", primeraColumna: "COLPORTOR", columnas, filas: [] },
      problemaDeRango: validado.texto,
    };
  }

  const elegido = resuelto.colportor;
  const esTotal = elegido === null;
  const dias = diasDelRango(
    crearCalendario(datos.inicioCampania, datos.hoy, datos.finCampania, domingosConDatos(resuelto.colportores)),
    validado.rango,
  );
  const agregadores = agregadoresDe(resuelto.colportores);
  const periodo = capitalizar(textoDelRango(validado.rango));

  const tarjetas = cifras.flatMap((cifra): TarjetaArmada[] => {
    if (!cifra.tarjeta) return [];
    const valor = agregadores[cifra.clave](dias);
    const monto = agregadores.monto(dias);
    return [
      {
        clave: cifra.clave,
        etiqueta: cifra.tarjeta.etiqueta,
        valor: formatearCifra(valor, esTotal, cifra.clave),
        tendencia: null,
        nota: notaDeRango(cifra.clave, valor.hayDatos, agregadores, dias, esTotal, periodo),
        // El monto vendido va dentro de la tarjeta de ventas, como en el resto de la vista.
        campania: cifra.clave === "ventas" && monto.hayDatos ? formatearCifra(monto, true, "monto") : "",
        barras: [],
        resumenDelGrafico: "",
      },
    ];
  });

  const nombres = listarNombres(cifras);
  const celdasDe = (agregar: Agregadores, losDias: Fecha[]): CeldaDeTabla[] =>
    cifras.map((c): CeldaDeTabla => {
      const cifra = agregar[c.clave](losDias);
      return {
        clave: c.clave,
        valor: formatearCifra(cifra, false, c.clave),
        crudo: cifra.hayDatos ? cifra.valor : null,
        sinDatos: !cifra.hayDatos,
        tendencia: null,
      };
    });

  let filas: FilaDeTabla[];
  let primeraColumna: string;
  let descripcion: string;

  if (elegido) {
    descripcion = `${capitalizar(nombres)} de ${elegido.colportor.nombre} por día, ${textoDelRango(validado.rango)}`;
    primeraColumna = "DÍA";
    const propios = agregadoresDe([elegido.colportor]);
    filas = dias.map((fecha): FilaDeTabla => {
      const sinDatos = !propios.horas([fecha]).hayDatos;
      const enCurso = fecha === datos.hoy;
      return {
        tipo: "fila",
        clave: fecha,
        nombre: `${nombreDelDia(fecha)} ${diaYMes(fecha)}`,
        nota: sinDatos ? "sin datos" : enCurso ? "en curso" : null,
        enCurso,
        celdas: celdasDe(propios, [fecha]),
      };
    });
  } else {
    descripcion = `${capitalizar(nombres)} por colportor, ${textoDelRango(validado.rango)}`;
    primeraColumna = "COLPORTOR";
    filas = [];
    for (const ciudad of resuelto.ciudades) {
      if (resuelto.ciudades.length > 1) {
        filas.push({ tipo: "grupo", clave: `ciudad:${ciudad.id}`, nombre: ciudad.nombre, detalle: pluralColportores(ciudad.colportores.length) });
      }
      for (const colportor of ciudad.colportores) {
        const propios = agregadoresDe([colportor]);
        filas.push({
          tipo: "fila",
          clave: colportor.id,
          nombre: colportor.nombre,
          nota: propios.horas(dias).hayDatos ? null : colportor.sinDatosDesde ? textoSinDatosDesde(colportor.sinDatosDesde) : "sin datos",
          enCurso: false,
          celdas: celdasDe(propios, dias),
        });
      }
    }
  }

  return {
    resuelto,
    titulo: resuelto.titulo,
    subtitulo: [ubicacion, periodo].filter(Boolean).join(" · "),
    periodo,
    rotuloDelPeriodo: `${fechaConAnio(validado.rango.desde)} al ${fechaConAnio(validado.rango.hasta)}`,
    volverA: volverALaCiudad(resuelto),
    tarjetas,
    tabla: { descripcion, primeraColumna, columnas, filas },
    problemaDeRango: null,
  };
}

/** La línea chica de cada tarjeta del rango: de qué días es, o por qué no hay cifra. */
function notaDeRango(
  clave: ColumnaDeReporte,
  hayDatos: boolean,
  agregadores: Agregadores,
  dias: Fecha[],
  esTotal: boolean,
  periodo: string,
): string {
  if (!hayDatos) return "Sin datos en estos días";
  if (clave === "promedio") {
    const trabajados = agregadores.diasTrabajados(dias).valor;
    return `${formatearEntero(trabajados)} ${trabajados === 1 ? "día trabajado" : "días trabajados"}${esTotal ? " (sumando colportores)" : ""}`;
  }
  if (clave === "acompaniadas") return "Jornadas cerradas con acompañante";
  return periodo;
}
