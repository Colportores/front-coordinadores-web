import { describe, expect, it, vi } from "vitest";

import { crearAccionesPedidosRpc, crearFuentePedidosRpc, DETALLES_A_LA_VEZ, FILAS_MAXIMAS } from "@/datos/stock/pedidos/rpc";
import { ErrorSupabase, type ClienteRpc } from "@/datos/supabase/cliente";
import { RespuestaInesperada } from "@/datos/supabase/respuesta";
import { MENSAJE_SESION_VENCIDA } from "@/lib/mensajes";

const CAMPANIA = "11111111-1111-4111-8111-111111111111";
const OTRA_CAMPANIA = "11111111-1111-4111-8111-222222222222";
const LUCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ANA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RIVERA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ARTIGAS = "cccccccc-cccc-4ccc-8ccc-dddddddddddd";
const PEDIDO = "dddddddd-dddd-4ddd-8ddd-000000000001";
const PEDIDO_2 = "dddddddd-dddd-4ddd-8ddd-000000000002";
const TRANSFERENCIA = "eeeeeeee-eeee-4eee-8eee-000000000001";
const PRODUCTO_A = "ffffffff-ffff-4fff-8fff-00000000000a";
const PRODUCTO_B = "ffffffff-ffff-4fff-8fff-00000000000b";

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
const sinRed = () => new ErrorSupabase("sin red", 0);

const campanias = [{ id: CAMPANIA, nombre: "Primavera 2026", tipo: "VERANO", fecha_inicio: "2026-09-01", fecha_fin: "2026-12-31" }];
const ciudades = [
  { campania_ciudad_id: "x1", ciudad_id: RIVERA, nombre: "Rivera", departamento: "Rivera", lat_centro: 0, lon_centro: 0, zoom_inicial: 12, cantidad_zonas: 2 },
];

function filaDePedido(extra: Record<string, unknown> = {}) {
  return {
    pedido_id: PEDIDO,
    numero: 231,
    colportor_id: LUCIA,
    nombre: "Lucía",
    apellido: "Fernández",
    ciudad_id: RIVERA,
    ciudad_nombre: "Rivera",
    departamento: "Rivera",
    de_baja: false,
    estado: "PENDIENTE_AUTORIZACION",
    origen: "COLPORTOR",
    fecha_pedido: "2026-11-23T14:35:00+00:00",
    productos: 2,
    unidades: 10,
    unidades_autorizadas: null,
    monto_total: 1_500_000,
    monto_autorizado: null,
    excede_limite: false,
    decidido_en: null,
    motivo_rechazo: null,
    deshacer_hasta: null,
    ...extra,
  };
}

const lineas = [
  { producto_id: PRODUCTO_A, producto_nombre: "Salud y Hogar", cantidad: 8, cantidad_autorizada: null, precio_unitario: 165_000, subtotal: 1_320_000, subtotal_autorizado: 1_320_000, stock: 3 },
  { producto_id: PRODUCTO_B, producto_nombre: "Vida Feliz", cantidad: 2, cantidad_autorizada: 1, precio_unitario: 14_050, subtotal: 28_100, subtotal_autorizado: 14_050, stock: -1 },
];

const contexto = {
  numero: 231,
  colportor_id: LUCIA,
  nombre: "Lucía",
  apellido: "Fernández",
  estado: "PENDIENTE_AUTORIZACION",
  monto_total: 1_500_000,
  monto_autorizado: null,
  deuda_actual: 1_840_000,
  deuda_con_pedido: 3_340_000,
  por_cobrar: 580_000,
  libros_por_entregar: 4,
  // 02:30 UTC del 24/11 es el 23/11 por la noche en Montevideo (UTC-3).
  ultimo_deposito_fecha: "2026-11-24T02:30:00+00:00",
  ultimo_deposito_monto: 950_000,
};

