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
import { esDiaIso, hoyEnMontevideo } from "@/lib/dias";

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
 * Lo que queda sin conectar (ver los pendientes del PR): `sinDatosDesde` es siempre `null` (cuándo corresponde avisar «sin
 * datos desde» está a la espera de Cristian).
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

function ordenarColportores(colportores: Map<string, ColportorAcumulado>): ColportorHoras[] {
  return [...colportores.values()]
    .sort((a, b) => COLLATOR.compare(a.apellido, b.apellido) || COLLATOR.compare(a.nombreSolo, b.nombreSolo))
    .map((a): ColportorHoras => ({ id: a.id, nombre: a.nombre, horasPorDia: a.horasPorDia, sinDatosDesde: null }));
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

    let respuesta: unknown;
    let inscriptos: unknown;
    let departamentoDe: Map<string, string | null>;
    try {
      [respuesta, inscriptos, departamentoDe] = await Promise.all([
        cliente.llamarRpc(RPC, {
          p_campania_id: campania.id,
          p_desde: campania.fechaInicio,
          p_hasta: hasta,
          p_agrupar: "dia",
          p_ciudad_id: null,
          p_colportor_ids: null,
        }),
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
    for (const fila of filas(RPC, respuesta)) {
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
      colportores: ordenarColportores(c.colportores),
    });

    const lista = [...ciudades.values()]
      .sort((a, b) => COLLATOR.compare(a.nombre, b.nombre))
      .map((c) => aCiudad(c, departamentoDe.get(c.id) ?? null));
    if (sinZona.colportores.size > 0) lista.push(aCiudad(sinZona, null));

    return { inicioCampania: campania.fechaInicio, finCampania: campania.fechaFin, hoy, ciudades: lista };
  }

  return { obtenerHoras };
}
