import type { CiudadHoras, ColportorHoras, DatosHoras, Fecha, FuenteDatosReportes } from "@/datos/reportes/contrato";
import { campaniaProvisoriaConFechas } from "@/datos/supabase/campania-provisoria";
import { ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import {
  cadena,
  cadenaONula,
  filas,
  nombreVisible,
  numero,
  type Objeto,
  RespuestaInesperada,
} from "@/datos/supabase/respuesta";
import { diasEntre, esDiaIso, hoyEnMontevideo, lunesDe, sumarDias } from "@/lib/dias";

/**
 * Fuente de la vista 32 (Reportes, HU-REP-001) contra las RPC de Supabase (ADR-013): `horas_por_ciudad_y_colportor()`
 * (migración 0060, backend-supabase#95) y `ciudades_de_campania()` (0066) para el departamento de cada ciudad, que la
 * primera no trae. Habla con un `ClienteRpc`, o sea con el JWT del coordinador.
 *
 * Se pide **por día** (`p_agrupar = 'dia'`) desde el primer día de la campaña hasta hoy (o hasta su último día, si
 * terminó): las semanas y los meses, y la tendencia contra el período anterior, las arma el panel en el navegador con
 * la misma regla que la RPC (`calculo.ts`), así que cambiar de «Días» a «Semanas» no pide nada. La RPC redondea a
 * períodos completos solo en semanas y meses; en días el rango es exacto.
 *
 * Qué se hace con lo que devuelve:
 *   · Una fila por día × colportor. Las filas con `jornadas = 0` existen solo para la comparación del servidor (ayer sí
 *     trabajó, hoy no): en el panel un día sin jornadas cerradas es un día **sin datos**, no un día de 0 horas, así que
 *     no entra en `horasPorDia`.
 *   · La ciudad es la de la zona **actual** del colportor. Los que no tienen zona (`ciudad_id` nulo) van una sola vez, en
 *     el grupo «Sin zona asignada» al final de la lista, que suma en «Todas las ciudades» y no en ninguna ciudad
 *     (decisión de Cristian del 23/10).
 *   · `departamento` sale de `ciudades_de_campania()` por `ciudad_id`; una ciudad que ya no figura ahí (o una campaña
 *     terminada, que no deja leerlas: `CZ011`) queda con `departamento: null` y va sin título.
 *
 *   · La RPC solo devuelve a quienes tienen horas, así que la lista se completa con `zonas_por_colportor()` (0047/0062, la
 *     que usa Equipo): quien está inscripto y todavía no cerró ninguna jornada figura igual, con guion, en su ciudad o en
 *     «Sin zona asignada» (decisión del 25/10, P2 de los pendientes de #60). Quien ya figura por sus horas no se toca.
 *
 * `sinDatosDesde` (decisión de Cristian del 25/10, «Sin datos»): el último día con horas, cuando pasaron `DIAS_SIN_DATOS`
 * o más días de trabajo seguidos (lunes a sábado) sin horas desde ese día, sin contar hoy; si no, `null`. Quien nunca
 * tuvo horas queda en `null`.
 *
 * **El pedido se parte para que ninguna respuesta llegue al tope de filas.** PostgREST corta en silencio las respuestas de
 * una función que devuelve `table` en `max_rows` (1000 por defecto y en `config.toml`): un 200 con las primeras 1000
 * filas, sin error. La RPC ordena por período y esas filas son por día × colportor, así que el corte se comería los
 * días más nuevos justo donde se miran. Por eso `leerHoras` pide el rango entero y, si la respuesta trae `TOPE_FILAS`
 * o más (puede estar cortada), lo parte a la mitad por fechas y pide cada mitad, y así hasta que ninguna respuesta
 * llegue al tope. Un rango de más de 366 días (que la RPC rechaza con `22023`) se parte antes de pedirlo. Partir por
 * fechas no cambia lo que se arma: las filas con `jornadas = 0` dependen del día anterior pero el panel las ignora para
 * `horasPorDia`. Un solo día con `TOPE_FILAS` filas o más no se puede partir por fechas: sale como error, nunca como
 * datos a medias.
 *
 * Una falla de conexión, de servicio o de sesión, y un rechazo de la base (`42501`, `22023`), salen como excepción: la
 * página la atrapa `error.tsx` y ofrece reintentar. **Ninguna falla se toma por «sin horas».** Solo una campaña que ya no
 * existe (`CZ001`, `CZ011`) o que todavía no empezó es «sin campaña que consultar» (`null`).
 */

const RPC = "horas_por_ciudad_y_colportor";
const RPC_CIUDADES = "ciudades_de_campania";
const RPC_INSCRIPTOS = "zonas_por_colportor";

export const ID_SIN_ZONA = "sin-zona";
export const NOMBRE_SIN_ZONA = "Sin zona asignada";

/** Filas a partir de las cuales una respuesta puede estar cortada por PostgREST (`max_rows`, config.toml). */
export const TOPE_FILAS = 1000;
/** Lo más largo que acepta la RPC por pedido (`22023` si se pasa). */
export const TOPE_DIAS = 366;

/** Días de trabajo (lunes a sábado) seguidos sin horas a partir de los cuales se avisa «sin datos desde». */
export const DIAS_SIN_DATOS = 2;

const COLLATOR = new Intl.Collator("es", { sensitivity: "base" });

function dia(rpc: string, fila: Objeto, campo: string): Fecha {
  const valor = cadena(rpc, fila, campo);
  if (!esDiaIso(valor)) throw new RespuestaInesperada(rpc, `\`${campo}\` no es un día (${valor})`);
  return valor;
}

/** La campaña se terminó o se dio de baja entre una llamada y la siguiente. */
function campaniaYaNoVigente(error: unknown): boolean {
  return error instanceof ErrorSupabase && (error.codigo === "CZ001" || error.codigo === "CZ011");
}

/** Los departamentos por id de ciudad. Una campaña terminada no deja leerlos (`CZ011`): sus ciudades quedan sin departamento. */
async function departamentos(cliente: ClienteRpc, campaniaId: string): Promise<Map<string, string | null>> {
  try {
    const ciudades = filas(RPC_CIUDADES, await cliente.llamarRpc(RPC_CIUDADES, { p_campania_id: campaniaId }));
    return new Map(ciudades.map((c) => [cadena(RPC_CIUDADES, c, "ciudad_id"), cadenaONula(RPC_CIUDADES, c, "departamento")]));
  } catch (error) {
    if (error instanceof ErrorSupabase && error.codigo === "CZ011") return new Map();
    throw error;
  }
}

/**
 * Las filas de `horas_por_ciudad_y_colportor` por día entre `desde` y `hasta` (ambos incluidos), partiendo el pedido a la
 * mitad mientras el rango pase de `TOPE_DIAS` o la respuesta pueda estar cortada (`TOPE_FILAS`). Los tramos no se
 * superponen, así que no hay filas repetidas.
 */
async function leerHoras(cliente: ClienteRpc, campaniaId: string, desde: Fecha, hasta: Fecha): Promise<Objeto[]> {
  const dias = diasEntre(desde, hasta) + 1;
  const partir = async (): Promise<Objeto[]> => {
    const mitad = sumarDias(desde, Math.floor(dias / 2) - 1);
    const [primera, segunda] = await Promise.all([
      leerHoras(cliente, campaniaId, desde, mitad),
      leerHoras(cliente, campaniaId, sumarDias(mitad, 1), hasta),
    ]);
    return [...primera, ...segunda];
  };

  if (dias > TOPE_DIAS) return partir();

  const leidas = filas(
    RPC,
    await cliente.llamarRpc(RPC, {
      p_campania_id: campaniaId,
      p_desde: desde,
      p_hasta: hasta,
      p_agrupar: "dia",
      p_ciudad_id: null,
      p_colportor_ids: null,
    }),
  );
  if (leidas.length < TOPE_FILAS) return leidas;
  if (dias === 1) throw new RespuestaInesperada(RPC, `el día ${desde} trae ${leidas.length} filas o más y la respuesta puede estar cortada`);
  return partir();
}

interface ColportorAcumulado {
  id: string;
  nombre: string;
  apellido: string;
  nombreSolo: string;
  horasPorDia: Record<Fecha, number>;
}

interface CiudadAcumulada {
  id: string;
  nombre: string;
  colportores: Map<string, ColportorAcumulado>;
}

/**
 * El último día con horas, si desde entonces pasaron `DIAS_SIN_DATOS` o más días de trabajo (lunes a sábado) sin horas,
 * sin contar `hoy` ni lo que quede después de `ultimoDia` (el último día de una campaña terminada); si no, `null`.
 */
export function sinDatosDesde(horasPorDia: Record<Fecha, number>, hoy: Fecha, ultimoDia: Fecha): Fecha | null {
  const conHoras = Object.keys(horasPorDia).sort();
  const ultimoConHoras = conHoras[conHoras.length - 1];
  if (ultimoConHoras === undefined) return null;
  const hasta = sumarDias(hoy, -1) < ultimoDia ? sumarDias(hoy, -1) : ultimoDia;
  let sinHoras = 0;
  for (let dia = sumarDias(ultimoConHoras, 1); dia <= hasta; dia = sumarDias(dia, 1)) {
    const esDomingo = diasEntre(lunesDe(dia), dia) === 6;
    if (!esDomingo && !(dia in horasPorDia)) sinHoras++;
  }
  return sinHoras >= DIAS_SIN_DATOS ? ultimoConHoras : null;
}

// Las ventas por día todavía no tienen RPC: sin datos (vacío) hasta que se conecten, como mostraba la vista antes de #61.
function ordenarColportores(colportores: Map<string, ColportorAcumulado>, hoy: Fecha, ultimoDia: Fecha): ColportorHoras[] {
  return [...colportores.values()]
    .sort((a, b) => COLLATOR.compare(a.apellido, b.apellido) || COLLATOR.compare(a.nombreSolo, b.nombreSolo))
    .map((a): ColportorHoras => ({ id: a.id, nombre: a.nombre, horasPorDia: a.horasPorDia, ventasPorDia: {}, sinDatosDesde: sinDatosDesde(a.horasPorDia, hoy, ultimoDia) }));
}

export function crearFuenteReportesRpc(
  cliente: ClienteRpc,
  campaniaElegida: () => Promise<string | null> = async () => null,
  ahora: () => Date = () => new Date(),
): Pick<FuenteDatosReportes, "obtenerHoras"> {
  async function obtenerHoras(): Promise<DatosHoras | null> {
    const campania = await campaniaProvisoriaConFechas(cliente, await campaniaElegida());
    if (!campania) return null;

    const hoy = hoyEnMontevideo(ahora());
    // Una campaña por empezar no tiene horas que leer (la RPC rechazaría un rango al revés).
    if (campania.fechaInicio > hoy) return null;
    const hasta = campania.fechaFin !== null && campania.fechaFin < hoy ? campania.fechaFin : hoy;

    let filasDeHoras: Objeto[];
    let inscriptos: unknown;
    let departamentoDe: Map<string, string | null>;
    try {
      [filasDeHoras, inscriptos, departamentoDe] = await Promise.all([
        leerHoras(cliente, campania.id, campania.fechaInicio, hasta),
        cliente.llamarRpc(RPC_INSCRIPTOS, { p_campania_id: campania.id }),
        departamentos(cliente, campania.id),
      ]);
    } catch (error) {
      if (campaniaYaNoVigente(error)) return null;
      throw error;
    }

    const ciudades = new Map<string, CiudadAcumulada>();
    const sinZona: CiudadAcumulada = { id: ID_SIN_ZONA, nombre: NOMBRE_SIN_ZONA, colportores: new Map() };

    const grupoDe = (rpc: string, fila: Objeto): CiudadAcumulada => {
      const ciudadId = cadenaONula(rpc, fila, "ciudad_id");
      if (ciudadId === null) return sinZona;
      let existente = ciudades.get(ciudadId);
      if (!existente) {
        existente = { id: ciudadId, nombre: cadenaONula(rpc, fila, "ciudad_nombre") ?? "Ciudad sin nombre", colportores: new Map() };
        ciudades.set(ciudadId, existente);
      }
      return existente;
    };

    const colportorDe = (rpc: string, ciudad: CiudadAcumulada, fila: Objeto): ColportorAcumulado => {
      const colportorId = cadena(rpc, fila, "colportor_id");
      let acumulado = ciudad.colportores.get(colportorId);
      if (!acumulado) {
        const nombre = cadenaONula(rpc, fila, "nombre") ?? "";
        const apellido = cadenaONula(rpc, fila, "apellido") ?? "";
        acumulado = {
          id: colportorId,
          nombre: nombreVisible(nombre, apellido, "Colportor sin nombre"),
          apellido,
          nombreSolo: nombre,
          horasPorDia: {},
        };
        ciudad.colportores.set(colportorId, acumulado);
      }
      return acumulado;
    };

    const conHoras = new Set<string>();
    for (const fila of filasDeHoras) {
      const acumulado = colportorDe(RPC, grupoDe(RPC, fila), fila);
      conHoras.add(acumulado.id);

      // El colportor figura aunque este día no tenga jornadas; el día solo entra si tuvo alguna cerrada.
      const horas = numero(RPC, fila, "horas");
      if (numero(RPC, fila, "jornadas") > 0) {
        const fecha = dia(RPC, fila, "periodo_inicio");
        acumulado.horasPorDia[fecha] = Math.round(((acumulado.horasPorDia[fecha] ?? 0) + horas) * 100) / 100;
      }
    }

    // Los inscriptos que todavía no tienen ninguna jornada cerrada figuran sin horas (guion), en su ciudad o sin zona.
    for (const fila of filas(RPC_INSCRIPTOS, inscriptos)) {
      if (conHoras.has(cadena(RPC_INSCRIPTOS, fila, "colportor_id"))) continue;
      colportorDe(RPC_INSCRIPTOS, grupoDe(RPC_INSCRIPTOS, fila), fila);
    }

    const aCiudad = (c: CiudadAcumulada, departamento: string | null): CiudadHoras => ({
      id: c.id,
      nombre: c.nombre,
      departamento,
      colportores: ordenarColportores(c.colportores, hoy, hasta),
    });

    const lista = [...ciudades.values()]
      .sort((a, b) => COLLATOR.compare(a.nombre, b.nombre))
      .map((c) => aCiudad(c, departamentoDe.get(c.id) ?? null));
    if (sinZona.colportores.size > 0) lista.push(aCiudad(sinZona, null));

    return { inicioCampania: campania.fechaInicio, finCampania: campania.fechaFin, hoy, ciudades: lista };
  }

  return { obtenerHoras };
}
