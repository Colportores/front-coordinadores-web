import { describe, expect, it } from "vitest";

import type { DatosDeCuentas, TicketDeCuentas } from "@/datos/cuentas";
import { armarCuentasSimuladas } from "@/datos/cuentas/simulado";
import {
  aplicarAlquiler,
  aplicarTicket,
  avisoDePendientes,
  ciudadesDe,
  claveDe,
  colportoresDe,
  elementosDeLista,
  estadoDeAlquiler,
  filasDe,
  kpisDeAlquiler,
  kpisDeCasaEditora,
  kpisDeTickets,
  leerMonto,
  ordenarFilas,
  pendientesDe,
  porcentajeCobrado,
  seleccionVigente,
  siguienteOrden,
  subtituloDeSeleccion,
  textoDeEstado,
  textoDeMedio,
  textoDeNumero,
  textoDeSaldo,
  textoDeTraslado,
  ticketsDe,
  tituloDeSeleccion,
  TODAS,
  validarAlquiler,
  type Seleccion,
} from "@/features/cuentas/modelo";

const datos = armarCuentasSimuladas(new Date("2026-10-22T15:00:00.000Z"));
const ARTIGAS: Seleccion = { tipo: "ciudad", ciudadId: "artigas" };
const RIVERA: Seleccion = { tipo: "ciudad", ciudadId: "rivera" };
const DEPTO_ARTIGAS: Seleccion = { tipo: "departamento", departamento: "Artigas" };

function conTickets(tickets: TicketDeCuentas[]): DatosDeCuentas {
  return { ...datos, tickets };
}

function ticketDe(id: string): TicketDeCuentas {
  const ticket = datos.tickets.find((t) => t.id === id);
  if (!ticket) throw new Error(`Falta el ticket ${id}`);
  return ticket;
}

describe("selección de ciudades", () => {
  it("la lista agrupa por departamento y ofrece «Todo el departamento» solo si tiene más de una ciudad", () => {
    expect(elementosDeLista(datos).map((e) => (e.tipo === "grupo" ? e.etiqueta : e.nombre))).toEqual([
      "Todas las ciudades",
      "DEPTO. RIVERA",
      "Rivera",
      "DEPTO. ARTIGAS",
      "Todo el departamento",
      "Artigas",
      "Bella Unión",
    ]);
  });

  it("cada ítem cuenta los tickets por validar de su alcance", () => {
    const pendientes = Object.fromEntries(elementosDeLista(datos).flatMap((e) => (e.tipo === "ciudad" ? [[e.clave, e.pendientes]] : [])));
    expect(pendientes).toEqual({
      todas: 2,
      "ciudad:rivera": 1,
      "departamento:Artigas": 1,
      "ciudad:artigas": 1,
      "ciudad:bella-union": 0,
    });
  });

  it("las siglas de la barra contraída salen del nombre", () => {
    const siglas = elementosDeLista(datos).flatMap((e) => (e.tipo === "ciudad" ? [e.sigla] : []));
    expect(siglas).toEqual(["Todas", "Riv.", "Dpto.", "Art.", "B. Un."]);
  });

  it("título, alcance y subtítulo", () => {
    expect(tituloDeSeleccion(datos, TODAS)).toBe("Todas las ciudades");
    expect(tituloDeSeleccion(datos, DEPTO_ARTIGAS)).toBe("Departamento Artigas");
    expect(tituloDeSeleccion(datos, ARTIGAS)).toBe("Artigas");
    expect(colportoresDe(datos, TODAS)).toHaveLength(26);
    expect(colportoresDe(datos, DEPTO_ARTIGAS)).toHaveLength(15);
    expect(ciudadesDe(datos, DEPTO_ARTIGAS).map((c) => c.id)).toEqual(["artigas", "bella-union"]);
    expect(subtituloDeSeleccion(datos, RIVERA)).toBe("11 colportores · Departamento Rivera");
    expect(subtituloDeSeleccion(datos, ARTIGAS)).toBe(
      "8 colportores · Departamento Artigas · en Artigas no hay banco: el coordinador retira el efectivo",
    );
    expect(subtituloDeSeleccion(datos, TODAS)).toBe("26 colportores · en Artigas y Bella Unión no hay banco: el coordinador retira el efectivo");
  });

  it("una ciudad con un solo colportor dice «1 colportor»", () => {
    const uno: DatosDeCuentas = {
      ...datos,
      colportores: datos.colportores.filter((c) => c.ciudadId !== "artigas" || c.id === "sofia-cabral"),
    };
    expect(subtituloDeSeleccion(uno, ARTIGAS)).toMatch(/^1 colportor · /);
  });

  it("una selección que ya no figura vuelve a «todas»", () => {
    expect(seleccionVigente(datos, { tipo: "ciudad", ciudadId: "paysandu" })).toBe(TODAS);
    expect(seleccionVigente(datos, { tipo: "departamento", departamento: "Salto" })).toBe(TODAS);
    expect(seleccionVigente(datos, ARTIGAS)).toBe(ARTIGAS);
    expect(claveDe(DEPTO_ARTIGAS)).toBe("departamento:Artigas");
  });
});