const filaDeTransferencia = (extra: Record<string, unknown> = {}) => ({
  transferencia_id: TRANSFERENCIA,
  numero: 18,
  origen_id: LUCIA,
  origen_nombre: "Lucía",
  origen_apellido: "Fernández",
  destino_id: ANA,
  destino_nombre: "Ana",
  destino_apellido: "Benítez",
  ciudad_id: RIVERA,
  ciudad_nombre: "Rivera",
  departamento: "Rivera",
  estado: "PENDIENTE_AUTORIZACION",
  fecha_solicitud: "2026-11-23T20:00:00+00:00",
  productos: 1,
  unidades: 2,
  monto_deuda: 290_000,
  decidido_en: null,
  motivo_rechazo: null,
  deshacer_hasta: null,
  ...extra,
});

const lineasDeTransferencia = [
  { producto_id: PRODUCTO_A, producto_nombre: "La Gran Esperanza", cantidad: 2, precio_unitario: 145_000, subtotal: 290_000, tiene_quien_da: 3, debe_entregar_quien_recibe: 2, tiene_quien_recibe: 0 },
];

function lectura(extra: Record<string, Respuesta> = {}) {
  return clienteCon({
    campanias_del_coordinador: campanias,
    ciudades_de_campania: ciudades,
    pedidos_de_campania: [filaDePedido()],
    pedido_lineas: lineas,
    pedido_contexto: [contexto],
    transferencias_de_campania: [filaDeTransferencia()],
    transferencia_lineas: lineasDeTransferencia,
    ...extra,
  });
}

