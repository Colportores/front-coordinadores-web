import type {
  AcompanamientoDeColportor,
  CiudadDeEquipo,
  ColportorDeEquipo,
  DatosEquipoPorCiudad,
  FuenteDatosEquipo,
  JornadaParaAcompanar,
  ResultadoAcompanamiento,
  ResultadoBeca,
  ResultadoJornadas,
  ZonaAnterior,
} from "@/datos/equipo/contrato";
import { campaniaProvisoriaConFechas } from "@/datos/supabase/campania-provisoria";
import { causaDe, ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import {
  booleano,
  cadena,
  cadenaONula,
  filas,
  listaDeObjetos,
  nombreVisible,
  numero,
  type Objeto,
  RespuestaInesperada,
  UUID,
} from "@/datos/supabase/respuesta";
import { esDiaIso, hoyEnMontevideo } from "@/lib/dias";

/**
 * Fuente de la vista 33 (HU-JOR-004, HU-CAM-006) contra las RPC de Supabase (ADR-013): `campanias_del_coordinador()`,
 * `ciudades_de_campania()`, `zonas_por_colportor()` (la zona de hoy, las anteriores con sus fechas y las casas),
 * `historial_de_acompaniamientos()` (todos los acompañamientos de la campaña de una sola vez),
 * `jornadas_cerradas_de_colportor()` y `agregar_acompaniamiento()`. Habla con un `ClienteRpc`, o sea con el JWT del
 * coordinador.
 *
 * Los «días sin acompañar» y el total de cada colportor no se piden a `acompaniamientos_por_colportor()`: salen del mismo
 * historial que se muestra en «Ver historial», así que la tabla y el historial no se pueden contradecir.
 *
 * Lo que la base todavía no tiene y por eso queda sin conectar: el departamento de cada ciudad (backend-supabase#92), la
 * nota y el origen del dato de un acompañamiento, elegir a otro colportor como acompañante y las solicitudes para entrar
 * a la campaña (`solicitudesPendientes` es siempre 0). Ver los pendientes del PR.
 *
 * Los rechazos de la base (`JO001`…`JO004`, `CZ001`, `CZ011`, `42501`, `22023`) se traducen al texto para mostrar: las
 * pantallas no conocen códigos. Una falla de conexión, de servicio o de sesión no es un rechazo y sale como excepción
 * (la vista la muestra como «sin conexión»). **Ninguna falla se toma por una lista vacía.**
 */

const CUENTA_SIN_NOMBRE = "Cuenta sin nombre";

/** Los códigos cuyo `message` es el texto para mostrar (migraciones 0006, 0008, 0033 y 0043). */
const CODIGOS_CON_TEXTO = new Set(["CZ001", "CZ011", "JO001", "JO002", "JO003", "JO004"]);

// Los mismos textos que manda la base, por si un rechazo llega sin mensaje o un id inválido se frena antes de llamar.
const SIN_PERMISO_JORNADAS = "Solo el coordinador de la campaña puede ver las jornadas de su equipo.";
const SIN_PERMISO_REGISTRAR = "Solo el coordinador de la campaña puede registrar acompañamientos en ella.";
const JORNADA_INEXISTENTE = "La jornada no existe o no es de un colportor de esta campaña. Recargá las jornadas y elegí otra.";
const COLPORTOR_FUERA_DE_CAMPANIA = "El colportor no está en esta campaña.";
const JORNADAS_RECHAZADAS = "No se pudieron traer las jornadas. Probá de nuevo más tarde.";
const REGISTRO_RECHAZADO = "No se pudo registrar el acompañamiento. Probá de nuevo más tarde.";

/** Un rechazo de la regla se traduce; una caída, un 5xx o una sesión vencida siguen como excepción. */
function esRechazo(error: unknown): error is ErrorSupabase {
  return error instanceof ErrorSupabase && causaDe(error) === "rechazo";
}

/** La campaña se terminó o se dio de baja entre una llamada y la siguiente: ya no hay campaña que mostrar. */
function campaniaYaNoVigente(error: unknown): boolean {
  return error instanceof ErrorSupabase && (error.codigo === "CZ001" || error.codigo === "CZ011");
}

function dia(rpc: string, fila: Objeto, campo: string): string {
  const valor = cadena(rpc, fila, campo);
  if (!esDiaIso(valor)) throw new RespuestaInesperada(rpc, `\`${campo}\` no es un día (${valor})`);
  return valor;
}

function horasONulas(rpc: string, fila: Objeto, campo: string): number | null {
  return fila[campo] === null || fila[campo] === undefined ? null : numero(rpc, fila, campo);
}

function aAnterior(rpc: string, tramo: Objeto): ZonaAnterior {
  return {
    nombre: cadena(rpc, tramo, "nombre"),
    desde: dia(rpc, tramo, "desde"),
    hasta: dia(rpc, tramo, "hasta"),
    eliminada: booleano(rpc, tramo, "eliminada"),
    inicial: booleano(rpc, tramo, "inicial"),
  };
}

/** Las jornadas acompañadas de la campaña por colportor, la más nueva primero (el orden en que las manda la base). */
function acompanamientosPorColportor(filasHistorial: Objeto[], yo: string | null): Map<string, AcompanamientoDeColportor[]> {
  const rpc = "historial_de_acompaniamientos";
  const porColportor = new Map<string, AcompanamientoDeColportor[]>();
  for (const fila of filasHistorial) {
    const colportorId = cadena(rpc, fila, "colportor_id");
    const lista = porColportor.get(colportorId) ?? [];
    lista.push({
      jornadaId: cadena(rpc, fila, "jornada_id"),
      dia: dia(rpc, fila, "dia"),
      horas: horasONulas(rpc, fila, "horas"),
      acompanante: nombreVisible(
        cadenaONula(rpc, fila, "acompaniante_nombre") ?? "",
        cadenaONula(rpc, fila, "acompaniante_apellido") ?? "",
        CUENTA_SIN_NOMBRE,
      ),
      acompananteEsVos: yo !== null && cadenaONula(rpc, fila, "acompaniante_id") === yo,
    });
    porColportor.set(colportorId, lista);
  }
  return porColportor;
}

/** El id de quien tiene la sesión (`mi_perfil()`), para escribir «(vos)» donde el acompañante es el propio coordinador. */
async function miId(cliente: ClienteRpc): Promise<string | null> {
  const rpc = "mi_perfil";
  const [fila] = filas(rpc, await cliente.llamarRpc(rpc, {}));
  return fila ? cadena(rpc, fila, "usuario_id") : null;
}

function aJornada(fila: Objeto, yo: string | null): JornadaParaAcompanar {
  const rpc = "jornadas_cerradas_de_colportor";
  const nombre = cadenaONula(rpc, fila, "acompaniante_nombre") ?? "";
  const apellido = cadenaONula(rpc, fila, "acompaniante_apellido") ?? "";
  const acompananteId = cadenaONula(rpc, fila, "acompaniante_id");
  return {
    id: cadena(rpc, fila, "jornada_id"),
    dia: dia(rpc, fila, "dia"),
    horas: numero(rpc, fila, "horas"),
    acompanante: acompananteId === null ? null : nombreVisible(nombre, apellido, CUENTA_SIN_NOMBRE),
    acompananteEsVos: acompananteId !== null && acompananteId === yo,
  };
}

function textoDeRechazo(error: ErrorSupabase, sinPermiso: string, generico: string): string {
  if (error.codigo === "42501") return sinPermiso;
  return CODIGOS_CON_TEXTO.has(error.codigo) && error.message !== "" ? error.message : generico;
}

type FuentePestana = Pick<
  FuenteDatosEquipo,
  "obtenerEquipoPorCiudad" | "jornadasParaAcompanar" | "registrarAcompanamiento" | "elegirCarrera" | "asignarTipoDeBeca"
>;

/** Las becas (V2) todavía no tienen RPC (se conectan después del 20/11): la vista no ofrece guardarlas con esta fuente. */
const BECAS_SIN_CONECTAR = "Las becas todavía no están conectadas a la base de datos, así que no se puede guardar este cambio.";

export function crearFuentePestanaRpc(cliente: ClienteRpc, ahora: () => Date = () => new Date()): FuentePestana {
  return {
    async obtenerEquipoPorCiudad(): Promise<DatosEquipoPorCiudad | null> {
      const campania = await campaniaProvisoriaConFechas(cliente);
      if (!campania) return null;
      const argumentos = { p_campania_id: campania.id };

      let respuestas: unknown[];
      try {
        respuestas = await Promise.all([
          cliente.llamarRpc("ciudades_de_campania", argumentos),
          cliente.llamarRpc("zonas_por_colportor", argumentos),
          cliente.llamarRpc("historial_de_acompaniamientos", { ...argumentos, p_colportor_id: null }),
          miId(cliente),
        ]);
      } catch (error) {
        if (campaniaYaNoVigente(error)) return null;
        throw error;
      }
      const [ciudadesCrudas, colportoresCrudos, historialCrudo, yo] = respuestas as [unknown, unknown, unknown, string | null];

      const ciudades = new Map<string, CiudadDeEquipo>();
      for (const fila of filas("ciudades_de_campania", ciudadesCrudas)) {
        const id = cadena("ciudades_de_campania", fila, "ciudad_id");
        ciudades.set(id, { id, nombre: cadena("ciudades_de_campania", fila, "nombre"), departamento: null });
      }

      const acompanamientos = acompanamientosPorColportor(filas("historial_de_acompaniamientos", historialCrudo), yo);
      const rpc = "zonas_por_colportor";
      const colportores: ColportorDeEquipo[] = filas(rpc, colportoresCrudos).map((fila) => {
        const id = cadena(rpc, fila, "colportor_id");
        const ciudadId = cadenaONula(rpc, fila, "ciudad_id");
        const ciudadNombre = cadenaONula(rpc, fila, "ciudad_nombre");
        // Una zona de una ciudad que la lista de la campaña no trae (se dio de baja): la ciudad figura igual.
        if (ciudadId !== null && ciudadNombre !== null && !ciudades.has(ciudadId)) {
          ciudades.set(ciudadId, { id: ciudadId, nombre: ciudadNombre, departamento: null });
        }
        const zonaId = cadenaONula(rpc, fila, "zona_id");
        return {
          id,
          nombre: nombreVisible(cadena(rpc, fila, "nombre"), cadena(rpc, fila, "apellido"), CUENTA_SIN_NOMBRE),
          ciudadId,
          zonaActual:
            zonaId === null
              ? null
              : {
                  id: zonaId,
                  nombre: cadena(rpc, fila, "zona_nombre"),
                  desde: dia(rpc, fila, "zona_desde"),
                  desdeInicial: booleano(rpc, fila, "zona_desde_inicial"),
                },
          zonasAnteriores: listaDeObjetos(rpc, fila, "zonas_anteriores").map((tramo) => aAnterior(rpc, tramo)),
          casasRegistradas: numero(rpc, fila, "casas_registradas"),
          acompanamientos: acompanamientos.get(id) ?? [],
        };
      });

      return {
        campaniaId: campania.id,
        campania: campania.nombre,
        campaniaInicio: campania.fechaInicio,
        campaniaFin: campania.fechaFin,
        hoy: hoyEnMontevideo(ahora()),
        ciudades: Array.from(ciudades.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
        colportores,
        solicitudesPendientes: 0,
        becas: null,
      };
    },

    async elegirCarrera(): Promise<ResultadoBeca> {
      return { ok: false, mensaje: BECAS_SIN_CONECTAR };
    },

    async asignarTipoDeBeca(): Promise<ResultadoBeca> {
      return { ok: false, mensaje: BECAS_SIN_CONECTAR };
    },

    async jornadasParaAcompanar(campaniaId, colportorId): Promise<ResultadoJornadas> {
      // El id del colportor viene del navegador: si no es una cuenta, no hay jornadas que pedir.
      if (!UUID.test(colportorId)) return { ok: false, mensaje: COLPORTOR_FUERA_DE_CAMPANIA };
      try {
        const [crudas, yo] = await Promise.all([
          cliente.llamarRpc("jornadas_cerradas_de_colportor", { p_campania_id: campaniaId, p_colportor_id: colportorId }),
          miId(cliente),
        ]);
        return { ok: true, jornadas: filas("jornadas_cerradas_de_colportor", crudas).map((f) => aJornada(f, yo)) };
      } catch (error) {
        if (esRechazo(error)) return { ok: false, mensaje: textoDeRechazo(error, SIN_PERMISO_JORNADAS, JORNADAS_RECHAZADAS) };
        throw error;
      }
    },

    async registrarAcompanamiento(campaniaId, jornadaId): Promise<ResultadoAcompanamiento> {
      if (!UUID.test(jornadaId)) return { ok: false, mensaje: JORNADA_INEXISTENTE, recargar: true };
      try {
        const rpc = "agregar_acompaniamiento";
        const [fila] = filas(rpc, await cliente.llamarRpc(rpc, { p_campania_id: campaniaId, p_jornada_id: jornadaId }));
        if (!fila) throw new RespuestaInesperada(rpc, "no devolvió el acompañamiento registrado");
        return {
          ok: true,
          dia: dia(rpc, fila, "dia"),
          acompanante: nombreVisible(
            cadenaONula(rpc, fila, "acompaniante_nombre") ?? "",
            cadenaONula(rpc, fila, "acompaniante_apellido") ?? "",
            CUENTA_SIN_NOMBRE,
          ),
          yaEstaba: booleano(rpc, fila, "ya_estaba"),
        };
      } catch (error) {
        if (!esRechazo(error)) throw error;
        // La jornada cambió (otra persona la acompañó, la cerraron o ya no es de la campaña): la lista que se ve ya no es cierta.
        const recargar = error.codigo === "JO001" || error.codigo === "JO002" || error.codigo === "JO003";
        return { ok: false, mensaje: textoDeRechazo(error, SIN_PERMISO_REGISTRAR, REGISTRO_RECHAZADO), ...(recargar ? { recargar } : {}) };
      }
    },
  };
}