describe("tickets", () => {
  it("van del más nuevo al más viejo y se filtran por colportor", () => {
    const todos = ticketsDe(datos, ARTIGAS, "");
    const fechas = todos.map((f) => Date.parse(f.ticket.fecha));
    expect(fechas).toEqual([...fechas].sort((a, b) => b - a));
    expect(todos[0].ticket.id).toBe("sofia-cabral-por-validar");
    const deSofia = ticketsDe(datos, ARTIGAS, "sofia-cabral");
    expect(deSofia.every((f) => f.colportor.id === "sofia-cabral")).toBe(true);
    expect(deSofia.length).toBeLessThan(todos.length);
  });

  it("un colportor fuera de la selección no aparece aunque esté filtrado", () => {
    expect(ticketsDe(datos, RIVERA, "sofia-cabral")).toEqual([]);
  });

  it("los pendientes son solo los PENDIENTE", () => {
    expect(pendientesDe(datos, TODAS).map((f) => f.ticket.id)).toEqual(["sofia-cabral-por-validar", "lucia-fernandez-por-validar"]);
  });

  it("textos del medio, número y estado", () => {
    const sofia = ticketDe("sofia-cabral-por-validar");
    const bruno = ticketDe("bruno-techera-rechazado");
    expect(textoDeMedio(sofia)).toBe("Tarjeta de débito · Visa");
    expect(textoDeNumero(sofia)).toBe("aut. 483920");
    expect(textoDeMedio(bruno)).toBe("Depósito en banco · BROU");
    expect(textoDeNumero(bruno)).toBe("recibo 0377");
    expect(textoDeEstado(bruno)).toBe("Rechazado · Foto ilegible");
    expect(textoDeEstado(sofia)).toBe("Por validar");
    const retiro: TicketDeCuentas = { ...sofia, medio: "retiro-coordinador", entidad: undefined, numero: undefined, estado: "VALIDADO" };
    expect(textoDeMedio(retiro)).toBe("Retiro por el coordinador");
    expect(textoDeNumero(retiro)).toBe("");
    expect(textoDeEstado(retiro)).toBe("Validado");
    expect(textoDeEstado({ ...bruno, motivoRechazo: undefined })).toBe("Rechazado");
  });

  it("la franja de pendientes resume quién, cuánto y cuándo", () => {
    expect(avisoDePendientes([], datos.ahora)).toBeNull();
    const aviso = avisoDePendientes(pendientesDe(datos, TODAS), datos.ahora);
    expect(aviso?.titulo).toBe("2 tickets por validar");
    expect(aviso?.detalle).toBe("· Sofía Cabral $U 18.500 (hoy 09:15) · Lucía Fernández $U 9.000 (ayer 18:30)");
    expect(avisoDePendientes(pendientesDe(datos, ARTIGAS), datos.ahora)?.titulo).toBe("1 ticket por validar");
  });

  it("las cifras de tickets cuentan por estado y suman lo validado", () => {
    const filas = ticketsDe(datos, ARTIGAS, "");
    const [porValidar, validados, retiros, rechazados] = kpisDeTickets(filas);
    expect(porValidar.valor).toBe("1");
    expect(rechazados.valor).toBe("0");
    expect(retiros.valor).toBe(String(filas.filter((f) => f.ticket.medio === "retiro-coordinador").length));
    expect(validados.valor).toBe(String(filas.filter((f) => f.ticket.estado === "VALIDADO").length));
    expect(kpisDeTickets(ticketsDe(datos, RIVERA, ""))[3].valor).toBe("1");
  });
});