describe("lectura de la bandeja (vista 35, #215)", () => {
  it("arma los pedidos con sus líneas, la cuenta y el stock, y pasa los centavos a pesos", async () => {
    const { cliente } = lectura();
    const datos = await crearFuentePedidosRpc(cliente).obtenerPedidos();

    expect(datos).not.toBeNull();
    expect(datos?.campaniaId).toBe(CAMPANIA);
    expect(datos?.campaniaNombre).toBe("Primavera 2026");
    expect(datos?.ciudades).toEqual([{ id: RIVERA, nombre: "Rivera", departamento: "Rivera" }]);
    expect(datos?.pedidos).toEqual([
      {
        id: PEDIDO,
        numero: "#231",
        colportorId: LUCIA,
        colportorNombre: "Lucía Fernández",
        ciudadId: RIVERA,
        estado: "POR_AUTORIZAR",
        enviadoEn: "2026-11-23T14:35:00+00:00",
        resueltoEn: null,
        motivoDeRechazo: null,
        lineas: [
          { productoId: PRODUCTO_A, nombre: "Salud y Hogar", cantidad: 8, costoUnitario: 1650 },
          { productoId: PRODUCTO_B, nombre: "Vida Feliz", cantidad: 2, costoUnitario: 140.5, cantidadAutorizada: 1 },
        ],
        cuenta: { deuda: 18_400, porCobrar: 5800, librosPorEntregar: 4, ultimoDeposito: { dia: "2026-11-23", monto: 9500 } },
        stock: [
          { nombre: "Salud y Hogar", cantidad: 3 },
          { nombre: "Vida Feliz", cantidad: -1 },
        ],
      },
    ]);
  });

  it("arma las transferencias (el número es «T-18») y junta EJECUTADO con AUTORIZADA", async () => {
    const { cliente } = lectura({
      transferencias_de_campania: [
        filaDeTransferencia(),
        filaDeTransferencia({ transferencia_id: "eeeeeeee-eeee-4eee-8eee-000000000002", numero: 17, estado: "EJECUTADO", decidido_en: "2026-11-22T10:00:00+00:00" }),
        filaDeTransferencia({ transferencia_id: "eeeeeeee-eeee-4eee-8eee-000000000003", numero: 16, estado: "RECHAZADO", decidido_en: "2026-11-21T10:00:00+00:00", motivo_rechazo: "No tiene los libros" }),
      ],
    });
    const datos = await crearFuentePedidosRpc(cliente).obtenerPedidos();

    expect(datos?.transferencias[0]).toEqual({
      id: TRANSFERENCIA,
      numero: "T-18",
      deId: LUCIA,
      deNombre: "Lucía Fernández",
      aId: ANA,
      aNombre: "Ana Benítez",
      ciudadId: RIVERA,
      estado: "POR_AUTORIZAR",
      pedidaEn: "2026-11-23T20:00:00+00:00",
      resueltaEn: null,
      motivoDeRechazo: null,
      lineas: [{ productoId: PRODUCTO_A, nombre: "La Gran Esperanza", cantidad: 2, costoUnitario: 1450, tieneQuienDa: 3, debeEntregarQuienRecibe: 2, tieneQuienRecibe: 0 }],
    });
    expect(datos?.transferencias.map((t) => t.estado)).toEqual(["POR_AUTORIZAR", "AUTORIZADA", "RECHAZADA"]);
    expect(datos?.transferencias[2]).toMatchObject({ resueltaEn: "2026-11-21T10:00:00+00:00", motivoDeRechazo: "No tiene los libros" });
  });

  it("los cinco estados del pedido y el motivo solo en el rechazado", async () => {
    const estados = ["PENDIENTE_AUTORIZACION", "AUTORIZADO", "DESPACHADO", "RECIBIDO", "RECHAZADO"];
    const { cliente } = lectura({
      pedidos_de_campania: estados.map((estado, i) =>
        filaDePedido({ pedido_id: `dddddddd-dddd-4ddd-8ddd-00000000010${i}`, numero: 100 + i, estado, decidido_en: estado === "PENDIENTE_AUTORIZACION" ? null : "2026-11-22T10:00:00+00:00", motivo_rechazo: estado === "RECHAZADO" ? "Pedí menos" : null }),
      ),
    });
    const datos = await crearFuentePedidosRpc(cliente).obtenerPedidos();

    expect(datos?.pedidos.map((p) => p.estado)).toEqual(["POR_AUTORIZAR", "AUTORIZADO", "DESPACHADO", "RECIBIDO", "RECHAZADO"]);
    expect(datos?.pedidos.map((p) => p.motivoDeRechazo)).toEqual([null, null, null, null, "Pedí menos"]);
    expect(datos?.pedidos.map((p) => p.resueltoEn !== null)).toEqual([false, true, true, true, true]);
  });

  it("no inventa «sin límite»: el límite no se lee y la fuente lo dice", async () => {
    const { cliente } = lectura();
    const datos = await crearFuentePedidosRpc(cliente).obtenerPedidos();

    expect(datos?.limiteSinLeer).toBe(true);
    expect(datos?.limiteDeDeuda).toBeNull();
  });

  it("sin campaña que coordine no hay bandeja (la vista dice «Sin campaña»)", async () => {
    const { cliente, llamarRpc } = lectura({ campanias_del_coordinador: [] });
    expect(await crearFuentePedidosRpc(cliente).obtenerPedidos()).toBeNull();
    expect(llamarRpc).toHaveBeenCalledTimes(1);
  });

  it("lee la campaña elegida en el topbar, y la primera si la elegida ya no figura", async () => {
    const dos = [...campanias, { ...campanias[0], id: OTRA_CAMPANIA, nombre: "Verano" }];
    const { cliente, llamarRpc } = lectura({ campanias_del_coordinador: dos });

    expect((await crearFuentePedidosRpc(cliente, async () => OTRA_CAMPANIA).obtenerPedidos())?.campaniaId).toBe(OTRA_CAMPANIA);
    expect(llamarRpc).toHaveBeenCalledWith("pedidos_de_campania", { p_campania_id: OTRA_CAMPANIA });
    expect((await crearFuentePedidosRpc(cliente, async () => "99999999-9999-4999-8999-999999999999").obtenerPedidos())?.campaniaId).toBe(CAMPANIA);
  });

  it("la ciudad de un pedido que la campaña ya no lista no pierde el pedido, y sin zona queda sin ciudad", async () => {
    const { cliente } = lectura({
      pedidos_de_campania: [
        filaDePedido({ ciudad_id: ARTIGAS, ciudad_nombre: "Artigas", departamento: "Artigas" }),
        filaDePedido({ pedido_id: PEDIDO_2, numero: 232, ciudad_id: null, ciudad_nombre: null, departamento: null }),
      ],
    });
    const datos = await crearFuentePedidosRpc(cliente).obtenerPedidos();

    expect(datos?.ciudades.map((c) => c.nombre)).toEqual(["Rivera", "Artigas"]);
    expect(datos?.pedidos.map((p) => p.ciudadId)).toEqual([ARTIGAS, null]);
  });

  it("un pedido cuyo detalle la base rechaza (ya no existe) queda afuera y el resto se ve", async () => {
    const { cliente } = lectura({
      pedidos_de_campania: [filaDePedido(), filaDePedido({ pedido_id: PEDIDO_2, numero: 232 })],
      pedido_lineas: (a: Record<string, unknown>) => (a.p_pedido_id === PEDIDO_2 ? rechazo("PE001", "No existe") : lineas),
    });
    const datos = await crearFuentePedidosRpc(cliente).obtenerPedidos();

    expect(datos?.pedidos.map((p) => p.id)).toEqual([PEDIDO]);
  });

  it("una caída a mitad del detalle sale como excepción: nunca una lista a medias como si estuviera completa", async () => {
    const { cliente } = lectura({
      pedidos_de_campania: [filaDePedido(), filaDePedido({ pedido_id: PEDIDO_2, numero: 232 })],
      pedido_contexto: (a: Record<string, unknown>) => (a.p_pedido_id === PEDIDO_2 ? sinRed() : [contexto]),
    });
    await expect(crearFuentePedidosRpc(cliente).obtenerPedidos()).rejects.toThrow("sin red");
  });

  it("una sesión vencida sale como excepción también (la página entera vuelve a entrar)", async () => {
    const { cliente } = lectura({ pedidos_de_campania: new ErrorSupabase("", 401, "PGRST301") });
    await expect(crearFuentePedidosRpc(cliente).obtenerPedidos()).rejects.toBeInstanceOf(ErrorSupabase);
  });

  it("pide los detalles de a seis a la vez, sin pasarse", async () => {
    let enCurso = 0;
    let maximo = 0;
    const lento = async (valor: unknown) => {
      enCurso++;
      maximo = Math.max(maximo, enCurso);
      await new Promise((r) => setTimeout(r, 1));
      enCurso--;
      return valor;
    };
    const muchos = Array.from({ length: 20 }, (_, i) => filaDePedido({ pedido_id: `dddddddd-dddd-4ddd-8ddd-${String(i).padStart(12, "0")}`, numero: i + 1 }));
    const { cliente } = lectura({ pedidos_de_campania: muchos, pedido_lineas: () => lento(lineas), pedido_contexto: () => lento([contexto]) });
    const datos = await crearFuentePedidosRpc(cliente).obtenerPedidos();

    expect(datos?.pedidos).toHaveLength(20);
    // Cada ítem pide líneas y cuenta a la vez: el tope son dos llamadas por ítem.
    expect(maximo).toBeLessThanOrEqual(DETALLES_A_LA_VEZ * 2);
    expect(maximo).toBeGreaterThan(2);
  });

  it("una lista que llega al tope de PostgREST no se muestra como completa", async () => {
    const tope = Array.from({ length: FILAS_MAXIMAS }, (_, i) => filaDePedido({ pedido_id: `dddddddd-dddd-4ddd-8ddd-${String(i).padStart(12, "0")}` }));
    const { cliente } = lectura({ pedidos_de_campania: tope });
    await expect(crearFuentePedidosRpc(cliente).obtenerPedidos()).rejects.toBeInstanceOf(RespuestaInesperada);
  });

  it("una respuesta que no tiene la forma del contrato falla con un error propio, no con datos a medias", async () => {
    const { cliente } = lectura({ pedidos_de_campania: [filaDePedido({ estado: "CANCELADO" })] });
    await expect(crearFuentePedidosRpc(cliente).obtenerPedidos()).rejects.toBeInstanceOf(RespuestaInesperada);
    const { cliente: otro } = lectura({ pedido_contexto: [] });
    await expect(crearFuentePedidosRpc(otro).obtenerPedidos()).rejects.toBeInstanceOf(RespuestaInesperada);
  });

  it("una transferencia sin costo cargado se ve con costo cero (la base no la deja autorizar: TR005)", async () => {
    const { cliente } = lectura({ transferencia_lineas: [{ ...lineasDeTransferencia[0], precio_unitario: null }] });
    const datos = await crearFuentePedidosRpc(cliente).obtenerPedidos();
    expect(datos?.transferencias[0].lineas[0].costoUnitario).toBe(0);
  });

  it("sin pedidos ni transferencias trae la campaña vacía", async () => {
    const { cliente } = lectura({ pedidos_de_campania: [], transferencias_de_campania: [] });
    const datos = await crearFuentePedidosRpc(cliente).obtenerPedidos();
    expect(datos).toMatchObject({ pedidos: [], transferencias: [] });
  });
});

