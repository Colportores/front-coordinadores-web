import { describe, expect, it, vi } from "vitest";

import { crearFuentePestanaRpc } from "@/datos/equipo/pestana-rpc";
import { ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";

/**
 * #194: las lecturas de Equipo piden todas las páginas de las RPC de lista (backend-supabase#290, 0196). Una base que
 * corta en 1000 filas (`max_rows`) sin los parámetros de paginación no puede dejar una lista incompleta.
 */
const CAMPANIA = "11111111-1111-4111-8111-111111111111";
const RIVERA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const AHORA = () => new Date("2026-10-22T01:30:00Z");

const campania = { id: CAMPANIA, nombre: "Primavera 2026", tipo: "PRIMAVERA", fecha_inicio: "2026-09-01", fecha_fin: "2026-12-19" };

const idDe = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const ciudad = { campania_ciudad_id: "x1", ciudad_id: RIVERA, nombre: "Rivera", departamento: "Rivera", lat_centro: 0, lon_centro: 0, zoom_inicial: 12, cantidad_zonas: 1 };

const colportor = (n: number) => ({
  colportor_id: idDe(n),
  nombre: `Colportor ${n}`,
  apellido: "Prueba",
  ciudad_id: RIVERA,
  ciudad_nombre: "Rivera",
  zona_id: "z-1",
  zona_nombre: "Centro",
  zona_desde: "2026-10-06",
  zona_desde_inicial: false,
  zonas_anteriores: [],
  casas_registradas: 1,
});

const acompanamiento = (n: number) => ({
  jornada_id: idDe(100000 + n),
  colportor_id: idDe(n % 2300),
  nombre: "Colportor",
  apellido: "Prueba",
  dia: "2026-10-02",
  horas: 1,
  en_curso: false,
  acompaniante_id: "m",
  acompaniante_nombre: "Mariana",
  acompaniante_apellido: "Pérez",
  acompaniamiento_origen: "COORDINADOR",
  acompaniamiento_nota: null,
  acompaniamiento_cargado_por: null,
  acompaniamiento_cargado_por_nombre: null,
  acompaniamiento_cargado_por_apellido: null,
});

const tabla = (n: number) => ({
  colportor_id: idDe(n),
  nombre: "Colportor",
  apellido: "Prueba",
  ciudad_id: RIVERA,
  ciudad_nombre: "Rivera",
  acompaniamientos: 1,
  ultimo_dia: "2026-10-02",
  dias_sin_acompaniar: 19,
  contado_desde: "2026-09-01",
});

const inscripto = (n: number) => ({ usuario_id: idDe(n), nombre: "Colportor", apellido: "Prueba", zona_id: null, zona_nombre: null, suspendido: n === 2250, email: "c@example.com", estado: "ACTIVA" });

const desde = (cuantas: number, hacer: (n: number) => unknown) => Array.from({ length: cuantas }, (_, n) => hacer(n));

/** Una base que pagina como la 0196 y que, sin `p_limite`, corta en 1000 como PostgREST. */
function base(listas: Record<string, unknown[]>, falla?: { rpc: string; desplazamiento: number; error: Error }) {
  const llamarRpc = vi.fn<(nombre: string, argumentos: Record<string, unknown>) => Promise<unknown>>(async (nombre, argumentos) => {
    if (nombre === "mi_perfil") return [{ usuario_id: "m", nombre: "Mariana", apellido: "Pérez" }];
    if (nombre === "campanias_del_coordinador") return [campania];
    if (nombre === "carreras_de_beca" || nombre === "becas_de_campania") throw new ErrorSupabase("Could not find the function", 404, "PGRST202");
    const lista = listas[nombre];
    if (!lista) throw new Error(`RPC inesperada: ${nombre}`);
    const limite = (argumentos.p_limite as number | undefined) ?? 1000;
    const salto = (argumentos.p_desplazamiento as number | undefined) ?? 0;
    if (falla && falla.rpc === nombre && falla.desplazamiento === salto) throw falla.error;
    return lista.slice(salto, salto + limite);
  });
  return { cliente: { llamarRpc } as unknown as ClienteRpc, llamarRpc };
}

const listas = () => ({
  ciudades_de_campania: [ciudad],
  zonas_por_colportor: desde(2300, colportor),
  historial_de_acompaniamientos: desde(1400, acompanamiento),
  acompaniamientos_por_colportor: desde(2300, tabla),
  colportores_de_campania: desde(2300, inscripto),
});

describe("Equipo pide todas las páginas de sus listas (#194)", () => {
  it("con más de 1000 colportores y más de 1000 acompañamientos, la vista los trae a todos", async () => {
    const { cliente, llamarRpc } = base(listas());

    const datos = await crearFuentePestanaRpc(cliente, AHORA).obtenerEquipoPorCiudad();

    expect(datos?.colportores).toHaveLength(2300);
    // El colportor 2250 es el que la base marca suspendido: viene en la tercera página de `colportores_de_campania`.
    expect(datos?.colportores.find((c) => c.id === idDe(2250))?.suspendido).toBe(true);
    expect(datos?.colportores.map((c) => c.acompanamientos.length).reduce((a, b) => a + b, 0)).toBe(1400);
    for (const rpc of ["zonas_por_colportor", "acompaniamientos_por_colportor", "colportores_de_campania"]) {
      expect(llamarRpc.mock.calls.filter(([nombre]) => nombre === rpc).map(([, a]) => a.p_desplazamiento)).toEqual([0, 1000, 2000]);
    }
    expect(llamarRpc.mock.calls.filter(([nombre]) => nombre === "historial_de_acompaniamientos").map(([, a]) => a.p_desplazamiento)).toEqual([0, 1000]);
  });

  it("si la segunda página de una lista falla, la vista falla entera: no muestra una lista parcial como si estuviera completa", async () => {
    const caida = new ErrorSupabase("Servicio no disponible", 503);
    const { cliente } = base(listas(), { rpc: "zonas_por_colportor", desplazamiento: 1000, error: caida });

    await expect(crearFuentePestanaRpc(cliente, AHORA).obtenerEquipoPorCiudad()).rejects.toBe(caida);
  });

  it("las jornadas de un colportor también se piden hasta el final", async () => {
    const jornada = (n: number) => ({
      jornada_id: idDe(n),
      dia: "2026-10-02",
      horas: 4,
      acompaniante_id: null,
      acompaniante_nombre: null,
      acompaniante_apellido: null,
    });
    const { cliente, llamarRpc } = base({ ...listas(), jornadas_cerradas_de_colportor: desde(1100, jornada) });

    await crearFuentePestanaRpc(cliente, AHORA).jornadasParaAcompanar(CAMPANIA, idDe(1));

    expect(llamarRpc.mock.calls.filter(([nombre]) => nombre === "jornadas_cerradas_de_colportor").map(([, a]) => a.p_desplazamiento)).toEqual([0, 1000]);
  });
});