describe("filas por colportor", () => {
  const filas = filasDe(datos, TODAS);

  it("el alquiler pagado y lo que debe de cada inscripto salen de los tickets validados: suman el alquiler y ninguno pasa de él ni baja de cero", () => {
    const inscriptos = (lista: typeof filas) => lista.filter((f) => !f.colportor.baja);
    for (const f of inscriptos(filas)) {
      expect(f.pagadoAlquiler + f.debeAlquiler).toBe(datos.alquilerPorColportor);
      expect(f.trasladadoAlquiler).toBe(0);
    }
    // Quien se dio de baja no debe: lo que pagó lo decide el coordinador (vista 41).
    for (const f of filas.filter((x) => x.colportor.baja)) expect(f.debeAlquiler).toBe(0);
    const sobrepago = inscriptos(filasDe(aplicarAlquiler(datos, 1000), TODAS));
    expect(sobrepago.every((f) => f.debeAlquiler >= 0 && f.pagadoAlquiler <= 1000)).toBe(true);
    expect(sobrepago.every((f) => f.pagadoAlquiler + f.debeAlquiler === 1000)).toBe(true);
  });

  it("un ticket por validar o rechazado no acredita nada", () => {
    const base: TicketDeCuentas = {
      id: "t",
      colportorId: "sofia-cabral",
      fecha: datos.ahora,
      monto: 18500,
      medio: "retiro-coordinador",
      destino: "alquiler",
      estado: "PENDIENTE",
      tieneFoto: false,
    };
    const deSofia = (d: DatosDeCuentas) => filasDe(d, ARTIGAS).find((f) => f.colportor.id === "sofia-cabral");
    expect(deSofia(conTickets([]))?.pagadoAlquiler).toBe(0);
    expect(deSofia(conTickets([base]))?.pagadoAlquiler).toBe(0);
    expect(deSofia(conTickets([base]))?.ultimoDeposito).toBeNull();
    expect(deSofia(conTickets([{ ...base, estado: "RECHAZADO" }]))?.pagadoAlquiler).toBe(0);
    const validado = deSofia(conTickets([{ ...base, estado: "VALIDADO" }]));
    expect(validado?.pagadoAlquiler).toBe(18500);
    expect(validado?.ultimoPagoAlquiler).toBe(datos.ahora);
  });

  it("el estado de alquiler es pagado, parcial o debe todo", () => {
    const f = filas[0];
    expect(estadoDeAlquiler({ ...f, pagadoAlquiler: 18500 }, 18500)).toBe("pagado");
    expect(estadoDeAlquiler({ ...f, pagadoAlquiler: 20000 }, 18500)).toBe("pagado");
    expect(estadoDeAlquiler({ ...f, pagadoAlquiler: 5000 }, 18500)).toBe("parcial");
    expect(estadoDeAlquiler({ ...f, pagadoAlquiler: 0 }, 18500)).toBe("debe-todo");
    expect(estadoDeAlquiler({ ...f, pagadoAlquiler: 0 }, 0)).toBe("pagado");
  });

  it("el porcentaje cobrado no divide por cero", () => {
    const c = datos.colportores[0];
    expect(porcentajeCobrado({ ...c, depositado: 0, enMano: 0, porCobrar: 0 })).toBeNull();
    expect(porcentajeCobrado({ ...c, depositado: 50, enMano: 25, porCobrar: 25 })).toBe(75);
  });

  it("las cifras de casa editora suman la selección", () => {
    const [deuda, depositado] = kpisDeCasaEditora(filasDe(datos, RIVERA));
    const rivera = datos.colportores.filter((c) => c.ciudadId === "rivera");
    const suma = rivera.reduce((t, c) => t + c.deuda, 0);
    expect(deuda.rotulo).toBe("DEUDA TOTAL");
    expect(deuda.valor).toBe(`$U ${suma.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`);
    expect(depositado.rotulo).toBe("DEPOSITADO");
  });

  it("las cifras de alquiler: total, pagado con porcentaje, deben y pagaron todo", () => {
    const [total, pagado, deben, pagaron] = kpisDeAlquiler(filasDe(datos, RIVERA), datos.alquilerPorColportor);
    expect(total.valor).toBe("$U 92.500");
    expect(total.detalle).toBe("5 × $U 18.500");
    expect(pagado.extra).toMatch(/^\d+%$/);
    expect(deben.detalle).toMatch(/colportor/);
    expect(pagaron.extra).toBe("de 5");
  });

  it("las cifras de alquiler con cero colportores no dan NaN ni dividen por cero", () => {
    const cifras = kpisDeAlquiler([], 18500);
    expect(cifras[0].valor).toBe("$U 0");
    expect(cifras[1].extra).toBe("");
    expect(cifras[2].detalle).toBe("0 colportores");
    expect(cifras[3].valor).toBe("0");
    expect(JSON.stringify(cifras)).not.toContain("NaN");
  });
});

