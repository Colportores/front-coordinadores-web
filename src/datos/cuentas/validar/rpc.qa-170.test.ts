import { describe, expect, it, vi } from "vitest";

import { crearAccionesValidarTicketsRpc, crearFuenteValidarTicketsRpc, type ClienteDeFunciones } from "@/datos/cuentas/validar/rpc";
import { ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";

/**
 * QA de la conexión de la vista 29 (#170, PR #173): lo que la base puede devolver y la fuente tiene que aguantar, y lo que no
 * tiene que salir al navegador. Lo que documenta un hallazgo va con `skip`.
 */

const CAMPANIA = "11111111-1111-4111-8111-111111111111";
const YO = "99999999-9999-4999-8999-999999999999";
const LUCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const T1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const T2 = "cccccccc-cccc-4ccc-8ccc-dddddddddddd";
const RUTA_DEL_BUCKET = `${LUCIA}/${T1}.jpg`;

type Argumentos = Record<string, unknown>;

function clienteCon(respuestas: Record<string, unknown>) {
  const llamarRpc = vi.fn(async (nombre: string, argumentos: Argumentos) => {
    if (!(nombre in respuestas)) throw new Error(`Sin respuesta preparada para ${nombre}`);
    const r = respuestas[nombre];
    const valor = typeof r === "function" ? await (r as (a: Argumentos) => unknown)(argumentos) : r;
    if (valor instanceof Error) throw valor;
    return valor;
  });
  return { cliente: { llamarRpc } as unknown as ClienteRpc, llamarRpc };
}

const ticket = (extra: Argumentos = {}) => ({
  ticket_id: T1,
  colportor_id: LUCIA,
  nombre: "Lucía",
  apellido: "Fernández",
  de_baja: false,
  ciudad_id: "c1",
  ciudad_nombre: "Rivera",
  departamento: "Rivera",
  tipo: "DEPOSITO",
  monto: 900000,
  fecha: "2026-11-09T21:30:00+00:00",
  numero_autorizacion: "0482",
  tarjeta_tipo: null,
  tarjeta_marca: null,
  estado: "PENDIENTE",
  motivo_rechazo: null,
  subido_en: "2026-11-09T22:02:00+00:00",
  revisado_por: null,
  revisado_en: null,
  tiene_foto: true,
  foto_ruta: RUTA_DEL_BUCKET,
  deposito_destino: "BANCO",
  deposito_concepto: "CASA_EDITORA",
  ...extra,
});

const lectura = (tickets: unknown, extra: Record<string, unknown> = {}) =>
  clienteCon({
    campanias_del_coordinador: [{ id: CAMPANIA, nombre: "Uruguay Norte" }],
    mi_perfil: [{ usuario_id: YO }],
    tickets_de_campania: tickets,
    retiros_de_campania: [],
    validacion_de_ticket: [{ en_mano: 1260000, deuda_antes: 1840000 }],
    ...extra,
  });

describe("la cola que sale al navegador", () => {
  it("no lleva la ruta de la foto en el bucket ni nada que no sea de la vista (la foto va por la Edge Function)", async () => {
    const { cliente } = lectura([ticket()]);
    const datos = await crearFuenteValidarTicketsRpc(cliente, async () => CAMPANIA).obtenerPorValidar();

    const serializado = JSON.stringify(datos);
    expect(serializado).not.toContain(RUTA_DEL_BUCKET);
    expect(serializado).not.toContain("foto_ruta");
    expect(serializado).not.toContain("tarjeta_marca");
    expect(datos.items).toHaveLength(1);
    expect(datos.items[0].tieneFoto).toBe(true);
  });

  it("un ticket por validar de un colportor dado de baja sigue en la cola", async () => {
    const { cliente } = lectura([ticket({ de_baja: true })]);
    const datos = await crearFuenteValidarTicketsRpc(cliente, async () => CAMPANIA).obtenerPorValidar();
    expect(datos.items.map((i) => i.id)).toEqual([T1]);
  });

  it("datos límite: un ticket sin fecha, sin ciudad y sin número de autorización se arma sin romper la cola", async () => {
    const { cliente } = lectura([ticket({ fecha: null, ciudad_nombre: null, numero_autorizacion: null })]);
    const [item] = (await crearFuenteValidarTicketsRpc(cliente, async () => CAMPANIA).obtenerPorValidar()).items;
    expect(item.ciudad).toBeNull();
    expect(item.fecha).toBe("2026-11-09T22:02:00+00:00");
    expect(item.numeroAutorizacion).toBeUndefined();
  });

  it("muchos: 1.250 depósitos por validar se leen en tres páginas y las previas se piden de a 6 como máximo", async () => {
    let enVuelo = 0;
    let maximo = 0;
    const todos = Array.from({ length: 1250 }, (_, i) => ticket({ ticket_id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}` }));
    const { cliente, llamarRpc } = lectura(
      (a: Argumentos) => todos.slice(a.p_desplazamiento as number, (a.p_desplazamiento as number) + (a.p_limite as number)),
      {
        validacion_de_ticket: async () => {
          enVuelo += 1;
          maximo = Math.max(maximo, enVuelo);
          await Promise.resolve();
          enVuelo -= 1;
          return [{ en_mano: 100, deuda_antes: 200 }];
        },
      },
    );
    const datos = await crearFuenteValidarTicketsRpc(cliente, async () => CAMPANIA).obtenerPorValidar();

    expect(datos.items).toHaveLength(1250);
    expect(llamarRpc.mock.calls.filter(([n]) => n === "tickets_de_campania").map(([, a]) => a.p_desplazamiento)).toEqual([0, 500, 1000]);
    expect(llamarRpc.mock.calls.filter(([n]) => n === "validacion_de_ticket")).toHaveLength(1250);
    expect(maximo).toBeLessThanOrEqual(6);
  });

  it.skip("QA #170: un ticket de depósito sin monto (la base lo permite) no tira abajo toda la cola", async () => {
    // `ticket_monto_check`: `monto is null or monto > 0`, y TV004 («el ticket no tiene monto… Rechazalo con un motivo») lo
    // prevé. Hoy `numero()` tira `RespuestaInesperada` y la página entera dice «No se pudieron cargar los tickets. Revisá tu
    // conexión»: ni «Reintentar» ni nada ayudan, y la coordinadora no ve ni rechaza ningún otro ticket.
    const { cliente } = lectura([ticket({ monto: null }), ticket({ ticket_id: T2, monto: 420000 })]);
    const datos = await crearFuenteValidarTicketsRpc(cliente, async () => CAMPANIA).obtenerPorValidar();
    expect(datos.items.map((i) => i.id)).toContain(T2);
    expect(datos.items.map((i) => i.id)).toContain(T1);
  });
});

describe("las decisiones", () => {
  const sinFunciones: ClienteDeFunciones = { invocarFuncion: vi.fn() };
  const resuelto = (campo: string) => [{ [campo]: "2026-11-10T14:00:00+00:00", ya_estaba: false }];

  it("dos decisiones a la vez sobre ítems distintos salen cada una con su id, sin mezclarse", async () => {
    const { cliente, llamarRpc } = clienteCon({ validar_ticket: resuelto("validado_en"), rechazar_ticket: resuelto("revisado_en") });
    const acciones = crearAccionesValidarTicketsRpc(cliente, sinFunciones);

    const [a, b] = await Promise.all([acciones.validar({ id: T1, tipo: "deposito" }), acciones.rechazar({ id: T2, tipo: "deposito" }, "Foto ilegible")]);

    expect(a.ok && b.ok).toBe(true);
    expect(llamarRpc.mock.calls).toEqual([
      ["validar_ticket", { p_ticket_id: T1 }],
      ["rechazar_ticket", { p_ticket_id: T2, p_motivo: "Foto ilegible" }],
    ]);
  });

  it("si una cae y la otra sale bien, la caída se relanza y la otra no se pierde", async () => {
    const { cliente } = clienteCon({
      validar_ticket: (a: Argumentos) => (a.p_ticket_id === T1 ? new ErrorSupabase("boom", 503) : resuelto("validado_en")),
    });
    const acciones = crearAccionesValidarTicketsRpc(cliente, sinFunciones);

    const [a, b] = await Promise.allSettled([acciones.validar({ id: T1, tipo: "deposito" }), acciones.validar({ id: T2, tipo: "deposito" })]);

    expect(a.status).toBe("rejected");
    expect(b.status === "fulfilled" && b.value.ok).toBe(true);
  });

  it("un motivo con caracteres especiales, HTML y saltos se manda tal cual (la base lo guarda como texto)", async () => {
    const { cliente, llamarRpc } = clienteCon({ rechazar_ticket: resuelto("revisado_en") });
    await crearAccionesValidarTicketsRpc(cliente, sinFunciones).rechazar({ id: T1, tipo: "deposito" }, '  <b>"a"</b> & ñ\n\tb  ');
    expect(llamarRpc).toHaveBeenCalledWith("rechazar_ticket", { p_ticket_id: T1, p_motivo: '<b>"a"</b> & ñ\n\tb' });
  });

  it.skip("QA #170: 300 emojis son 300 caracteres para la base y entran en el tope de 500", async () => {
    // La base cuenta caracteres (`length()` de PostgreSQL); `String.length` de JavaScript cuenta unidades UTF-16: cada emoji
    // son 2. 300 emojis dan 600 y la fuente los rechaza con «hasta 500 caracteres» sin llamar a la base. Mismo hallazgo que
    // el de la vista (#69), ahora también en la fuente.
    const { cliente, llamarRpc } = clienteCon({ rechazar_ticket: resuelto("revisado_en") });
    const r = await crearAccionesValidarTicketsRpc(cliente, sinFunciones).rechazar({ id: T1, tipo: "deposito" }, "😀".repeat(300));
    expect(r.ok).toBe(true);
    expect(llamarRpc).toHaveBeenCalledOnce();
  });
});

describe("la foto del ticket", () => {
  const MAYUSCULAS = "CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC";
  const { cliente } = clienteCon({});
  const funcion = (cuerpo: unknown, status = 200): ClienteDeFunciones => ({
    invocarFuncion: vi.fn(async () => new Response(JSON.stringify(cuerpo), { status })),
  });

  it("un 200 con un enlace que no es https (ni local) no se muestra; un 200 con campos de más solo deja pasar el enlace", async () => {
    expect((await crearAccionesValidarTicketsRpc(cliente, funcion({ url: "http://r2.example/x.jpg" })).enlaceDeFoto(T1)).ok).toBe(false);
    expect((await crearAccionesValidarTicketsRpc(cliente, funcion({ url: "javascript:alert(1)" })).enlaceDeFoto(T1)).ok).toBe(false);

    const bueno = await crearAccionesValidarTicketsRpc(cliente, funcion({ url: "https://r2.example/x.jpg?X-Amz-Signature=abc", clave: "no" })).enlaceDeFoto(T1);
    expect(bueno).toEqual({ ok: true, valor: "https://r2.example/x.jpg?X-Amz-Signature=abc" });
  });

  it("un id en mayúsculas con forma de uuid se acepta y va en minúsculas", async () => {
    const funciones = funcion({ url: "https://r2.example/x.jpg" });
    const r = await crearAccionesValidarTicketsRpc(cliente, funciones).enlaceDeFoto(MAYUSCULAS);
    expect(r.ok).toBe(true);
    expect(funciones.invocarFuncion).toHaveBeenCalledWith("foto-ticket", { accion: "ver", ticketId: MAYUSCULAS.toLowerCase() });
  });

  it("el aviso de la función sale tal cual, sin el resto del cuerpo ni un stack", async () => {
    const cuerpo = {
      error: { codigo: "sin_configurar", mensaje: "La foto de los tickets todavía no está configurada en este proyecto." },
      stack: "at x (/app/secret.ts:1)",
    };
    const r = await crearAccionesValidarTicketsRpc(cliente, funcion(cuerpo, 503)).enlaceDeFoto(T1);
    expect(r).toEqual({ ok: false, causa: "rechazado", mensaje: "La foto de los tickets todavía no está configurada en este proyecto." });
  });
});