describe("decisiones (autorizar_pedido, rechazar_pedido, autorizar_transferencia, rechazar_transferencia)", () => {
  const decidido = "2026-11-24T15:00:00+00:00";

  it("autoriza un pedido entero con su id y nada más", async () => {
    const { cliente, llamarRpc } = clienteCon({ autorizar_pedido: [{ pedido_id: PEDIDO, estado: "AUTORIZADO", decidido_en: decidido, ya_estaba: false }] });
    const resultado = await crearAccionesPedidosRpc(cliente).decidir({ tipo: "pedido", id: PEDIDO, accion: "autorizar" });

    expect(resultado).toEqual({ ok: true, valor: { tipo: "pedido", id: PEDIDO, estado: "AUTORIZADO", resueltoEn: decidido, motivoDeRechazo: null } });
    expect(llamarRpc).toHaveBeenCalledWith("autorizar_pedido", { p_pedido_id: PEDIDO });
  });

  it("autoriza reducido: manda producto_id y cantidad de cada línea", async () => {
    const { cliente, llamarRpc } = clienteCon({ autorizar_pedido: [{ pedido_id: PEDIDO, estado: "AUTORIZADO", decidido_en: decidido, ya_estaba: false }] });
    const cantidades = [
      { nombre: "Salud y Hogar", productoId: PRODUCTO_A, cantidad: 5 },
      { nombre: "Vida Feliz", productoId: PRODUCTO_B, cantidad: 0 },
    ];
    const resultado = await crearAccionesPedidosRpc(cliente).decidir({ tipo: "pedido", id: PEDIDO, accion: "autorizar", cantidades });

    expect(llamarRpc).toHaveBeenCalledWith("autorizar_pedido", {
      p_pedido_id: PEDIDO,
      p_cantidades: [
        { producto_id: PRODUCTO_A, cantidad: 5 },
        { producto_id: PRODUCTO_B, cantidad: 0 },
      ],
    });
    expect(resultado).toMatchObject({ ok: true, valor: { cantidades } });
  });

  it.each([
    ["sin id de producto", [{ nombre: "x", cantidad: 1 }]],
    ["con un id que no es uuid", [{ nombre: "x", productoId: "no-es-uuid", cantidad: 1 }]],
    ["con una cantidad negativa", [{ nombre: "x", productoId: PRODUCTO_A, cantidad: -1 }]],
    ["con una cantidad con decimales", [{ nombre: "x", productoId: PRODUCTO_A, cantidad: 1.5 }]],
    ["vacías", []],
  ])("las cantidades %s no llegan a la base", async (_caso, cantidades) => {
    const { cliente, llamarRpc } = clienteCon({});
    const resultado = await crearAccionesPedidosRpc(cliente).decidir({ tipo: "pedido", id: PEDIDO, accion: "autorizar", cantidades });

    expect(resultado).toMatchObject({ ok: false, causa: "rechazado" });
    expect(llamarRpc).not.toHaveBeenCalled();
  });

  it("una transferencia no se autoriza con cantidades", async () => {
    const { cliente, llamarRpc } = clienteCon({});
    const resultado = await crearAccionesPedidosRpc(cliente).decidir({
      tipo: "transferencia",
      id: TRANSFERENCIA,
      accion: "autorizar",
      cantidades: [{ nombre: "x", productoId: PRODUCTO_A, cantidad: 1 }],
    });
    expect(resultado).toMatchObject({ ok: false, causa: "rechazado" });
    expect(llamarRpc).not.toHaveBeenCalled();
  });

  it("autoriza una transferencia (autorizar_transferencia) y queda «autorizada»", async () => {
    const { cliente, llamarRpc } = clienteCon({
      autorizar_transferencia: [{ transferencia_id: TRANSFERENCIA, estado: "AUTORIZADO", monto_deuda: 290_000, decidido_en: decidido, deshacer_hasta: decidido, ya_estaba: false }],
    });
    const resultado = await crearAccionesPedidosRpc(cliente).decidir({ tipo: "transferencia", id: TRANSFERENCIA, accion: "autorizar" });

    expect(llamarRpc).toHaveBeenCalledWith("autorizar_transferencia", { p_transferencia_id: TRANSFERENCIA });
    expect(resultado).toEqual({ ok: true, valor: { tipo: "transferencia", id: TRANSFERENCIA, estado: "AUTORIZADA", resueltoEn: decidido, motivoDeRechazo: null } });
  });

  it("rechaza con el motivo recortado, en un pedido y en una transferencia", async () => {
    const { cliente, llamarRpc } = clienteCon({
      rechazar_pedido: [{ pedido_id: PEDIDO, estado: "RECHAZADO", decidido_en: decidido, ya_estaba: false }],
      rechazar_transferencia: [{ transferencia_id: TRANSFERENCIA, estado: "RECHAZADO", decidido_en: decidido, ya_estaba: false }],
    });
    const acciones = crearAccionesPedidosRpc(cliente);

    expect(await acciones.decidir({ tipo: "pedido", id: PEDIDO, accion: "rechazar", motivo: "  Pedí menos  " })).toEqual({
      ok: true,
      valor: { tipo: "pedido", id: PEDIDO, estado: "RECHAZADO", resueltoEn: decidido, motivoDeRechazo: "Pedí menos" },
    });
    expect(llamarRpc).toHaveBeenCalledWith("rechazar_pedido", { p_pedido_id: PEDIDO, p_motivo: "Pedí menos" });
    expect(await acciones.decidir({ tipo: "transferencia", id: TRANSFERENCIA, accion: "rechazar", motivo: "No tiene" })).toMatchObject({
      ok: true,
      valor: { estado: "RECHAZADA", motivoDeRechazo: "No tiene" },
    });
    expect(llamarRpc).toHaveBeenCalledWith("rechazar_transferencia", { p_transferencia_id: TRANSFERENCIA, p_motivo: "No tiene" });
  });

  it("un motivo vacío, en blanco o de más de 500 caracteres (por caracteres, no por unidades) no llega a la base", async () => {
    const { cliente, llamarRpc } = clienteCon({ rechazar_pedido: [{ pedido_id: PEDIDO, estado: "RECHAZADO", decidido_en: decidido, ya_estaba: false }] });
    const acciones = crearAccionesPedidosRpc(cliente);

    for (const motivo of ["", "   ", "a".repeat(501), "😀".repeat(501)]) {
      expect(await acciones.decidir({ tipo: "pedido", id: PEDIDO, accion: "rechazar", motivo })).toMatchObject({ ok: false, causa: "rechazado" });
    }
    expect(llamarRpc).not.toHaveBeenCalled();
    // 500 emojis son 500 caracteres (1000 unidades UTF-16): entran.
    expect(await acciones.decidir({ tipo: "pedido", id: PEDIDO, accion: "rechazar", motivo: "😀".repeat(500) })).toMatchObject({ ok: true });
  });

  it("un id que no es uuid, un tipo raro o una acción rara no llegan a la base", async () => {
    const { cliente, llamarRpc } = clienteCon({});
    const acciones = crearAccionesPedidosRpc(cliente);

    expect(await acciones.decidir({ tipo: "pedido", id: "no-es-uuid", accion: "autorizar" })).toMatchObject({ ok: false, causa: "rechazado" });
    expect(await acciones.decidir({ tipo: "otro", id: PEDIDO, accion: "autorizar" } as never)).toMatchObject({ ok: false });
    expect(await acciones.decidir({ tipo: "pedido", id: PEDIDO, accion: "borrar" } as never)).toMatchObject({ ok: false });
    expect(await acciones.decidir(null as never)).toMatchObject({ ok: false });
    expect(llamarRpc).not.toHaveBeenCalled();
  });

  it.each([
    ["PE002", "Otra persona lo decidió."],
    ["PE003", "Las cantidades no sirven."],
    ["TR002", "Otra persona la decidió."],
    ["TR003", "Quien da no tiene el stock completo: le faltan 2 de La Gran Esperanza."],
  ])("un rechazo %s de la base vuelve como resultado con el texto de la base", async (codigo, mensaje) => {
    const { cliente } = clienteCon({ autorizar_pedido: rechazo(codigo, mensaje), autorizar_transferencia: rechazo(codigo, mensaje) });
    const tipo = codigo.startsWith("TR") ? "transferencia" : "pedido";
    const resultado = await crearAccionesPedidosRpc(cliente).decidir({ tipo, id: PEDIDO, accion: "autorizar" });

    expect(resultado).toEqual({ ok: false, causa: "rechazado", mensaje });
  });

  it("un rechazo sin texto usa el de siempre; un código desconocido, el genérico; el 42501 de PostgreSQL, el del permiso", async () => {
    const { cliente } = clienteCon({
      autorizar_pedido: (a: Record<string, unknown>) => (a.p_pedido_id === PEDIDO ? rechazo("PE002", "") : a.p_pedido_id === PEDIDO_2 ? rechazo("XX999", "algo raro") : rechazo("42501", "permission denied for function")),
    });
    const acciones = crearAccionesPedidosRpc(cliente);

    expect(await acciones.decidir({ tipo: "pedido", id: PEDIDO, accion: "autorizar" })).toMatchObject({ mensaje: expect.stringContaining("otra persona lo decidió") });
    expect(await acciones.decidir({ tipo: "pedido", id: PEDIDO_2, accion: "autorizar" })).toMatchObject({ mensaje: expect.stringContaining("No pudimos guardar") });
    expect(await acciones.decidir({ tipo: "pedido", id: ANA, accion: "autorizar" })).toMatchObject({ mensaje: expect.stringContaining("Solo el coordinador") });
  });

  it("la sesión vencida vuelve como resultado con su aviso; una caída de la red sigue como excepción (la vista la ve «sin conexión»)", async () => {
    const vencida = clienteCon({ autorizar_pedido: new ErrorSupabase("", 401, "PGRST301") });
    expect(await crearAccionesPedidosRpc(vencida.cliente).decidir({ tipo: "pedido", id: PEDIDO, accion: "autorizar" })).toEqual({
      ok: false,
      causa: "rechazado",
      mensaje: MENSAJE_SESION_VENCIDA,
    });
    for (const falla of [sinRed(), new ErrorSupabase("", 503), new ErrorSupabase("", 429)]) {
      const caida = clienteCon({ autorizar_pedido: falla });
      await expect(crearAccionesPedidosRpc(caida.cliente).decidir({ tipo: "pedido", id: PEDIDO, accion: "autorizar" })).rejects.toBe(falla);
    }
  });

  it("una respuesta sin filas o sin el instante de la decisión falla con un error propio", async () => {
    const { cliente } = clienteCon({ autorizar_pedido: [] });
    await expect(crearAccionesPedidosRpc(cliente).decidir({ tipo: "pedido", id: PEDIDO, accion: "autorizar" })).rejects.toBeInstanceOf(RespuestaInesperada);
  });

  it("un reintento (ya_estaba) cuenta como decidido: no suma dos veces en la base y la vista lo ve igual", async () => {
    const { cliente } = clienteCon({ autorizar_pedido: [{ pedido_id: PEDIDO, estado: "AUTORIZADO", decidido_en: decidido, ya_estaba: true }] });
    expect(await crearAccionesPedidosRpc(cliente).decidir({ tipo: "pedido", id: PEDIDO, accion: "autorizar" })).toMatchObject({ ok: true });
  });
});