describe("orden de las tablas", () => {
  const filas = filasDe(datos, DEPTO_ARTIGAS);
  const deArtigas = (ordenadas: typeof filas) => ordenadas.filter((f) => f.ciudad.id === "artigas");

  it("ordena dentro de cada ciudad y no mezcla los grupos", () => {
    const ordenadas = ordenarFilas(filas, { columna: "debe", sentido: "desc" });
    expect(ordenadas.slice(0, 8).every((f) => f.ciudad.id === "artigas")).toBe(true);
    const debe = deArtigas(ordenadas).map((f) => f.debeAlquiler);
    expect(debe).toEqual([...debe].sort((a, b) => b - a));
  });

  it("por nombre va de la A a la Z y al revés", () => {
    const asc = deArtigas(ordenarFilas(filas, { columna: "colportor", sentido: "asc" })).map((f) => f.colportor.nombre);
    expect(asc).toEqual([...asc].sort((a, b) => a.localeCompare(b, "es")));
    const desc = deArtigas(ordenarFilas(filas, { columna: "colportor", sentido: "desc" })).map((f) => f.colportor.nombre);
    expect(desc).toEqual([...asc].reverse());
  });

  it("dos filas sin fecha empatan sin romper el orden", () => {
    const sinFecha = filas.map((f) => ({ ...f, ultimoPagoAlquiler: null }));
    expect(ordenarFilas(sinFecha, { columna: "ultimoPago", sentido: "desc" })).toHaveLength(filas.length);
  });

  it("sin orden respeta el de los datos", () => {
    expect(ordenarFilas(filas, null).map((f) => f.colportor.id)).toEqual(filas.map((f) => f.colportor.id));
  });

  it("el clic en la cabecera cicla: primero, al revés, sin orden", () => {
    const una = siguienteOrden(null, "deuda");
    expect(una).toEqual({ columna: "deuda", sentido: "desc" });
    const dos = siguienteOrden(una, "deuda");
    expect(dos).toEqual({ columna: "deuda", sentido: "asc" });
    expect(siguienteOrden(dos, "deuda")).toBeNull();
    expect(siguienteOrden(dos, "debe")).toEqual({ columna: "debe", sentido: "desc" });
    expect(siguienteOrden(null, "colportor")).toEqual({ columna: "colportor", sentido: "asc" });
  });
});

