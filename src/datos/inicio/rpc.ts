import type {
  CiudadDelDia,
  ColportorDelDia,
  ColportorSinZona,
  EstadoJornada,
  FuenteDatosInicio,
  OpcionesTablero,
  TableroDelDia,
} from "@/datos/inicio/contrato";
import { hoyEnMontevideo } from "@/datos/shell/rpc";
import { campaniaProvisoriaConFechas } from "@/datos/supabase/campania-provisoria";
import { causaDe, ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import {
  booleano,
  cadena,
  cadenaONula,
  lista,
  listaDeObjetos,
  nombreVisible,
  numero,
  objeto,
  RespuestaInesperada,
  UUID,
  type Objeto,
} from "@/datos/supabase/respuesta";
import { llamarRpcPorPaginas } from "@/datos/supabase/paginas";

/**
 * Fuente de la vista 31 (Inicio, HU-CAM-008) contra las RPC de Supabase (ADR-013): `tablero_de_inicio()` (migraciones
 * 0054 y 0055: el día entero, por ciudad y por colportor, en una sola llamada) y `ciudades_de_campania()` (0066) para el
 * departamento de cada ciudad, que el tablero no trae. Habla con un `ClienteRpc`, o sea con el JWT del coordinador.
 *
 * Una falla de conexión, de servicio o de sesión sale como excepción: **ninguna falla se toma por «sin colportores»**.
 * Un rechazo de la base (`42501`, `22023`) sale como `RechazoDelTablero`, con el texto que la base manda para mostrar.
 *
 * `pendientes` (tickets de depósito y pedidos de libros) es siempre `[]` en la base hasta V2 (HU-COB-008, HU-STK-003): no
 * tienen forma acordada todavía, así que lo que llegue ahí se ignora en vez de romper la pantalla.
 */

const RPC = "tablero_de_inicio";
const RPC_CIUDADES = "ciudades_de_campania";

/** La base contestó que no a esta lectura (sin permiso, día futuro): `message` es el texto para mostrar. */
export class RechazoDelTablero extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "RechazoDelTablero";
  }
}

const SIN_PERMISO = "Solo el coordinador de la campaña puede ver su tablero. Entrá con la cuenta del coordinador de esta campaña.";
const NO_SE_PUDO_LEER = "No se pudo leer el tablero de Inicio. Probá de nuevo más tarde.";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const ESTADOS: Record<string, EstadoJornada> = {
  EN_JORNADA: "en-jornada",
  SIN_CERRAR: "sin-cerrar",
  FINALIZADA: "finalizada",
  SIN_INICIAR: "sin-iniciar",
};

function estadoDe(fila: Objeto): EstadoJornada {
  const estado = ESTADOS[cadena(RPC, fila, "estado")];
  if (!estado) throw new RespuestaInesperada(RPC, "`estado` no es uno de los conocidos");
  return estado;
}

function nombreDe(fila: Objeto): string {
  return nombreVisible(cadena(RPC, fila, "nombre"), cadena(RPC, fila, "apellido"), "Colportor sin nombre");
}

function aColportor(fila: Objeto): ColportorDelDia {
  return {
    id: cadena(RPC, fila, "colportor_id"),
    nombre: nombreDe(fila),
    estado: estadoDe(fila),
    horas: numero(RPC, fila, "horas"),
    presentaciones: numero(RPC, fila, "presentaciones"),
    ventas: numero(RPC, fila, "ventas"),
    montoCentavos: numero(RPC, fila, "monto_total"),
    ultimoPushAt: cadenaONula(RPC, fila, "ultimo_push_at"),
  };
}

function aSinZona(fila: Objeto): ColportorSinZona {
  return {
    id: cadena(RPC, fila, "colportor_id"),
    nombre: nombreDe(fila),
    estado: estadoDe(fila),
    deBaja: booleano(RPC, fila, "inscripcion_de_baja"),
    inscriptoAt: cadena(RPC, fila, "inscripto_at"),
    ultimoPushAt: cadenaONula(RPC, fila, "ultimo_push_at"),
  };
}

/** La campaña se terminó o se dio de baja entre una llamada y la siguiente. */
function campaniaYaNoVigente(error: unknown): boolean {
  return error instanceof ErrorSupabase && (error.codigo === "CZ001" || error.codigo === "CZ011");
}

