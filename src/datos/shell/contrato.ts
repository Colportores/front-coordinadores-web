/**
 * Contrato de datos del shell: lo que el topbar necesita del coordinador.
 * Es lo que después implementa la RPC del perfil propio de Supabase (backend-supabase#54), sin BFF
 * (ADR-013). La RPC devuelve nombre y apellido; las iniciales las arma el panel. La lista de campañas que se
 * eligen desde el topbar es `campanias_del_coordinador()` (backend-supabase#82) más las ciudades de cada una.
 */

export interface ResumenCoordinador {
  /** Nombre para mostrar (accesible), no se pinta en el topbar. */
  nombre: string;
  /** Iniciales del avatar del topbar. */
  iniciales: string;
  /** Ciudad o ciudades de la campaña que se ve, separadas por « · » (vacío si no hay campaña). */
  region: string;
  /** Campaña que se ve, o «Sin campaña» si la coordinadora no tiene ninguna en curso ni por empezar. */
  campania: string;
  /** `null` si no hay campaña. */
  campaniaId: string | null;
}

/** Una campaña de las que se eligen desde el topbar: en curso o por empezar (las terminadas no se ofrecen). */
export interface CampaniaElegible {
  id: string;
  nombre: string;
  /** Nombres de las ciudades de la campaña; vacío si todavía no se agregó ninguna. */
  ciudades: string[];
  /** Día en que empieza, `AAAA-MM-DD`. */
  fechaInicio: string;
  /** Día en que termina, `AAAA-MM-DD`; `null` si no tiene fin. */
  fechaFin: string | null;
  estado: "en-curso" | "por-empezar";
}

export interface FuenteDatosShell {
  /** La campaña que se ve es la que eligió la coordinadora; si no eligió o ya no está en su lista, la primera de la lista. */
  obtenerResumenCoordinador(): Promise<ResumenCoordinador>;
  /** En curso primero y después las por empezar, en el orden de la RPC. */
  listarCampanias(): Promise<CampaniaElegible[]>;
}

/** Lo que el topbar recibe al pedir la lista: la lista, o por qué no se pudo traer (la causa decide el texto del aviso). */
export type ResultadoCampanias =
  | { ok: true; campanias: CampaniaElegible[] }
  | { ok: false; causa: "sin-conexion" | "error" };