describe("leerMonto", () => {
  it.each([
    ["18500", 18500],
    ["18.500", 18500],
    [" 5 000 ", 5000],
    ["0", 0],
    ["007", 7],
  ])("lee %s como %i", (texto, valor) => {
    expect(leerMonto(texto)).toEqual({ ok: true, valor });
  });

  it.each([
    ["", "vacio"],
    ["   ", "vacio"],
    ["12,5", "formato"],
    ["-100", "formato"],
    ["1e3", "formato"],
    ["mil", "formato"],
    ["1234567890", "largo"],
  ])("rechaza «%s» (%s)", (texto, motivo) => {
    expect(leerMonto(texto)).toEqual({ ok: false, motivo });
  });
});

describe("validarAlquiler", () => {
  it("acepta 0 y enteros; rechaza vacío, decimales y negativos", () => {
    expect(validarAlquiler("0")).toEqual({ error: null, monto: 0 });
    expect(validarAlquiler("20.000")).toEqual({ error: null, monto: 20000 });
    expect(validarAlquiler("").monto).toBeNull();
    expect(validarAlquiler("").error).toMatch(/0 si la campaña no cobra/);
    expect(validarAlquiler("1,5").monto).toBeNull();
    expect(validarAlquiler("-3").monto).toBeNull();
  });
});

const sinPagosDeAlquilerDeSofia = (d: DatosDeCuentas): DatosDeCuentas => ({
  ...d,
  tickets: d.tickets.filter((t) => !(t.colportorId === "sofia-cabral" && t.destino === "alquiler")),
});