interface CiudadDeCampania {
  id: string;
  nombre: string;
  departamento: string | null;
}

/** Las ciudades de la campaña, en el orden de la base (el del topbar). Una campaña terminada no deja leerlas (CZ011): sin ciudades. */
async function ciudadesDeCampania(cliente: ClienteRpc, campaniaId: string): Promise<CiudadDeCampania[]> {
  try {
    const ciudades = await llamarRpcPorPaginas(cliente, RPC_CIUDADES, { p_campania_id: campaniaId });
    return ciudades.map((c) => ({
      id: cadena(RPC_CIUDADES, c, "ciudad_id"),
      nombre: cadena(RPC_CIUDADES, c, "nombre"),
      departamento: cadenaONula(RPC_CIUDADES, c, "departamento"),
    }));
  } catch (error) {
    if (error instanceof ErrorSupabase && error.codigo === "CZ011") return [];
    throw error;
  }
}

/** @param ahora el reloj, para decidir si la campaña ya empezó (la base cuenta los días en Montevideo). */
export function crearFuenteInicioRpc(
  cliente: ClienteRpc,
  campaniaElegida: () => Promise<string | null>,
  ahora: () => Date = () => new Date(),
): FuenteDatosInicio {
  async function obtenerTablero(opciones: OpcionesTablero = {}): Promise<TableroDelDia | null> {
    if (opciones.fecha != null && !FECHA.test(opciones.fecha)) throw new RechazoDelTablero(NO_SE_PUDO_LEER);
    if (opciones.campaniaId !== undefined && !UUID.test(opciones.campaniaId)) throw new RechazoDelTablero(NO_SE_PUDO_LEER);

    // La campaña pedida (o la elegida en el topbar) tiene que seguir en la lista de la coordinadora: si terminó o se dio de
    // baja en el medio, es «sin campaña», no un tablero sin nombre.
    const campania = await campaniaProvisoriaConFechas(cliente, opciones.campaniaId ?? (await campaniaElegida()));
    if (!campania || (opciones.campaniaId !== undefined && campania.id !== opciones.campaniaId)) return null;
    const campaniaId = campania.id;

    let respuesta: unknown;
    let deLaCampania: CiudadDeCampania[];
    try {
      [respuesta, deLaCampania] = await Promise.all([
        cliente.llamarRpc(RPC, { p_campania_id: campaniaId, p_fecha: opciones.fecha ?? null }),
        ciudadesDeCampania(cliente, campaniaId),
      ]);
    } catch (error) {
      if (campaniaYaNoVigente(error)) return null;
      if (error instanceof ErrorSupabase && causaDe(error) === "rechazo") {
        throw new RechazoDelTablero(error.codigo === "42501" ? SIN_PERMISO : error.message !== "" ? error.message : NO_SE_PUDO_LEER);
      }
      throw error;
    }

    const porCiudad = new Map(deLaCampania.map((c) => [c.id, c.departamento]));
    const tablero = objeto(RPC, respuesta);
    lista(RPC, tablero, "pendientes");
    const ciudades: CiudadDelDia[] = listaDeObjetos(RPC, tablero, "ciudades").map((fila) => {
      const id = cadena(RPC, fila, "ciudad_id");
      return {
        id,
        nombre: cadena(RPC, fila, "nombre"),
        departamento: porCiudad.get(id) ?? null,
        colportores: listaDeObjetos(RPC, fila, "colportores").map(aColportor),
      };
    });

    return {
      campaniaId,
      campania: {
        nombre: campania.nombre,
        ciudades: (deLaCampania.length > 0 ? deLaCampania : ciudades).map((c) => c.nombre),
        fechaInicio: campania.fechaInicio,
        porEmpezar: campania.fechaInicio > hoyEnMontevideo(ahora()),
      },
      fecha: cadena(RPC, tablero, "fecha"),
      esHoy: booleano(RPC, tablero, "es_hoy"),
      calculadoA: cadena(RPC, tablero, "calculado_a"),
      ciudades,
      sinZona: listaDeObjetos(RPC, tablero, "sin_zona").map(aSinZona),
      pendientes: [],
    };
  }

  return { obtenerTablero };
}