describe("editar el límite (definir_limite_de_deuda_de_campania)", () => {
  it("manda los pesos como centavos y devuelve el límite que quedó en pesos", async () => {
    const { cliente, llamarRpc } = clienteCon({ definir_limite_de_deuda_de_campania: [{ limite_deuda: 3_500_000, cambio: true }] });
    const resultado = await crearAccionesPedidosRpc(cliente).editarLimite?.(35_000, CAMPANIA);

    expect(llamarRpc).toHaveBeenCalledWith("definir_limite_de_deuda_de_campania", { p_campania_id: CAMPANIA, p_monto: 3_500_000 });
    expect(resultado).toEqual({ ok: true, valor: { limiteDeDeuda: 35_000 } });
  });

  it("«Quitar el límite» manda null y el límite queda en null", async () => {
    const { cliente, llamarRpc } = clienteCon({ definir_limite_de_deuda_de_campania: [{ limite_deuda: null, cambio: true }] });
    const resultado = await crearAccionesPedidosRpc(cliente).editarLimite?.(null, CAMPANIA);

    expect(llamarRpc).toHaveBeenCalledWith("definir_limite_de_deuda_de_campania", { p_campania_id: CAMPANIA, p_monto: null });
    expect(resultado).toEqual({ ok: true, valor: { limiteDeDeuda: null } });
  });

  it("el cero es un límite (se manda 0, no null)", async () => {
    const { cliente, llamarRpc } = clienteCon({ definir_limite_de_deuda_de_campania: [{ limite_deuda: 0, cambio: true }] });
    const resultado = await crearAccionesPedidosRpc(cliente).editarLimite?.(0, CAMPANIA);

    expect(llamarRpc).toHaveBeenCalledWith("definir_limite_de_deuda_de_campania", { p_campania_id: CAMPANIA, p_monto: 0 });
    expect(resultado).toEqual({ ok: true, valor: { limiteDeDeuda: 0 } });
  });

  it.each([[-1], [1.5], [Number.NaN], [1_000_000_000], ["35000"], [undefined]])("el límite %j no llega a la base (y nunca se toma por «quitar»)", async (limite) => {
    const { cliente, llamarRpc } = clienteCon({});
    const resultado = await crearAccionesPedidosRpc(cliente).editarLimite?.(limite as never, CAMPANIA);

    expect(resultado).toMatchObject({ ok: false, causa: "rechazado" });
    expect(llamarRpc).not.toHaveBeenCalled();
  });

  it("una campaña que no es uuid no llega a la base", async () => {
    const { cliente, llamarRpc } = clienteCon({});
    expect(await crearAccionesPedidosRpc(cliente).editarLimite?.(1000, "no-es-uuid")).toMatchObject({ ok: false });
    expect(llamarRpc).not.toHaveBeenCalled();
  });

  it("sin campaña en la llamada, usa la elegida en el topbar; sin ninguna, avisa", async () => {
    const { cliente, llamarRpc } = clienteCon({ campanias_del_coordinador: campanias, definir_limite_de_deuda_de_campania: [{ limite_deuda: 100, cambio: true }] });
    await crearAccionesPedidosRpc(cliente, async () => CAMPANIA).editarLimite?.(1);
    expect(llamarRpc).toHaveBeenCalledWith("definir_limite_de_deuda_de_campania", { p_campania_id: CAMPANIA, p_monto: 100 });

    const vacio = clienteCon({ campanias_del_coordinador: [] });
    expect(await crearAccionesPedidosRpc(vacio.cliente).editarLimite?.(1)).toMatchObject({ ok: false, causa: "rechazado" });
  });

  it("un rechazo de la base (campaña terminada, sin permiso) vuelve con su texto; la caída sigue como excepción", async () => {
    const terminada = clienteCon({ definir_limite_de_deuda_de_campania: rechazo("CZ011", "La campaña ya terminó.") });
    expect(await crearAccionesPedidosRpc(terminada.cliente).editarLimite?.(1000, CAMPANIA)).toEqual({ ok: false, causa: "rechazado", mensaje: "La campaña ya terminó." });

    const sinPermiso = clienteCon({ definir_limite_de_deuda_de_campania: rechazo("42501", "permission denied for function") });
    expect(await crearAccionesPedidosRpc(sinPermiso.cliente).editarLimite?.(1000, CAMPANIA)).toMatchObject({ ok: false, mensaje: expect.stringContaining("Solo el coordinador") });

    const caida = clienteCon({ definir_limite_de_deuda_de_campania: sinRed() });
    await expect(crearAccionesPedidosRpc(caida.cliente).editarLimite?.(1000, CAMPANIA)).rejects.toThrow("sin red");
  });
});
