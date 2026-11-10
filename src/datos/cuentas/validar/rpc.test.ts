import { describe, expect, it, vi } from "vitest";

import type { ItemPorValidar } from "@/datos/cuentas/validar/contrato";
import {
  crearAccionesValidarTicketsRpc,
  crearFuenteValidarTicketsRpc,
  FILAS_POR_PAGINA,
  FUNCION_DE_LA_FOTO,
  funcionesDeSupabase,
  type ClienteDeFunciones,
} from "@/datos/cuentas/validar/rpc";
import { ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import { RespuestaInesperada } from "@/datos/supabase/respuesta";
import { crearClienteRpc } from "@/datos/supabase/sdk";
import { MENSAJE_SESION_VENCIDA } from "@/lib/mensajes";
import { crearSupabasePrueba, errorDePostgrest, json } from "@/test/supabase";

const CAMPANIA = "11111111-1111-4111-8111-111111111111";
const OTRA_CAMPANIA = "11111111-1111-4111-8111-222222222222";
const YO = "99999999-9999-4999-8999-999999999999";
const LUCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ANA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TICKET = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TICKET_2 = "cccccccc-cccc-4ccc-8ccc-dddddddddddd";
const TICKET_TARJETA = "cccccccc-cccc-4ccc-8ccc-eeeeeeeeeeee";
const TICKET_SIN_DEPOSITO = "cccccccc-cccc-4ccc-8ccc-ffffffffffff";
const RETIRO = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const RETIRO_PROPIO = "dddddddd-dddd-4ddd-8ddd-eeeeeeeeeeee";

type Respuesta = unknown | ((argumentos: Record<string, unknown>) => unknown);

function clienteCon(respuestas: Record<string, Respuesta>) {
  const llamarRpc = vi.fn<(nombre: string, argumentos: Record<string, unknown>) => Promise<unknown>>(async (nombre, argumentos) => {
    if (!(nombre in respuestas)) throw new Error(`Sin respuesta preparada para ${nombre}`);
    const respuesta = respuestas[nombre];
    const valor = typeof respuesta === "function" ? (respuesta as (a: Record<string, unknown>) => unknown)(argumentos) : respuesta;
    if (valor instanceof Error) throw valor;
    return valor;
  });
  return { cliente: { llamarRpc } as unknown as ClienteRpc, llamarRpc };
}

const rechazo = (codigo: string, mensaje = "", estado = 400) => new ErrorSupabase(mensaje, estado, codigo);

function ticket(extra: Record<string, unknown> = {}) {
  return {
    ticket_id: TICKET,
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
    foto_ruta: `${LUCIA}/${TICKET}.jpg`,
    deposito_destino: "BANCO",
    deposito_concepto: "CASA_EDITORA",
    ...extra,
  };
}

function retiro(extra: Record<string, unknown> = {}) {
  return {
    deposito_id: RETIRO,
    colportor_id: ANA,
    nombre: "Ana",
    apellido: "Benítez",
    de_baja: false,
    ciudad_id: "c2",
    ciudad_nombre: "Artigas",
    departamento: "Artigas",
    monto: 600000,
    fecha: "2026-11-10T11:00:00+00:00",
    concepto: "CASA_EDITORA",
    estado: "PENDIENTE",
    motivo_rechazo: null,
    subido_en: "2026-11-10T13:20:00+00:00",
    revisado_por: null,
    revisado_en: null,
    anulado_en: null,
    ...extra,
  };
}

const previa = (enMano: number | null, deudaAntes: number | null) => [{ en_mano: enMano, deuda_antes: deudaAntes, diferencia: 0 }];

/** Una campaña con un depósito y un retiro por validar, y las cifras de cada uno. */
function lecturaBasica(extra: Record<string, Respuesta> = {}) {
  return clienteCon({
    campanias_del_coordinador: [{ id: CAMPANIA, nombre: "Uruguay Norte" }],
    mi_perfil: [{ usuario_id: YO }],
    tickets_de_campania: [ticket()],
    retiros_de_campania: [retiro()],
    validacion_de_ticket: previa(1260000, 1840000),
    validacion_de_retiro: previa(940000, 2130000),
    ...extra,
  });
}

describe("crearFuenteValidarTicketsRpc · la cola", () => {
  it("arma la cola con los depósitos de tickets_de_campania y los retiros de retiros_de_campania, en pesos", async () => {
    const { cliente, llamarRpc } = lecturaBasica();
    const datos = await crearFuenteValidarTicketsRpc(cliente, async () => CAMPANIA).obtenerPorValidar();

    expect(datos.campaniaId).toBe(CAMPANIA);
    expect(Number.isNaN(Date.parse(datos.ahora))).toBe(false);
    expect(datos.items).toEqual<ItemPorValidar[]>([
      {
        id: TICKET,
        tipo: "deposito",
        colportorId: LUCIA,
        colportorNombre: "Lucía Fernández",
        esVos: false,
        ciudad: "Rivera",
        monto: 9000,
        concepto: "casa-editora",
        lugar: "banco",
        numeroAutorizacion: "0482",
        fecha: "2026-11-09T21:30:00+00:00",
        enviadoEn: "2026-11-09T22:02:00+00:00",
        estado: "PENDIENTE",
        tieneFoto: true,
        cifras: { enMano: 12600, deuda: 18400 },
      },
      {
        id: RETIRO,
        tipo: "retiro",
        colportorId: ANA,
        colportorNombre: "Ana Benítez",
        esVos: false,
        ciudad: "Artigas",
        monto: 6000,
        concepto: "casa-editora",
        fecha: "2026-11-10T11:00:00+00:00",
        enviadoEn: "2026-11-10T13:20:00+00:00",
        estado: "PENDIENTE",
        tieneFoto: false,
        cifras: { enMano: 9400, deuda: 21300 },
      },
    ]);
    expect(llamarRpc).toHaveBeenCalledWith("tickets_de_campania", { p_campania_id: CAMPANIA, p_limite: FILAS_POR_PAGINA, p_desplazamiento: 0 });
    expect(llamarRpc).toHaveBeenCalledWith("retiros_de_campania", { p_campania_id: CAMPANIA, p_limite: FILAS_POR_PAGINA, p_desplazamiento: 0 });
    expect(llamarRpc).toHaveBeenCalledWith("validacion_de_ticket", { p_ticket_id: TICKET });
    expect(llamarRpc).toHaveBeenCalledWith("validacion_de_retiro", { p_deposito_id: RETIRO });
  });

  it("lee la campaña elegida en el topbar; sin elegida (o una que ya no es suya), la primera", async () => {
    const campanias = [
      { id: CAMPANIA, nombre: "Uruguay Norte" },
      { id: OTRA_CAMPANIA, nombre: "Verano" },
    ];
    const elegida = lecturaBasica({ campanias_del_coordinador: campanias });
    expect((await crearFuenteValidarTicketsRpc(elegida.cliente, async () => OTRA_CAMPANIA).obtenerPorValidar()).campaniaId).toBe(OTRA_CAMPANIA);
    expect(elegida.llamarRpc).toHaveBeenCalledWith("tickets_de_campania", expect.objectContaining({ p_campania_id: OTRA_CAMPANIA }));

    const ajena = lecturaBasica({ campanias_del_coordinador: campanias });
    expect((await crearFuenteValidarTicketsRpc(ajena.cliente, async () => "otra-cosa").obtenerPorValidar()).campaniaId).toBe(CAMPANIA);
  });

  it("sin campaña que coordine, la cola queda vacía y no pide nada más", async () => {
    const { cliente, llamarRpc } = clienteCon({ campanias_del_coordinador: [] });
    const datos = await crearFuenteValidarTicketsRpc(cliente).obtenerPorValidar();
    expect(datos).toEqual({ campaniaId: "", ahora: expect.any(String), items: [] });
    expect(llamarRpc).toHaveBeenCalledTimes(1);
  });

  it("deja afuera los tickets que no son de depósito y los de un depósito que todavía no llegó del teléfono", async () => {
    const { cliente } = lecturaBasica({
      tickets_de_campania: [
        ticket(),
        ticket({ ticket_id: TICKET_TARJETA, tipo: "COBRO_TARJETA", deposito_destino: null, deposito_concepto: null }),
        ticket({ ticket_id: TICKET_SIN_DEPOSITO, deposito_destino: null, deposito_concepto: null }),
      ],
      retiros_de_campania: [],
    });
    const datos = await crearFuenteValidarTicketsRpc(cliente).obtenerPorValidar();
    expect(datos.items.map((i) => i.id)).toEqual([TICKET]);
  });

  it("traduce oficina, alquiler, tarjeta, lo resuelto por mí y el motivo del rechazo", async () => {
    const { cliente, llamarRpc } = lecturaBasica({
      tickets_de_campania: [
        ticket({
          ticket_id: TICKET_2,
          deposito_destino: "OFICINA",
          deposito_concepto: "ALQUILER",
          tarjeta_tipo: "DEBITO",
          numero_autorizacion: null,
          fecha: null,
          estado: "RECHAZADO",
          motivo_rechazo: "Foto ilegible",
          revisado_por: YO,
          revisado_en: "2026-11-10T12:00:00+00:00",
          tiene_foto: false,
        }),
      ],
      retiros_de_campania: [retiro({ estado: "VALIDADO", revisado_por: LUCIA, revisado_en: "2026-11-10T13:00:00+00:00" })],
    });
    const [deposito, confirmado] = (await crearFuenteValidarTicketsRpc(cliente).obtenerPorValidar()).items;

    expect(deposito).toMatchObject({
      lugar: "oficina",
      concepto: "alquiler",
      tarjeta: "debito",
      estado: "RECHAZADO",
      motivoRechazo: "Foto ilegible",
      resueltoEn: "2026-11-10T12:00:00+00:00",
      resueltoPorVos: true,
      tieneFoto: false,
      cifras: null,
      // Sin fecha del ticket, la de cuando llegó.
      fecha: "2026-11-09T22:02:00+00:00",
    });
    expect(deposito).not.toHaveProperty("numeroAutorizacion");
    expect(confirmado).toMatchObject({ estado: "VALIDADO", resueltoEn: "2026-11-10T13:00:00+00:00", resueltoPorVos: false });
    expect(confirmado).not.toHaveProperty("motivoRechazo");
    // Lo ya resuelto no pide vista previa.
    expect(llamarRpc).not.toHaveBeenCalledWith("validacion_de_ticket", expect.anything());
    expect(llamarRpc).not.toHaveBeenCalledWith("validacion_de_retiro", expect.anything());
  });

  it("lo propio sale marcado como tuyo y sin cifras (nadie valida lo suyo: la base daría 42501)", async () => {
    const { cliente, llamarRpc } = lecturaBasica({
      tickets_de_campania: [],
      retiros_de_campania: [retiro({ deposito_id: RETIRO_PROPIO, colportor_id: YO, nombre: "Marta", apellido: "Pérez" })],
    });
    const [propio] = (await crearFuenteValidarTicketsRpc(cliente).obtenerPorValidar()).items;
    expect(propio).toMatchObject({ id: RETIRO_PROPIO, esVos: true, colportorNombre: "Marta Pérez", cifras: null });
    expect(llamarRpc).not.toHaveBeenCalledWith("validacion_de_retiro", expect.anything());
  });

  it("sin cifras si la base no las calcula (campaña sin alquiler) o rechaza la pregunta (otra persona lo resolvió)", async () => {
    const { cliente } = lecturaBasica({
      validacion_de_ticket: previa(1260000, null),
      validacion_de_retiro: rechazo("DP002", "El retiro no existe o no es de un colportor de tus campañas. Recargá la lista."),
    });
    const items = (await crearFuenteValidarTicketsRpc(cliente).obtenerPorValidar()).items;
    expect(items.map((i) => i.cifras)).toEqual([null, null]);
  });

  it("una previa que se cae (5xx, red) deja sin cifras solo esa fila; la sesión vencida en la previa sí falla", async () => {
    const caida = lecturaBasica({ validacion_de_ticket: rechazo("", "Service Unavailable", 503), validacion_de_retiro: new TypeError("fetch failed") });
    const items = (await crearFuenteValidarTicketsRpc(caida.cliente).obtenerPorValidar()).items;
    expect(items.map((i) => [i.id, i.cifras])).toEqual([
      [TICKET, null],
      [RETIRO, null],
    ]);

    const vencida = lecturaBasica({ validacion_de_retiro: rechazo("PGRST301", "JWT expired", 401) });
    await expect(crearFuenteValidarTicketsRpc(vencida.cliente).obtenerPorValidar()).rejects.toMatchObject({ estado: 401 });
  });

  it("un ticket sin monto entra con `monto: null`, sin pedir su previa, y la cola sigue", async () => {
    const { cliente, llamarRpc } = lecturaBasica({ tickets_de_campania: [ticket({ monto: null }), ticket({ ticket_id: TICKET_2 })] });
    const items = (await crearFuenteValidarTicketsRpc(cliente).obtenerPorValidar()).items;
    expect(items.map((i) => [i.id, i.monto])).toEqual([
      [TICKET, null],
      [TICKET_2, 9000],
      [RETIRO, 6000],
    ]);
    // La previa se pide igual (la base devuelve sus cifras); lo que no se ofrece es validarlo (lo cuida la vista).
    expect(llamarRpc).toHaveBeenCalledWith("validacion_de_ticket", { p_ticket_id: TICKET });
  });

  it("un id repetido entre páginas (entró una fila entre las dos) sale una sola vez", async () => {
    const primera = Array.from({ length: FILAS_POR_PAGINA }, (_, i) =>
      ticket({ ticket_id: `cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, "0")}`, estado: "VALIDADO", revisado_en: "2026-11-01T00:00:00Z" }),
    );
    const { cliente } = lecturaBasica({
      tickets_de_campania: (a: Record<string, unknown>) => (a.p_desplazamiento === 0 ? primera : [primera[FILAS_POR_PAGINA - 1]]),
      retiros_de_campania: [],
    });
    const items = (await crearFuenteValidarTicketsRpc(cliente).obtenerPorValidar()).items;
    expect(items).toHaveLength(FILAS_POR_PAGINA);
    expect(new Set(items.map((i) => i.id)).size).toBe(FILAS_POR_PAGINA);
  });

  it("una cuenta sin nombre ni apellido no deja la fila sin título", async () => {
    const { cliente } = lecturaBasica({ tickets_de_campania: [ticket({ nombre: null, apellido: "" })], retiros_de_campania: [] });
    const [item] = (await crearFuenteValidarTicketsRpc(cliente).obtenerPorValidar()).items;
    expect(item.colportorNombre).toBe("Colportor sin nombre");
  });

  it("pide la página siguiente mientras vuelvan 500 filas", async () => {
    const pagina = (desde: number, cantidad: number) =>
      Array.from({ length: cantidad }, (_, i) =>
        ticket({ ticket_id: `cccccccc-cccc-4ccc-8ccc-${String(desde + i).padStart(12, "0")}`, estado: "VALIDADO", revisado_en: "2026-11-01T00:00:00Z" }),
      );
    const { cliente, llamarRpc } = lecturaBasica({
      tickets_de_campania: (a: Record<string, unknown>) => (a.p_desplazamiento === 0 ? pagina(0, FILAS_POR_PAGINA) : pagina(FILAS_POR_PAGINA, 3)),
      retiros_de_campania: [],
    });
    const datos = await crearFuenteValidarTicketsRpc(cliente).obtenerPorValidar();
    expect(datos.items).toHaveLength(FILAS_POR_PAGINA + 3);
    expect(llamarRpc).toHaveBeenCalledWith("tickets_de_campania", expect.objectContaining({ p_desplazamiento: FILAS_POR_PAGINA }));
  });

  it("si el proyecto todavía no tiene retiros_de_campania (0184 sin aplicar), la cola queda con los depósitos", async () => {
    const { cliente } = lecturaBasica({ retiros_de_campania: rechazo("PGRST202", "Could not find the function", 404) });
    const datos = await crearFuenteValidarTicketsRpc(cliente).obtenerPorValidar();
    expect(datos.items.map((i) => i.tipo)).toEqual(["deposito"]);
  });

  it("sin permiso sobre la campaña, sin conexión o con la sesión vencida, la lectura falla (la página muestra su error)", async () => {
    const sinPermiso = lecturaBasica({ tickets_de_campania: rechazo("42501", "Solo el coordinador de la campaña…", 403) });
    await expect(crearFuenteValidarTicketsRpc(sinPermiso.cliente).obtenerPorValidar()).rejects.toMatchObject({ codigo: "42501" });

    const sinRed = lecturaBasica({ retiros_de_campania: new TypeError("fetch failed") });
    await expect(crearFuenteValidarTicketsRpc(sinRed.cliente).obtenerPorValidar()).rejects.toThrow("fetch failed");

    const vencida = lecturaBasica({ tickets_de_campania: rechazo("PGRST301", "JWT expired", 401) });
    await expect(crearFuenteValidarTicketsRpc(vencida.cliente).obtenerPorValidar()).rejects.toMatchObject({ estado: 401 });
  });

  it("una fila con otra forma es un cambio del backend: falla en vez de mostrar datos a medias", async () => {
    const estado = lecturaBasica({ tickets_de_campania: [ticket({ estado: "EN_REVISION" })] });
    await expect(crearFuenteValidarTicketsRpc(estado.cliente).obtenerPorValidar()).rejects.toBeInstanceOf(RespuestaInesperada);

    const concepto = lecturaBasica({ retiros_de_campania: [retiro({ concepto: "OTRO" })] });
    await expect(crearFuenteValidarTicketsRpc(concepto.cliente).obtenerPorValidar()).rejects.toBeInstanceOf(RespuestaInesperada);

    const monto = lecturaBasica({ tickets_de_campania: [ticket({ monto: "9000" })] });
    await expect(crearFuenteValidarTicketsRpc(monto.cliente).obtenerPorValidar()).rejects.toBeInstanceOf(RespuestaInesperada);
  });
});

const deposito = { id: TICKET, tipo: "deposito" } as const;
const retiroItem = { id: RETIRO, tipo: "retiro" } as const;
const resuelto = (campo: string, yaEstaba = false) => [{ [campo]: "2026-11-10T14:00:00+00:00", ya_estaba: yaEstaba }];
const sinFunciones: ClienteDeFunciones = { invocarFuncion: vi.fn() };

describe("crearAccionesValidarTicketsRpc · decisiones", () => {
  it("valida un depósito con validar_ticket y confirma un retiro con confirmar_retiro", async () => {
    const { cliente, llamarRpc } = clienteCon({ validar_ticket: resuelto("validado_en"), confirmar_retiro: resuelto("validado_en", true) });
    const acciones = crearAccionesValidarTicketsRpc(cliente, sinFunciones);

    expect(await acciones.validar(deposito)).toEqual({ ok: true, valor: { resueltoEn: "2026-11-10T14:00:00+00:00", yaEstaba: false } });
    expect(llamarRpc).toHaveBeenLastCalledWith("validar_ticket", { p_ticket_id: TICKET });
    // Un reintento de quien ya lo confirmó: `ya_estaba`, sin acreditar dos veces (lo cuida la base).
    expect(await acciones.validar(retiroItem)).toEqual({ ok: true, valor: { resueltoEn: "2026-11-10T14:00:00+00:00", yaEstaba: true } });
    expect(llamarRpc).toHaveBeenLastCalledWith("confirmar_retiro", { p_deposito_id: RETIRO });
  });

  it("rechaza con el motivo recortado: rechazar_ticket o rechazar_retiro", async () => {
    const { cliente, llamarRpc } = clienteCon({ rechazar_ticket: resuelto("revisado_en"), rechazar_retiro: resuelto("rechazado_en") });
    const acciones = crearAccionesValidarTicketsRpc(cliente, sinFunciones);

    expect(await acciones.rechazar(deposito, "  Foto ilegible  ")).toMatchObject({ ok: true, valor: { yaEstaba: false } });
    expect(llamarRpc).toHaveBeenLastCalledWith("rechazar_ticket", { p_ticket_id: TICKET, p_motivo: "Foto ilegible" });
    expect(await acciones.rechazar(retiroItem, "Me entregaste $U 5.000")).toMatchObject({ ok: true });
    expect(llamarRpc).toHaveBeenLastCalledWith("rechazar_retiro", { p_deposito_id: RETIRO, p_motivo: "Me entregaste $U 5.000" });
  });

  it("un motivo vacío o de más de 500 caracteres no se manda", async () => {
    const { cliente, llamarRpc } = clienteCon({});
    const acciones = crearAccionesValidarTicketsRpc(cliente, sinFunciones);

    expect(await acciones.rechazar(deposito, "   ")).toEqual({
      ok: false,
      causa: "rechazado",
      mensaje: "Escribí el motivo del rechazo (hasta 500 caracteres) para que el colportor sepa qué corregir.",
    });
    expect(await acciones.rechazar(retiroItem, "x".repeat(501))).toEqual({
      ok: false,
      causa: "rechazado",
      mensaje: "Escribí el motivo del rechazo (hasta 500 caracteres) para que la colportora sepa qué corregir.",
    });
    expect(llamarRpc).not.toHaveBeenCalled();
  });

  it("un id que no es un uuid (el de un ticket simulado de Cuentas) o un tipo raro no se mandan", async () => {
    const { cliente, llamarRpc } = clienteCon({});
    const acciones = crearAccionesValidarTicketsRpc(cliente, sinFunciones);

    expect(await acciones.validar({ id: "lucia-fernandez-por-validar", tipo: "deposito" })).toEqual({
      ok: false,
      causa: "rechazado",
      mensaje: "El ticket no existe o no es de un colportor de tus campañas. Recargá la lista de tickets.",
    });
    expect(await acciones.rechazar({ id: "x", tipo: "retiro" }, "motivo")).toMatchObject({ mensaje: expect.stringMatching(/^El retiro no existe/) });
    expect(await acciones.validar({ id: TICKET, tipo: "tarjeta" as never })).toMatchObject({ ok: false, causa: "rechazado" });
    expect(llamarRpc).not.toHaveBeenCalled();
  });

  it.each([
    ["TV001", "validar", deposito, "El ticket no existe o no es de un colportor de tus campañas. Recargá la lista de tickets."],
    ["TV002", "validar", deposito, "Este ticket ya no está pendiente: otra persona lo resolvió. Recargá la lista para ver cómo quedó."],
    ["TV003", "rechazar", deposito, "Escribí el motivo del rechazo (hasta 500 caracteres) para que el colportor sepa qué corregir."],
    ["TV004", "validar", deposito, "El ticket no tiene monto, no hay nada para acreditar. Rechazalo con un motivo para que el colportor lo cargue de nuevo."],
    ["TV005", "validar", deposito, "Todavía no llegó el depósito de este ticket: el teléfono del colportor tiene que sincronizar. Probá de nuevo más tarde."],
    ["DP002", "validar", retiroItem, "El retiro no existe o no es de un colportor de tus campañas. Recargá la lista."],
    ["DP003", "validar", retiroItem, "Este depósito tiene ticket: se valida desde su ticket, en la lista de tickets."],
    ["DP004", "rechazar", retiroItem, "Este retiro ya lo confirmó otra persona. Recargá la lista para ver cómo quedó."],
    ["DP005", "validar", retiroItem, "Este retiro ya lo rechazó otra persona. Recargá la lista para ver cómo quedó."],
    ["DP006", "rechazar", retiroItem, "Escribí el motivo del rechazo (hasta 500 caracteres) para que la colportora sepa qué corregir."],
  ] as const)("%s (%s) vuelve como rechazo con el texto de la base", async (codigo, accion, item, texto) => {
    const rpcs = ["validar_ticket", "confirmar_retiro", "rechazar_ticket", "rechazar_retiro"];
    const conMensaje = clienteCon(Object.fromEntries(rpcs.map((r) => [r, rechazo(codigo, `${texto} (de la base)`)])));
    const sinMensaje = clienteCon(Object.fromEntries(rpcs.map((r) => [r, rechazo(codigo)])));

    const decidir = (cliente: ClienteRpc) => {
      const acciones = crearAccionesValidarTicketsRpc(cliente, sinFunciones);
      return accion === "validar" ? acciones.validar(item) : acciones.rechazar(item, "Motivo");
    };
    expect(await decidir(conMensaje.cliente)).toEqual({ ok: false, causa: "rechazado", mensaje: `${texto} (de la base)` });
    // Sin `message`, el mismo texto desde el panel.
    expect(await decidir(sinMensaje.cliente)).toEqual({ ok: false, causa: "rechazado", mensaje: texto });
  });

  it("sin permiso (42501): el texto propio de la base («tu propio ticket»), o uno en castellano si es el de PostgreSQL", async () => {
    const propio = clienteCon({ validar_ticket: rechazo("42501", "No podés validar ni rechazar tu propio ticket. Pedile a otro coordinador o a un administrador que lo haga.", 403) });
    expect(await crearAccionesValidarTicketsRpc(propio.cliente, sinFunciones).validar(deposito)).toEqual({
      ok: false,
      causa: "rechazado",
      mensaje: "No podés validar ni rechazar tu propio ticket. Pedile a otro coordinador o a un administrador que lo haga.",
    });

    const postgres = clienteCon({ confirmar_retiro: rechazo("42501", "permission denied for function confirmar_retiro", 403) });
    expect(await crearAccionesValidarTicketsRpc(postgres.cliente, sinFunciones).validar(retiroItem)).toEqual({
      ok: false,
      causa: "rechazado",
      mensaje: "Solo el coordinador de la campaña o un administrador puede validar tickets y retiros. Entrá con la cuenta del coordinador de esta campaña.",
    });
  });

  it("un código que el panel no conoce: un texto genérico, nunca el de la base sin traducir", async () => {
    const { cliente } = clienteCon({ validar_ticket: rechazo("P0001", "algo interno") });
    expect(await crearAccionesValidarTicketsRpc(cliente, sinFunciones).validar(deposito)).toEqual({
      ok: false,
      causa: "rechazado",
      mensaje: "No pudimos guardar la decisión. Probá de nuevo; si sigue igual, avisá al equipo.",
    });
  });

  it("la sesión vencida en la base vuelve como resultado, con su aviso (#41)", async () => {
    const { cliente } = clienteCon({ rechazar_ticket: rechazo("PGRST301", "JWT expired", 401) });
    expect(await crearAccionesValidarTicketsRpc(cliente, sinFunciones).rechazar(deposito, "Motivo")).toEqual({
      ok: false,
      causa: "rechazado",
      mensaje: MENSAJE_SESION_VENCIDA,
    });
  });

  it("sin conexión, un 5xx o un 429 se relanzan: la vista los muestra como «sin conexión» y el botón vuelve a poder usarse", async () => {
    for (const falla of [new TypeError("fetch failed"), rechazo("", "Bad Gateway", 502), rechazo("", "Too Many Requests", 429), rechazo("", "Invalid API key", 401)]) {
      const { cliente } = clienteCon({ validar_ticket: falla });
      await expect(crearAccionesValidarTicketsRpc(cliente, sinFunciones).validar(deposito)).rejects.toBe(falla);
    }
  });

  it("una respuesta sin fila o sin `ya_estaba` es un cambio del backend", async () => {
    const vacia = clienteCon({ validar_ticket: [] });
    await expect(crearAccionesValidarTicketsRpc(vacia.cliente, sinFunciones).validar(deposito)).rejects.toBeInstanceOf(RespuestaInesperada);
    const rara = clienteCon({ confirmar_retiro: [{ validado_en: "2026-11-10T14:00:00Z" }] });
    await expect(crearAccionesValidarTicketsRpc(rara.cliente, sinFunciones).validar(retiroItem)).rejects.toBeInstanceOf(RespuestaInesperada);
  });

  it("con el supabase-js de verdad: el 401 del JWT es sesión vencida y el 503 se relanza", async () => {
    const respuestas = [errorDePostgrest(401, "PGRST301", "JWT expired"), errorDePostgrest(503, "", "Service Unavailable")];
    const { supabase, llamadas } = crearSupabasePrueba(() => respuestas.shift() ?? json([]));
    const acciones = crearAccionesValidarTicketsRpc(crearClienteRpc(supabase), sinFunciones);

    expect(await acciones.validar(deposito)).toEqual({ ok: false, causa: "rechazado", mensaje: MENSAJE_SESION_VENCIDA });
    expect(llamadas[0]).toMatchObject({ metodo: "POST", ruta: "/rest/v1/rpc/validar_ticket", cuerpo: { p_ticket_id: TICKET } });
    await expect(acciones.validar(deposito)).rejects.toMatchObject({ estado: 503 });
  });
});

describe("crearAccionesValidarTicketsRpc · la foto del ticket (Edge Function foto-ticket)", () => {
  const funcionQue = (respuesta: Response | Error) => {
    const invocarFuncion = vi.fn(async () => {
      if (respuesta instanceof Error) throw respuesta;
      return respuesta;
    });
    return { funciones: { invocarFuncion } as ClienteDeFunciones, invocarFuncion };
  };
  const errorDeLaFuncion = (estado: number, codigo: string, mensaje: string) => json({ error: { codigo, mensaje } }, estado);
  const { cliente } = clienteCon({});

  it("pide «ver» con el id en minúsculas y devuelve el enlace firmado", async () => {
    const url = "https://cuenta.r2.cloudflarestorage.com/tickets/u/t.jpg?X-Amz-Signature=abc";
    const { funciones, invocarFuncion } = funcionQue(json({ accion: "ver", metodo: "GET", url, ruta: "u/t.jpg", cabeceras: {}, venceEn: "2026-11-10T14:05:00Z" }));
    expect(await crearAccionesValidarTicketsRpc(cliente, funciones).enlaceDeFoto(TICKET.toUpperCase())).toEqual({ ok: true, valor: url });
    expect(invocarFuncion).toHaveBeenCalledWith(FUNCION_DE_LA_FOTO, { accion: "ver", ticketId: TICKET });
  });

  it.each([
    [404, "ticket_no_encontrado", "No encontramos ese ticket o no tenés permiso para ver su foto."],
    [404, "sin_foto", "Este ticket todavía no tiene foto."],
    [410, "foto_vencida", "La foto de este ticket ya venció: se guarda 4 meses."],
    [503, "sin_configurar", "Las fotos todavía no están disponibles."],
  ])("un %i %s vuelve como rechazo con el texto de la función", async (estado, codigo, mensaje) => {
    const { funciones } = funcionQue(errorDeLaFuncion(estado, codigo, mensaje));
    expect(await crearAccionesValidarTicketsRpc(cliente, funciones).enlaceDeFoto(TICKET)).toEqual({ ok: false, causa: "rechazado", mensaje });
  });

  it("401 de la función es la sesión vencida", async () => {
    const { funciones } = funcionQue(errorDeLaFuncion(401, "sin_sesion", "Tu sesión terminó."));
    expect(await crearAccionesValidarTicketsRpc(cliente, funciones).enlaceDeFoto(TICKET)).toEqual({ ok: false, causa: "rechazado", mensaje: MENSAJE_SESION_VENCIDA });
  });

  it("sin respuesta es sin conexión; un error sin texto o un 200 sin enlace usable, un rechazo sin mensaje", async () => {
    expect(await crearAccionesValidarTicketsRpc(cliente, funcionQue(new TypeError("fetch failed")).funciones).enlaceDeFoto(TICKET)).toEqual({
      ok: false,
      causa: "sin-conexion",
    });
    expect(await crearAccionesValidarTicketsRpc(cliente, funcionQue(new Response("Bad Gateway", { status: 502 })).funciones).enlaceDeFoto(TICKET)).toEqual({
      ok: false,
      causa: "rechazado",
    });
    for (const cuerpo of [{ url: "javascript:alert(1)" }, { url: "http://evil.example/x.jpg" }, { nada: true }]) {
      expect(await crearAccionesValidarTicketsRpc(cliente, funcionQue(json(cuerpo)).funciones).enlaceDeFoto(TICKET)).toEqual({ ok: false, causa: "rechazado" });
    }
  });

  it("un id que no es un uuid no se pide", async () => {
    const { funciones, invocarFuncion } = funcionQue(json({}));
    expect(await crearAccionesValidarTicketsRpc(cliente, funciones).enlaceDeFoto("lucia-fernandez-por-validar")).toMatchObject({ ok: false, causa: "rechazado" });
    expect(invocarFuncion).not.toHaveBeenCalled();
  });
});

describe("funcionesDeSupabase", () => {
  it("con el supabase-js de verdad: el 200 y el error de la función vuelven como respuesta; sin red, tira", async () => {
    const respuestas: Array<Response | Error> = [
      json({ url: "https://r2.example/x.jpg" }),
      json({ error: { codigo: "foto_vencida", mensaje: "La foto venció." } }, 410),
      new TypeError("fetch failed"),
    ];
    const { supabase, llamadas } = crearSupabasePrueba(() => {
      const siguiente = respuestas.shift() ?? json({});
      if (siguiente instanceof Error) throw siguiente;
      return siguiente;
    });
    const funciones = funcionesDeSupabase(supabase);

    const ok = await funciones.invocarFuncion(FUNCION_DE_LA_FOTO, { accion: "ver", ticketId: TICKET });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ url: "https://r2.example/x.jpg" });
    expect(llamadas[0]).toMatchObject({ metodo: "POST", ruta: `/functions/v1/${FUNCION_DE_LA_FOTO}`, cuerpo: { accion: "ver", ticketId: TICKET } });

    const vencida = await funciones.invocarFuncion(FUNCION_DE_LA_FOTO, { accion: "ver", ticketId: TICKET });
    expect(vencida.status).toBe(410);
    expect(await vencida.json()).toEqual({ error: { codigo: "foto_vencida", mensaje: "La foto venció." } });

    await expect(funciones.invocarFuncion(FUNCION_DE_LA_FOTO, { accion: "ver", ticketId: TICKET })).rejects.toBeTruthy();
  });
});
