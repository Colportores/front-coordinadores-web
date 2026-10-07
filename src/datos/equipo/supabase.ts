import type { DatosEquipo, FilaColportor, FuenteDatosEquipo } from "@/datos/equipo/contrato";
import type { ClienteSupabase } from "@/datos/supabase/cliente";

/**
 * Fuente de Equipo contra el proyecto de Supabase de la demo (issue #45). Solo para desarrollo: la
 * enciende `src/datos/equipo/index.ts` cuando hay variables de Supabase y el build no es de producción.
 *
 * Lee la campaña del coordinador de la sesión y sus inscriptos con `colportores_de_campania()` (HU-CAM-004
 * y HU-CAM-006). Lo que todavía no tiene fuente real queda vacío o con «—», sin inventar números: horas,
 * ventas, cobro, última sincronización, precios por ciudad y acompañamientos. Añadir e inscribir colportores
 * (`obtenerAnadirColportor`, `inscribirColportor`) siguen siendo los simulados.
 */

interface CampaniaRemota {
  id: string;
  nombre: string;
  campania_ciudad: { ciudad: { id: string; nombre: string } | null }[];
}

interface ColportorRemoto {
  usuario_id: string;
  nombre: string;
  apellido: string;
  zona_id: string | null;
  zona_nombre: string | null;
  suspendido: boolean;
  email: string;
  estado: string;
}

const SIN_DATO = "—";

/** La campaña vigente más reciente del coordinador; las políticas RLS ya limitan a las suyas. */
const CONSULTA_CAMPANIA =
  "campania?select=id,nombre,campania_ciudad(ciudad(id,nombre))" +
  "&deleted_at=is.null&campania_ciudad.deleted_at=is.null&order=created_at.desc&limit=1";

function nombreCompleto(c: ColportorRemoto): string {
  return `${c.nombre} ${c.apellido}`.trim();
}

function filaColportor(c: ColportorRemoto, ciudad: { id: string; nombre: string }): FilaColportor {
  return {
    id: c.usuario_id,
    nombre: nombreCompleto(c),
    // La ciudad por colportor no viene en la lectura: se usa la de la campaña (la primera, si hay varias).
    ciudadId: ciudad.id,
    ciudadNombre: ciudad.nombre,
    zonas: c.zona_nombre ? [c.zona_nombre] : [],
    horasSemana: SIN_DATO,
    ventas: SIN_DATO,
    porcentajeCobrado: 0,
    estadoCobro: "bien",
    ultimaSync: SIN_DATO,
    sincronizacionVieja: false,
  };
}

const DATOS_VACIOS: DatosEquipo = {
  region: "Sin campaña vigente",
  colportores: [],
  sinZonaAsignada: [],
  preciosPorCiudad: [],
  acompanamiento: {
    ultimosAcompanamientos: [],
    jornadasRecientes: [],
    acompaniante: "Coordinador",
    jornadasAcompanadas: 0,
    jornadasTotales: 0,
  },
};

export function crearFuenteEquipoSupabase(
  cliente: ClienteSupabase,
  simulada: FuenteDatosEquipo,
): FuenteDatosEquipo {
  return {
    async obtenerEquipo() {
      const [campania] = await cliente.consultar<CampaniaRemota[]>(CONSULTA_CAMPANIA);
      if (!campania) return DATOS_VACIOS;

      const ciudades = campania.campania_ciudad.flatMap((cc) => (cc.ciudad ? [cc.ciudad] : []));
      const ciudad = ciudades[0] ?? { id: campania.id, nombre: campania.nombre };
      const inscriptos = await cliente.llamarRpc<ColportorRemoto[]>("colportores_de_campania", {
        p_campania_id: campania.id,
      });

      return {
        ...DATOS_VACIOS,
        region: ciudades.length > 0 ? ciudades.map((c) => c.nombre).join(", ") : campania.nombre,
        colportores: inscriptos.map((c) => filaColportor(c, ciudad)),
        sinZonaAsignada: inscriptos
          .filter((c) => !c.zona_id)
          .map((c) => ({ id: c.usuario_id, nombre: nombreCompleto(c), nota: c.email })),
      };
    },

    obtenerAnadirColportor: () => simulada.obtenerAnadirColportor(),
    inscribirColportor: (campaniaId, usuarioId) => simulada.inscribirColportor(campaniaId, usuarioId),
  };
}
