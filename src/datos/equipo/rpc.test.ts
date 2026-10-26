import { describe, expect, it, vi } from "vitest";

import { CUENTAS_POR_PAGINA } from "@/datos/equipo/contrato";
import { crearFuenteAnadirRpc } from "@/datos/equipo/rpc";
import { ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import { RespuestaInesperada } from "@/datos/supabase/respuesta";
import { crearClienteRpc } from "@/datos/supabase/sdk";
import { crearSupabasePrueba, json, respuestaDeSesion } from "@/test/supabase";

const CAMPANIA = "11111111-1111-4111-8111-111111111111";
const ANA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTRA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/** Una fila de `buscar_candidatos()` (migración 0015). */
function fila(parcial: Record<string, unknown> = {}) {
  return {
    usuario_id: ANA,
    nombre: "Ana",
    apellido: "Martínez",
    email: "ana.martinez@example.com",
    estado: "PENDIENTE_ASIGNACION",
    campania_actual: null,
    creada_en: "2026-09-22T15:30:00.123456+00:00",
    motivo_bloqueo: null,
    ...parcial,
  };
}

type Respuestas = Record<string, unknown>;

/** Un cliente que contesta por nombre de RPC: el valor tal cual, o lo que tire si es una función. */
function clienteCon(respuestas: Respuestas) {
  const llamarRpc = vi.fn<(nombre: string, argumentos: Record<string, unknown>) => Promise<unknown>>(async (nombre) => {
    const respuesta = respuestas[nombre];
    if (typeof respuesta === "function") return (respuesta as () => unknown)();
    if (respuesta instanceof Error) throw respuesta;
    return respuesta;
  });
  return { cliente: { llamarRpc } as unknown as ClienteRpc, llamarRpc };
}

const rechazo = (codigo: string, mensaje: string, detalle = "", estado = 400) => new ErrorSupabase(mensaje, estado, codigo, detalle);

describe("fuente de la vista 23 contra las RPC", () => {
  describe("obtenerAnadirColportor", () => {
    const campanias = [
      { id: CAMPANIA, nombre: "Verano 2026", tipo: "VERANO", fecha_inicio: "2026-09-01", fecha_fin: "2026-12-31" },
      { id: OTRA, nombre: "Otoño", tipo: "OTONO", fecha_inicio: "2027-03-01", fecha_fin: null },
    ];
    const equipo = [
      {
        usuario_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        nombre: "Diego",
        apellido: "Rocha",
        zona_id: "z1",
        zona_nombre: "Cerro Norte",
        suspendido: false,
        email: "diego@example.com",
        estado: "ACTIVA",
      },
      {
        usuario_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        nombre: "",
        apellido: "",
        zona_id: null,
        zona_nombre: null,
        suspendido: false,
        email: "sin.nombre@example.com",
        estado: "ACTIVA",
      },
    ];

    it("toma la primera campaña del coordinador y trae los sugeridos y el equipo con las RPC del contrato", async () => {
      const { cliente, llamarRpc } = clienteCon({
        campanias_del_coordinador: campanias,
        buscar_candidatos: [fila()],
        colportores_de_campania: equipo,
      });

      const datos = await crearFuenteAnadirRpc(cliente).obtenerAnadirColportor();

      expect(datos).toEqual({
        campaniaId: CAMPANIA,
        campania: "Verano 2026",
        sugeridos: [
          {
            id: ANA,
            nombre: "Ana Martínez",
            email: "ana.martinez@example.com",
            estadoCuenta: "pendiente_asignacion",
            campaniaActual: null,
            cuentaCreada: "2026-09-22",
          },
        ],
        equipoActual: [
          { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", nombre: "Diego Rocha", zonaNombre: "Cerro Norte" },
          // Sin nombre ni apellido: el email, para que la fila no quede sin título.
          { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", nombre: "sin.nombre@example.com", zonaNombre: null },
        ],
      });
      expect(llamarRpc).toHaveBeenCalledWith("campanias_del_coordinador", {});
      expect(llamarRpc).toHaveBeenCalledWith("buscar_candidatos", { p_campania_id: CAMPANIA, p_texto: null, p_despues_de: null });
      expect(llamarRpc).toHaveBeenCalledWith("colportores_de_campania", { p_campania_id: CAMPANIA });
    });

    it("trabaja con la campaña que eligió la coordinadora en el topbar (#70), aunque no sea la primera", async () => {
      const { cliente, llamarRpc } = clienteCon({
        campanias_del_coordinador: campanias,
        buscar_candidatos: [],
        colportores_de_campania: [],
      });

      const datos = await crearFuenteAnadirRpc(cliente, async () => OTRA).obtenerAnadirColportor();

      expect(datos).toMatchObject({ campaniaId: OTRA, campania: "Otoño" });
      expect(llamarRpc).toHaveBeenCalledWith("buscar_candidatos", { p_campania_id: OTRA, p_texto: null, p_despues_de: null });
      expect(llamarRpc).toHaveBeenCalledWith("colportores_de_campania", { p_campania_id: OTRA });
    });

    it("una elegida que ya no figura en su lista (cookie vieja o ajena) vuelve a la primera", async () => {
      const { cliente, llamarRpc } = clienteCon({
        campanias_del_coordinador: campanias,
        buscar_candidatos: [],
        colportores_de_campania: [],
      });

      const datos = await crearFuenteAnadirRpc(cliente, async () => "99999999-9999-4999-8999-999999999999").obtenerAnadirColportor();

      expect(datos).toMatchObject({ campaniaId: CAMPANIA });
      expect(llamarRpc).toHaveBeenCalledWith("colportores_de_campania", { p_campania_id: CAMPANIA });
    });

    it("sin campañas que no hayan terminado no hay a quién añadir: `null`, y no pregunta por candidatos", async () => {
      const { cliente, llamarRpc } = clienteCon({ campanias_del_coordinador: [] });

      expect(await crearFuenteAnadirRpc(cliente).obtenerAnadirColportor()).toBeNull();
      expect(llamarRpc).toHaveBeenCalledTimes(1);
    });

    it("si la primera campaña todavía no empezó (`CI002`: solo se inscribe en una vigente), `null`", async () => {
      const { cliente } = clienteCon({
        campanias_del_coordinador: campanias,
        buscar_candidatos: rechazo("CI002", "La campaña no está activa: solo se inscribe en una campaña vigente."),
        colportores_de_campania: [],
      });

      expect(await crearFuenteAnadirRpc(cliente).obtenerAnadirColportor()).toBeNull();
    });

    it("`CZ011` (campaña terminada), permiso o caída no son «sin campaña»: siguen como excepción", async () => {
      for (const error of [
        rechazo("CZ011", "La campaña ya terminó."),
        rechazo("42501", "Solo el coordinador de la campaña…", "", 403),
        new TypeError("fetch failed"),
      ]) {
        const { cliente } = clienteCon({ campanias_del_coordinador: campanias, buscar_candidatos: [], colportores_de_campania: error });
        await expect(crearFuenteAnadirRpc(cliente).obtenerAnadirColportor()).rejects.toBe(error);
      }
    });

    it("si no se puede ni listar las campañas, es una excepción (la página muestra el error con «Reintentar»)", async () => {
      const caida = new ErrorSupabase("Bad Gateway", 502);
      const { cliente } = clienteCon({ campanias_del_coordinador: caida });

      await expect(crearFuenteAnadirRpc(cliente).obtenerAnadirColportor()).rejects.toBe(caida);
    });

    it("un estado de cuenta que el panel no conoce no se inventa: es una respuesta inesperada", async () => {
      const { cliente } = clienteCon({
        campanias_del_coordinador: campanias,
        buscar_candidatos: [fila({ estado: "ARCHIVADA" })],
        colportores_de_campania: [],
      });

      await expect(crearFuenteAnadirRpc(cliente).obtenerAnadirColportor()).rejects.toBeInstanceOf(RespuestaInesperada);
    });
  });

  describe("buscarCandidatos", () => {
    it("pide la página con el texto y el cursor, y mapea cada cuenta", async () => {
      const { cliente, llamarRpc } = clienteCon({
        buscar_candidatos: [
          fila(),
          fila({ usuario_id: OTRA, nombre: "Rodrigo", apellido: "Silva", estado: "ACTIVA", campania_actual: "Otoño Norte", motivo_bloqueo: "EN_OTRA_CAMPANIA" }),
          fila({ usuario_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", nombre: "Mariana", apellido: "Olivera", estado: "SUSPENDIDA", motivo_bloqueo: "USUARIO_SUSPENDIDO" }),
        ],
      });

      const resultado = await crearFuenteAnadirRpc(cliente).buscarCandidatos(CAMPANIA, "  ana ", ANA);

      expect(llamarRpc).toHaveBeenCalledExactlyOnceWith("buscar_candidatos", { p_campania_id: CAMPANIA, p_texto: "ana", p_despues_de: ANA });
      expect(resultado).toMatchObject({ ok: true, hayMas: false });
      expect(resultado.ok && resultado.candidatos.map((c) => [c.nombre, c.estadoCuenta, c.campaniaActual])).toEqual([
        ["Ana Martínez", "pendiente_asignacion", null],
        ["Rodrigo Silva", "activa", "Otoño Norte"],
        ["Mariana Olivera", "suspendida", null],
      ]);
    });

    it("una página llena (10) avisa que puede haber más; una de 9, no", async () => {
      const diez = Array.from({ length: CUENTAS_POR_PAGINA }, (_, i) => fila({ usuario_id: `${i}0000000-0000-4000-8000-000000000000` }));
      const llena = await crearFuenteAnadirRpc(clienteCon({ buscar_candidatos: diez }).cliente).buscarCandidatos(CAMPANIA, "x", null);
      const corta = await crearFuenteAnadirRpc(clienteCon({ buscar_candidatos: diez.slice(1) }).cliente).buscarCandidatos(CAMPANIA, "x", null);

      expect(llena).toMatchObject({ ok: true, hayMas: true });
      expect(corta).toMatchObject({ ok: true, hayMas: false });
    });

    it("sin texto (o solo espacios) no llama al servidor: no hay búsqueda, hay sugeridos", async () => {
      const { cliente, llamarRpc } = clienteCon({ buscar_candidatos: [fila()] });

      expect(await crearFuenteAnadirRpc(cliente).buscarCandidatos(CAMPANIA, "   ", null)).toEqual({ ok: true, candidatos: [], hayMas: false });
      expect(llamarRpc).not.toHaveBeenCalled();
    });

    it("manda a lo sumo 100 caracteres del texto", async () => {
      const { cliente, llamarRpc } = clienteCon({ buscar_candidatos: [] });

      await crearFuenteAnadirRpc(cliente).buscarCandidatos(CAMPANIA, "x".repeat(5000), null);

      const mandado = llamarRpc.mock.calls[0][1].p_texto as string;
      expect(mandado).toHaveLength(100);
    });

    it("un cursor que no es una cuenta no llega al servidor: hay que buscar de nuevo desde el principio", async () => {
      const { cliente, llamarRpc } = clienteCon({ buscar_candidatos: [] });

      const resultado = await crearFuenteAnadirRpc(cliente).buscarCandidatos(CAMPANIA, "ana", "no-es-un-uuid");

      expect(resultado).toMatchObject({ ok: false, reiniciar: true });
      expect(llamarRpc).not.toHaveBeenCalled();
    });

    it.each([
      ["22023", "No se encontró la última cuenta de la página anterior. Volvé a buscar desde el principio.", true],
      ["42501", "Solo el coordinador de la campaña puede buscar cuentas para inscribir en ella.", undefined],
    ])("%s se traduce a su mensaje", async (codigo, mensaje, reiniciar) => {
      const estado = codigo === "42501" ? 403 : 400;
      const { cliente } = clienteCon({ buscar_candidatos: rechazo(codigo, "texto técnico del servidor", "", estado) });

      const resultado = await crearFuenteAnadirRpc(cliente).buscarCandidatos(CAMPANIA, "ana", null);

      expect(resultado).toEqual({ ok: false, mensaje, ...(reiniciar ? { reiniciar } : {}) });
    });

    it.each([
      ["CI001", "La campaña no existe."],
      ["CI002", "La campaña no está activa: solo se inscribe en una campaña vigente."],
    ])("%s sale con el texto de la base", async (codigo, mensaje) => {
      const { cliente } = clienteCon({ buscar_candidatos: rechazo(codigo, mensaje) });

      expect(await crearFuenteAnadirRpc(cliente).buscarCandidatos(CAMPANIA, "ana", null)).toEqual({ ok: false, mensaje });
    });

    it("un rechazo que el panel no conoce no muestra el texto técnico de la base", async () => {
      const { cliente } = clienteCon({ buscar_candidatos: rechazo("PGRST202", "Could not find the function public.buscar_candidatos") });

      const resultado = await crearFuenteAnadirRpc(cliente).buscarCandidatos(CAMPANIA, "ana", null);

      expect(resultado).toEqual({ ok: false, mensaje: "No se pudo buscar cuentas. Probá de nuevo más tarde." });
    });

    it.each([
      ["red caída", new TypeError("fetch failed")],
      ["servicio caído (5xx)", new ErrorSupabase("Bad Gateway", 502)],
      ["límite de tráfico (429)", new ErrorSupabase("Too Many Requests", 429)],
      ["sesión vencida", new ErrorSupabase("JWT expired", 401, "PGRST301")],
    ])("%s no es un rechazo: sigue como excepción para que la vista diga «sin conexión»", async (_caso, error) => {
      const { cliente } = clienteCon({ buscar_candidatos: error });

      await expect(crearFuenteAnadirRpc(cliente).buscarCandidatos(CAMPANIA, "ana", null)).rejects.toBe(error);
    });

    it("una fila con la fecha rota o sin el nombre es una respuesta inesperada, no una cuenta a medias", async () => {
      for (const rota of [fila({ creada_en: "ayer" }), fila({ nombre: null }), fila({ campania_actual: 5 })]) {
        const { cliente } = clienteCon({ buscar_candidatos: [rota] });
        await expect(crearFuenteAnadirRpc(cliente).buscarCandidatos(CAMPANIA, "ana", null)).rejects.toBeInstanceOf(RespuestaInesperada);
      }
      const { cliente } = clienteCon({ buscar_candidatos: { no: "es una lista" } });
      await expect(crearFuenteAnadirRpc(cliente).buscarCandidatos(CAMPANIA, "ana", null)).rejects.toBeInstanceOf(RespuestaInesperada);
    });

    it("la fecha de creación es el día de Montevideo: a las 23:30 de allá (02:30 UTC) sigue siendo ese día", async () => {
      const { cliente } = clienteCon({ buscar_candidatos: [fila({ creada_en: "2026-09-23T02:30:00+00:00" })] });

      const resultado = await crearFuenteAnadirRpc(cliente).buscarCandidatos(CAMPANIA, "ana", null);

      expect(resultado.ok && resultado.candidatos[0].cuentaCreada).toBe("2026-09-22");
    });
  });

  describe("inscribirColportor", () => {
    it("inscribe con los ids del contrato y dice que salió bien", async () => {
      const { cliente, llamarRpc } = clienteCon({ inscribir_colportor: { id: "x", campania_id: CAMPANIA, usuario_id: ANA } });

      expect(await crearFuenteAnadirRpc(cliente).inscribirColportor(CAMPANIA, ANA)).toEqual({ ok: true });
      expect(llamarRpc).toHaveBeenCalledExactlyOnceWith("inscribir_colportor", { p_campania_id: CAMPANIA, p_usuario_id: ANA });
    });

    it.each([
      ["CI001", "La campaña no existe."],
      ["CI002", "La campaña no está activa: solo se inscribe en una campaña vigente."],
      ["CI003", "El usuario no existe o fue dado de baja."],
      ["CI004", "El usuario todavía no verificó su email."],
      ["CI005", "La cuenta está suspendida. Contactá al administrador."],
      ["CI006", "Ya está inscripto en esta campaña."],
    ])("%s sale con el texto de la base", async (codigo, mensaje) => {
      const { cliente } = clienteCon({ inscribir_colportor: rechazo(codigo, mensaje) });

      expect(await crearFuenteAnadirRpc(cliente).inscribirColportor(CAMPANIA, ANA)).toEqual({ ok: false, mensaje });
    });

    it.each([
      ["CI001", "La campaña no existe."],
      ["CI002", "La campaña no está activa: solo se inscribe en una campaña vigente."],
      ["CI003", "El usuario no existe o fue dado de baja."],
      ["CI004", "El usuario todavía no verificó su email."],
      ["CI005", "La cuenta está suspendida. Contactá al administrador."],
      ["CI006", "Ya está inscripto en esta campaña."],
    ])("%s sin mensaje de la base cae al texto del contrato", async (codigo, mensaje) => {
      const { cliente } = clienteCon({ inscribir_colportor: rechazo(codigo, "") });

      expect(await crearFuenteAnadirRpc(cliente).inscribirColportor(CAMPANIA, ANA)).toEqual({ ok: false, mensaje });
    });

    it("CI007 dice en qué campaña está, con el literal de la HU, y trae la campaña del `details`", async () => {
      const detalle = JSON.stringify({ campania_id: OTRA, campania_nombre: "Otoño Norte" });
      const { cliente } = clienteCon({ inscribir_colportor: rechazo("CI007", "Está en campaña Otoño Norte. Reasignar primero.", detalle) });

      expect(await crearFuenteAnadirRpc(cliente).inscribirColportor(CAMPANIA, ANA)).toEqual({
        ok: false,
        mensaje: "Está en campaña Otoño Norte. Reasignar primero.",
        campaniaEnConflicto: { id: OTRA, nombre: "Otoño Norte" },
      });
    });

    it("CI007 sin mensaje arma el literal con el `details`; sin ninguno de los dos, uno genérico", async () => {
      const detalle = JSON.stringify({ campania_id: OTRA, campania_nombre: "Otoño Norte" });
      const conDetalle = clienteCon({ inscribir_colportor: rechazo("CI007", "", detalle) }).cliente;
      const sinNada = clienteCon({ inscribir_colportor: rechazo("CI007", "", "esto no es json") }).cliente;

      expect(await crearFuenteAnadirRpc(conDetalle).inscribirColportor(CAMPANIA, ANA)).toMatchObject({
        ok: false,
        mensaje: "Está en campaña Otoño Norte. Reasignar primero.",
      });
      expect(await crearFuenteAnadirRpc(sinNada).inscribirColportor(CAMPANIA, ANA)).toEqual({
        ok: false,
        mensaje: "Está en otra campaña. Reasignar primero.",
      });
    });

    it("42501 (solo el coordinador de la campaña) sale con un texto en castellano, no el de PostgREST", async () => {
      const { cliente } = clienteCon({ inscribir_colportor: rechazo("42501", "permission denied for function inscribir_colportor", "", 403) });

      expect(await crearFuenteAnadirRpc(cliente).inscribirColportor(CAMPANIA, ANA)).toEqual({
        ok: false,
        mensaje: "Solo el coordinador de la campaña puede inscribir colportores en ella.",
      });
    });

    it("CI008 ya no lo manda la base (0028 reactiva la inscripción): si llegara, no se rompe y no muestra su texto técnico", async () => {
      const { cliente } = clienteCon({ inscribir_colportor: rechazo("CI008", "") });

      expect(await crearFuenteAnadirRpc(cliente).inscribirColportor(CAMPANIA, ANA)).toEqual({
        ok: false,
        mensaje: "No se pudo añadir la cuenta. Probá de nuevo más tarde.",
      });
    });

    it("un código que el panel no conoce (incluso uno que existe en `Object.prototype`) no muestra el texto de la base", async () => {
      for (const codigo of ["XX000", "22P02", "constructor", "toString", ""]) {
        const { cliente } = clienteCon({ inscribir_colportor: rechazo(codigo, "texto técnico") });
        expect(await crearFuenteAnadirRpc(cliente).inscribirColportor(CAMPANIA, ANA)).toEqual({
          ok: false,
          mensaje: "No se pudo añadir la cuenta. Probá de nuevo más tarde.",
        });
      }
    });

    it("un id de cuenta que no es un UUID no llega a la base: la cuenta no existe", async () => {
      const { cliente, llamarRpc } = clienteCon({ inscribir_colportor: {} });

      expect(await crearFuenteAnadirRpc(cliente).inscribirColportor(CAMPANIA, "'; drop table usuario; --")).toEqual({
        ok: false,
        mensaje: "El usuario no existe o fue dado de baja.",
      });
      expect(llamarRpc).not.toHaveBeenCalled();
    });

    it.each([
      ["red caída", new TypeError("fetch failed")],
      ["servicio caído (5xx)", new ErrorSupabase("Bad Gateway", 503)],
      ["tiempo agotado (408)", new ErrorSupabase("Request Timeout", 408)],
      ["sesión vencida", new ErrorSupabase("JWT expired", 401, "PGRST301")],
    ])("%s no es un rechazo: sigue como excepción (la vista dice «sin conexión»)", async (_caso, error) => {
      const { cliente } = clienteCon({ inscribir_colportor: error });

      await expect(crearFuenteAnadirRpc(cliente).inscribirColportor(CAMPANIA, ANA)).rejects.toBe(error);
    });
  });

  describe("con el cliente de verdad (supabase-js sobre un PostgREST falso)", () => {
    it("el `details` de CI007 que manda PostgREST llega hasta la campaña en conflicto", async () => {
      const { supabase } = crearSupabasePrueba((l) =>
        l.ruta === "/auth/v1/token"
          ? respuestaDeSesion()
          : json(
              {
                code: "CI007",
                message: "Está en campaña Otoño Norte. Reasignar primero.",
                details: JSON.stringify({ campania_id: OTRA, campania_nombre: "Otoño Norte" }),
                hint: null,
              },
              400,
            ),
      );
      await supabase.auth.signInWithPassword({ email: "coordinador@example.com", password: "clave" });

      const resultado = await crearFuenteAnadirRpc(crearClienteRpc(supabase)).inscribirColportor(CAMPANIA, ANA);

      expect(resultado).toEqual({
        ok: false,
        mensaje: "Está en campaña Otoño Norte. Reasignar primero.",
        campaniaEnConflicto: { id: OTRA, nombre: "Otoño Norte" },
      });
    });

    it("una página de `buscar_candidatos` viaja por POST con el JWT del coordinador", async () => {
      const { supabase, llamadas } = crearSupabasePrueba((l) =>
        l.ruta === "/auth/v1/token" ? respuestaDeSesion({ token: "token-del-coordinador" }) : json([fila()]),
      );
      await supabase.auth.signInWithPassword({ email: "coordinador@example.com", password: "clave" });

      const resultado = await crearFuenteAnadirRpc(crearClienteRpc(supabase)).buscarCandidatos(CAMPANIA, "ana", null);

      expect(resultado).toMatchObject({ ok: true, hayMas: false });
      expect(llamadas.find((l) => l.ruta === "/rest/v1/rpc/buscar_candidatos")).toMatchObject({
        metodo: "POST",
        token: "token-del-coordinador",
        cuerpo: { p_campania_id: CAMPANIA, p_texto: "ana", p_despues_de: null },
      });
    });

    it("un 403 de permiso se traduce y una caída de red sigue como excepción", async () => {
      const permiso = crearSupabasePrueba(() => json({ code: "42501", message: "permission denied", details: null, hint: null }, 403));
      const sinRed = crearSupabasePrueba(() => {
        throw new TypeError("fetch failed");
      });

      expect(await crearFuenteAnadirRpc(crearClienteRpc(permiso.supabase)).inscribirColportor(CAMPANIA, ANA)).toMatchObject({
        ok: false,
        mensaje: "Solo el coordinador de la campaña puede inscribir colportores en ella.",
      });
      await expect(crearFuenteAnadirRpc(crearClienteRpc(sinRed.supabase)).inscribirColportor(CAMPANIA, ANA)).rejects.toBeTruthy();
    });
  });
});