describe("escrituras sobre una copia", () => {
  const sofia = datos.colportores.find((c) => c.id === "sofia-cabral")!;
  const retiro = (monto: number, destino: TicketDeCuentas["destino"], estado: TicketDeCuentas["estado"] = "VALIDADO"): TicketDeCuentas => ({
    id: `r-${monto}-${destino}-${estado}`,
    colportorId: "sofia-cabral",
    fecha: datos.ahora,
    monto,
    medio: "retiro-coordinador",
    destino,
    estado,
    tieneFoto: false,
  });
  const deSofia = (d: DatosDeCuentas) => d.colportores.find((c) => c.id === "sofia-cabral")!;

  it("validar acredita: sube Depositado y baja la deuda de casa editora", () => {
    const despues = deSofia(aplicarTicket(datos, retiro(1000, "casa-editora")));
    expect(despues.depositado).toBe(sofia.depositado + 1000);
    expect(despues.deuda).toBe(sofia.deuda - 1000);
    expect(despues.enMano).toBe(sofia.enMano);
  });

  it("la deuda no pasa de cero aunque el retiro sea mayor", () => {
    const despues = deSofia(aplicarTicket(datos, retiro(sofia.deuda + 5000, "casa-editora")));
    expect(despues.deuda).toBe(0);
    expect(despues.depositado).toBe(sofia.depositado + sofia.deuda + 5000);
    expect(despues.aFavor).toBe(5000);
  });

  it("lo que ya estaba a favor se suma al siguiente pago de más; un pago que no pasa la deuda no suma", () => {
    const una = aplicarTicket(datos, retiro(sofia.deuda + 5000, "casa-editora"));
    const otro = { ...retiro(2000, "casa-editora"), id: "otro-retiro" };
    expect(deSofia(aplicarTicket(una, otro)).aFavor).toBe(7000);
    expect(deSofia(aplicarTicket(datos, retiro(1000, "casa-editora"))).aFavor).toBe(0);
  });

  it("un pago de alquiler no toca el saldo a favor de la casa editora", () => {
    expect(deSofia(aplicarTicket(sinPagosDeAlquilerDeSofia(datos), retiro(1000, "alquiler"))).aFavor).toBe(sofia.aFavor);
  });

  describe("alquiler pagado de más: se traslada a la deuda con la casa editora", () => {
    // Sofía sin pagos de alquiler: cada caso parte de un alquiler y de un pago que se eligen acá.
    const sinPagos = sinPagosDeAlquilerDeSofia(datos);
    const filaDeSofia = (d: DatosDeCuentas) => filasDe(d, ARTIGAS).find((f) => f.colportor.id === "sofia-cabral")!;
    const conDeuda = (d: DatosDeCuentas, deuda: number): DatosDeCuentas => ({
      ...d,
      colportores: d.colportores.map((c) => (c.id === "sofia-cabral" ? { ...c, deuda, aFavor: undefined } : c)),
    });

    it("Lucía paga 3.000 de un alquiler de 2.500: el alquiler queda pagado, no debe nada y 500 bajan la deuda", () => {
      const base = conDeuda(aplicarAlquiler(sinPagos, 2500), 10000);
      const despues = aplicarTicket(base, retiro(3000, "alquiler"));
      const fila = filaDeSofia(despues);
      expect(fila.pagadoAlquiler).toBe(2500);
      expect(fila.debeAlquiler).toBe(0);
      expect(fila.trasladadoAlquiler).toBe(500);
      expect(estadoDeAlquiler(fila, 2500)).toBe("pagado");
      expect(deSofia(despues).deuda).toBe(9500);
      expect(deSofia(despues).aFavor).toBeUndefined();
      expect(textoDeTraslado(fila.trasladadoAlquiler)).toBe("Descuento por alquiler pagado de más: $U 500");
    });

    it("pagar justo el alquiler o menos no traslada nada ni toca la deuda", () => {
      const base = conDeuda(aplicarAlquiler(sinPagos, 2500), 10000);
      for (const monto of [1000, 2500]) {
        const despues = aplicarTicket(base, retiro(monto, "alquiler"));
        expect(filaDeSofia(despues).trasladadoAlquiler).toBe(0);
        expect(deSofia(despues).deuda).toBe(10000);
      }
    });

    it("varios pagos que juntos pasan del alquiler trasladan solo lo que pasa, una vez", () => {
      const base = conDeuda(aplicarAlquiler(sinPagos, 2500), 10000);
      const dos = aplicarTicket(aplicarTicket(base, retiro(2000, "alquiler")), retiro(1000, "alquiler"));
      expect(filaDeSofia(dos).trasladadoAlquiler).toBe(500);
      expect(deSofia(dos).deuda).toBe(9500);
      const tres = aplicarTicket(dos, retiro(700, "alquiler"));
      expect(filaDeSofia(tres).trasladadoAlquiler).toBe(1200);
      expect(deSofia(tres).deuda).toBe(8800);
    });

    it("un pago por validar o rechazado no traslada", () => {
      const base = conDeuda(aplicarAlquiler(sinPagos, 2500), 10000);
      for (const estado of ["PENDIENTE", "RECHAZADO"] as const) {
        const despues = aplicarTicket(base, retiro(3000, "alquiler", estado));
        expect(filaDeSofia(despues).trasladadoAlquiler).toBe(0);
        expect(deSofia(despues).deuda).toBe(10000);
      }
    });

    it("si lo trasladado pasa de la deuda, la deuda queda en 0 y el resto queda a favor de la casa editora", () => {
      const base = conDeuda(aplicarAlquiler(sinPagos, 2500), 300);
      const despues = aplicarTicket(base, retiro(3000, "alquiler"));
      expect(deSofia(despues).deuda).toBe(0);
      expect(deSofia(despues).aFavor).toBe(200);
      expect(filaDeSofia(despues).trasladadoAlquiler).toBe(500);
    });

    it("subir el alquiler deshace el traslado: vuelve primero de lo que estaba a favor y después a la deuda", () => {
      const pagado = aplicarTicket(conDeuda(aplicarAlquiler(sinPagos, 2500), 300), retiro(3000, "alquiler"));
      const subido = aplicarAlquiler(pagado, 2800);
      expect(filaDeSofia(subido).trasladadoAlquiler).toBe(200);
      expect(deSofia(subido).aFavor).toBe(0);
      expect(deSofia(subido).deuda).toBe(100);
      const todo = aplicarAlquiler(pagado, 4000);
      expect(filaDeSofia(todo).trasladadoAlquiler).toBe(0);
      expect(filaDeSofia(todo).debeAlquiler).toBe(1000);
      expect(deSofia(todo).aFavor).toBe(0);
      expect(deSofia(todo).deuda).toBe(300);
    });

    it("bajar el alquiler traslada lo que ya estaba pagado", () => {
      const pagado = aplicarTicket(conDeuda(aplicarAlquiler(sinPagos, 4000), 10000), retiro(3000, "alquiler"));
      expect(filaDeSofia(pagado).trasladadoAlquiler).toBe(0);
      const bajado = aplicarAlquiler(pagado, 2500);
      expect(filaDeSofia(bajado).trasladadoAlquiler).toBe(500);
      expect(deSofia(bajado).deuda).toBe(9500);
    });

    it("con una campaña sin alquiler (0) no se traslada nada: lo pagado queda como está", () => {
      const pagado = aplicarTicket(conDeuda(aplicarAlquiler(sinPagos, 2500), 10000), retiro(3000, "alquiler"));
      const sin = aplicarAlquiler(pagado, 0);
      expect(filaDeSofia(sin).trasladadoAlquiler).toBe(0);
      expect(filaDeSofia(sin).pagadoAlquiler).toBe(3000);
      expect(filaDeSofia(sin).debeAlquiler).toBe(0);
      expect(deSofia(sin).deuda).toBe(10000);
    });

    it("el pago a la casa editora no se confunde con el alquiler", () => {
      const base = conDeuda(aplicarAlquiler(sinPagos, 2500), 10000);
      expect(filaDeSofia(aplicarTicket(base, retiro(3000, "casa-editora"))).trasladadoAlquiler).toBe(0);
    });
  });

  it("textoDeSaldo dice «a favor» solo cuando no se debe nada y hay saldo", () => {
    expect(textoDeSaldo(0, 3000)).toBe("a favor $U 3.000");
    expect(textoDeSaldo(0, 0)).toBe("$U 0");
    expect(textoDeSaldo(500, 3000)).toBe("$U 500");
  });

  it("un depósito de alquiler dentro del alquiler no toca la deuda de casa editora y sí el alquiler pagado", () => {
    const sinPagos = sinPagosDeAlquilerDeSofia(datos);
    const despues = filasDe(aplicarTicket(sinPagos, retiro(1000, "alquiler")), ARTIGAS).find((f) => f.colportor.id === "sofia-cabral")!;
    expect(despues.colportor.deuda).toBe(sofia.deuda);
    expect(despues.pagadoAlquiler).toBe(1000);
  });

  it("un ticket que no está validado se suma al historial pero no acredita", () => {
    const nuevos = aplicarTicket(datos, retiro(1000, "casa-editora", "PENDIENTE"));
    expect(nuevos.tickets).toHaveLength(datos.tickets.length + 1);
    expect(nuevos.colportores).toBe(datos.colportores);
  });

  it("el mismo ticket dos veces se aplica una sola (doble respuesta, doble toque)", () => {
    const una = aplicarTicket(datos, retiro(1000, "casa-editora"));
    expect(aplicarTicket(una, retiro(1000, "casa-editora"))).toBe(una);
  });

  it("no muta los datos de partida", () => {
    const copia = structuredClone(datos);
    aplicarTicket(datos, retiro(1000, "casa-editora"));
    aplicarAlquiler(datos, 1);
    expect(datos).toEqual(copia);
  });

  it("cambiar el alquiler cambia lo que debe cada uno", () => {
    const nuevos = aplicarAlquiler(datos, 30000);
    expect(nuevos.alquilerPorColportor).toBe(30000);
    expect(Math.max(...filasDe(nuevos, TODAS).map((f) => f.debeAlquiler))).toBe(30000);
  });
});
