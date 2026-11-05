import { describe, expect, it } from "vitest";

import { MAX_SUGERIDOS, normalizarBusqueda, ordenarBusqueda, paginaDeBusqueda, sugeridosDe } from "@/datos/equipo/busqueda";
import { CUENTAS_POR_PAGINA, type CandidatoColportor } from "@/datos/equipo/contrato";
import { CANDIDATOS_SIMULADOS } from "@/datos/equipo/simulado";

const porId = (id: string) => {
  const c = CANDIDATOS_SIMULADOS.find((x) => x.id === id);
  if (!c) throw new Error(`falta ${id}`);
  return c;
};

function cuenta(id: string, nombre: string, parcial: Partial<CandidatoColportor> = {}): CandidatoColportor {
  return {
    id,
    nombre,
    email: `${id}@example.com`,
    estadoCuenta: "pendiente_asignacion",
    campaniaActual: null,
    enOtraCampania: false,
    cuentaCreada: "2026-09-01",
    ...parcial,
  };
}

describe("búsqueda simulada (las reglas de `buscar_candidatos()`)", () => {
  it("normalizarBusqueda: minúsculas, sin tildes y con los espacios colapsados", () => {
    expect(normalizarBusqueda("  JOSÉ   Peña ")).toBe("jose pena");
    expect(normalizarBusqueda("   ")).toBe("");
  });

  describe("sugeridosDe", () => {
    it("trae solo pendientes sin campaña, de la cuenta más nueva a la más antigua", () => {
      expect(sugeridosDe(CANDIDATOS_SIMULADOS).map((c) => c.nombre)).toEqual([
        "Rodrigo Barrios",
        "Valentina Bentancor",
        "Gonzalo Sosa",
        "Ana Martínez",
      ]);
    });

    it("con la misma fecha de creación desempata por id, siempre igual", () => {
      const mismoDia = ["c", "a", "b"].map((id) => ({ ...porId("usr-ana-martinez"), id, cuentaCreada: "2026-09-10" }));
      expect(sugeridosDe(mismoDia).map((c) => c.id)).toEqual(["a", "b", "c"]);
      expect(sugeridosDe([...mismoDia].reverse()).map((c) => c.id)).toEqual(["a", "b", "c"]);
    });

    it(`se limita a ${MAX_SUGERIDOS}`, () => {
      const muchos = Array.from({ length: 8 }, (_, i) => ({
        ...porId("usr-ana-martinez"),
        id: `x${i}`,
        cuentaCreada: `2026-09-0${i + 1}`,
      }));
      expect(sugeridosDe(muchos)).toHaveLength(MAX_SUGERIDOS);
      // Quedan fuera las tres más antiguas: entran las 5 más nuevas.
      expect(sugeridosDe(muchos).map((c) => c.id)).toEqual(["x7", "x6", "x5", "x4", "x3"]);
    });
  });

  describe("ordenarBusqueda", () => {
    it("busca por nombre o por email, sin distinguir mayúsculas ni tildes", () => {
      expect(ordenarBusqueda(CANDIDATOS_SIMULADOS, "ANA").map((c) => c.nombre)).toEqual([
        "Ana Martínez",
        "Anabel Pereira",
        "Mariana Olivera",
      ]);
      expect(ordenarBusqueda(CANDIDATOS_SIMULADOS, "vbentancor@").map((c) => c.nombre)).toEqual(["Valentina Bentancor"]);
      expect(ordenarBusqueda(CANDIDATOS_SIMULADOS, "martinez").map((c) => c.nombre)).toEqual(["Ana Martínez"]);
    });

    it("incluye las suspendidas y las de otra campaña, alfabético entre las que empiezan igual (Barrios antes que Silva)", () => {
      expect(ordenarBusqueda(CANDIDATOS_SIMULADOS, "rodrigo").map((c) => c.nombre)).toEqual(["Rodrigo Barrios", "Rodrigo Silva"]);
    });

    it("primero las que empiezan con lo escrito (nombre, apellido o email) y después el resto, alfabético", () => {
      const cuentas = [
        cuenta("1", "Zoe Lamarina Ruiz"), // «mari» está en el medio: no empieza.
        cuenta("2", "Mariano Lopez"), // el nombre empieza.
        cuenta("3", "Ana Maria Perez"), // el apellido («maria perez») empieza.
        cuenta("4", "Beatriz Gomez", { email: "mariani@example.com" }), // el email empieza.
        cuenta("5", "Diego Maria"), // el apellido empieza.
        cuenta("6", "Carla Amariani"), // «mari» está en el medio: no empieza.
      ];
      // Las que empiezan, por nombre (alfabético): Ana Maria, Beatriz, Diego, Mariano. Después las otras: Carla, Zoe.
      expect(ordenarBusqueda(cuentas, "mari").map((c) => c.id)).toEqual(["3", "4", "5", "2", "6", "1"]);
    });

    it("empiezan primero, aunque alfabéticamente vayan después", () => {
      const cuentas = [cuenta("a", "Abel Oscarlos Sosa"), cuenta("z", "Carlos Zubia")];
      expect(ordenarBusqueda(cuentas, "carlos").map((c) => c.id)).toEqual(["z", "a"]);
    });

    it("con el mismo nombre desempata por id, siempre igual", () => {
      const cuentas = [cuenta("b", "Igual Nombre"), cuenta("a", "Igual Nombre")];
      expect(ordenarBusqueda(cuentas, "igual").map((c) => c.id)).toEqual(["a", "b"]);
      expect(ordenarBusqueda([...cuentas].reverse(), "igual").map((c) => c.id)).toEqual(["a", "b"]);
    });

    it("sin texto no devuelve nada", () => {
      expect(ordenarBusqueda(CANDIDATOS_SIMULADOS, "  ")).toEqual([]);
    });
  });

  describe("paginaDeBusqueda", () => {
    const veinticinco = Array.from({ length: 25 }, (_, i) => cuenta(`u${String(i).padStart(2, "0")}`, `Persona ${String(i).padStart(2, "0")}`));

    it(`trae de a ${CUENTAS_POR_PAGINA} y dice si puede haber más`, () => {
      const primera = paginaDeBusqueda(veinticinco, "persona", null);
      expect(primera?.candidatos).toHaveLength(10);
      expect(primera?.hayMas).toBe(true);
      expect(primera?.candidatos[0].id).toBe("u00");
    });

    it("la página siguiente sigue a la última cuenta de la anterior, sin repetir ni saltear", () => {
      const primera = paginaDeBusqueda(veinticinco, "persona", null);
      const segunda = paginaDeBusqueda(veinticinco, "persona", primera?.candidatos.at(-1)?.id ?? null);
      const tercera = paginaDeBusqueda(veinticinco, "persona", segunda?.candidatos.at(-1)?.id ?? null);

      expect(segunda?.candidatos.map((c) => c.id)).toEqual(veinticinco.slice(10, 20).map((c) => c.id));
      expect(tercera?.candidatos).toHaveLength(5);
      expect(tercera?.hayMas).toBe(false);
    });

    it("una página justo llena avisa que puede haber más; la siguiente viene vacía", () => {
      const diez = veinticinco.slice(0, 10);
      expect(paginaDeBusqueda(diez, "persona", null)?.hayMas).toBe(true);
      expect(paginaDeBusqueda(diez, "persona", "u09")).toEqual({ candidatos: [], hayMas: false });
    });

    it("un cursor que no está en el resultado es `null` (el servidor responde 22023)", () => {
      expect(paginaDeBusqueda(veinticinco, "persona", "no-existe")).toBeNull();
    });
  });
});
