import type { CampaniaElegible, FuenteDatosShell, ResumenCoordinador } from "@/datos/shell/contrato";
import type { ClienteRpc } from "@/datos/supabase/cliente";
import { cadena, cadenaONula, filas, nombreVisible } from "@/datos/supabase/respuesta";

/**
 * Fuente del shell contra las RPC de Supabase (ADR-013): `mi_perfil()` (nombre y apellido; las iniciales las arma el
 * panel) y `campanias_del_coordinador()` con `ciudades_de_campania()` de cada una (el topbar muestra «<ciudades> ·
 * <campaña>» y ofrece elegir entre las en curso y las por empezar, #70). Habla con un `ClienteRpc`, o sea con el JWT
 * del coordinador; de dónde sale esa sesión no es cosa de este archivo.
 *
 * **Ninguna falla se toma por una lista vacía**: una caída, un 5xx o una sesión vencida salen como excepción. «Sin
 * campaña» es solo la lista que contestó vacía.
 */

/** El día de hoy en Montevideo, `AAAA-MM-DD`: la base cuenta los días en esa zona (`hoy_montevideo()`). */
export function hoyEnMontevideo(ahora: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo" }).format(ahora);
}

/** Texto para el avatar: la inicial del nombre y la del apellido, o «?» si la cuenta no tiene ninguno. */
export function inicialesDe(nombre: string, apellido: string): string {
  const iniciales = [nombre, apellido]
    .map((parte) => Array.from(parte.trim())[0]?.toLocaleUpperCase("es") ?? "")
    .join("");
  return iniciales || "?";
}

/** Lo que muestra el botón del topbar para una campaña: las ciudades y el nombre. */
export function resumenDeCampania(campania: CampaniaElegible | undefined): Pick<ResumenCoordinador, "region" | "campania" | "campaniaId"> {
  if (!campania) return { region: "", campania: "Sin campaña", campaniaId: null };
  return { region: campania.ciudades.join(" · "), campania: campania.nombre, campaniaId: campania.id };
}

/**
 * @param campaniaElegida el id que guardó la coordinadora en el selector (cookie del navegador); se confía solo si figura
 *   en su lista. Sin elegir, o si ya no figura, la campaña que se ve es la primera: las en curso vienen antes.
 * @param ahora el reloj, para decidir si una campaña ya empezó.
 */
export function crearFuenteShellRpc(
  cliente: ClienteRpc,
  campaniaElegida: () => Promise<string | null>,
  ahora: () => Date = () => new Date(),
): FuenteDatosShell {
  async function listarCampanias(): Promise<CampaniaElegible[]> {
    const rpc = "campanias_del_coordinador";
    const hoy = hoyEnMontevideo(ahora());
    const campanias = filas(rpc, await cliente.llamarRpc(rpc, {}));
    return Promise.all(
      campanias.map(async (fila): Promise<CampaniaElegible> => {
        const id = cadena(rpc, fila, "id");
        const fechaInicio = cadena(rpc, fila, "fecha_inicio");
        const ciudades = filas(
          "ciudades_de_campania",
          await cliente.llamarRpc("ciudades_de_campania", { p_campania_id: id }),
        ).map((c) => cadena("ciudades_de_campania", c, "nombre"));
        return {
          id,
          nombre: cadena(rpc, fila, "nombre"),
          ciudades,
          fechaInicio,
          fechaFin: cadenaONula(rpc, fila, "fecha_fin"),
          estado: fechaInicio > hoy ? "por-empezar" : "en-curso",
        };
      }),
    );
  }

  return {
    listarCampanias,

    async obtenerResumenCoordinador(): Promise<ResumenCoordinador> {
      const [perfil, campanias, elegida] = await Promise.all([
        cliente.llamarRpc("mi_perfil", {}),
        listarCampanias(),
        campaniaElegida(),
      ]);
      const [fila] = filas("mi_perfil", perfil);
      const nombre = fila ? cadena("mi_perfil", fila, "nombre") : "";
      const apellido = fila ? cadena("mi_perfil", fila, "apellido") : "";
      const campania = campanias.find((c) => c.id === elegida) ?? campanias[0];
      return {
        nombre: nombreVisible(nombre, apellido, "Coordinador"),
        iniciales: inicialesDe(nombre, apellido),
        ...resumenDeCampania(campania),
      };
    },
  };
}
