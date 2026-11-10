import { describe, expect, it } from "vitest";

import type { ItemPorValidar } from "@/datos/cuentas/validar";
import { armarValidacionSimulada } from "@/datos/cuentas/validar/simulado";

import {
  bandaDelItem,
  camposDelItem,
  contadorDelMotivo,
  encabezadoDeCola,
  etiquetaDeEstado,
  ordenarCola,
  previaDelItem,
  siguienteAccionable,
  textoDeDecision,
  textoHace,
  validarMotivo,
} from "./modelo";

const AHORA = "2026-11-10T14:00:00.000Z"; // 11:00 en Montevideo
const datos = armarValidacionSimulada(new Date(AHORA));
const item = (id: string) => datos.items.find((x) => x.id === id) as ItemPorValidar;

describe("modelo de la vista 29", () => {
  describe("ordenarCola", () => {
    it("pone lo pendiente primero, del más antiguo al más nuevo, y después lo resuelto, lo más nuevo primero", () => {
      expect(ordenarCola(datos.items).map((x) => x.colportorNombre)).toEqual([
        "Marta Pérez",
        "Gonzalo Méndez",
        "Lucía Fernández",
        "Valentina Silva",
        "Joaquín Duarte",
        "Lucía Benítez",
        "Agustina Rey",
        "Bruno Techera",
      ]);
    });
  });

  describe("textoHace", () => {
    it("dice minutos, horas y días, nunca negativo", () => {
      expect(textoHace("2026-11-10T13:20:00.000Z", AHORA)).toBe("hace 40 min");
      expect(textoHace("2026-11-10T11:00:00.000Z", AHORA)).toBe("hace 3 h");
      expect(textoHace("2026-11-09T13:00:00.000Z", AHORA)).toBe("hace 1 día");
      expect(textoHace("2026-11-08T13:00:00.000Z", AHORA)).toBe("hace 2 días");
      expect(textoHace("2026-11-10T15:00:00.000Z", AHORA)).toBe("recién");
      expect(textoHace("no es fecha", AHORA)).toBe("—");
    });
  });

  it("el encabezado cuenta solo lo que se puede validar (no el retiro propio) y dice el más antiguo", () => {
    expect(encabezadoDeCola(datos.items, AHORA)).toEqual({ cantidad: 5, masAntiguo: "hace 1 día" });
    expect(encabezadoDeCola([], AHORA)).toEqual({ cantidad: 0, masAntiguo: null });
  });

  it("el estado del retiro dice «Por confirmar» y «Confirmado»; el del depósito, «Por validar» y «Validado»", () => {
    expect(etiquetaDeEstado({ tipo: "retiro", estado: "PENDIENTE" }).texto).toBe("◔ Por confirmar");
    expect(etiquetaDeEstado({ tipo: "retiro", estado: "VALIDADO" }).texto).toBe("✓ Confirmado");
    expect(etiquetaDeEstado({ tipo: "deposito", estado: "PENDIENTE" }).texto).toBe("◔ Por validar");
    expect(etiquetaDeEstado({ tipo: "deposito", estado: "VALIDADO" }).texto).toBe("✓ Validado");
    expect(etiquetaDeEstado({ tipo: "deposito", estado: "RECHAZADO" })).toEqual({ texto: "✕ Rechazado", tono: "peligro" });
  });

  it("el depósito muestra los campos nuevos del ticket; el retiro, los de 36R·01", () => {
    expect(camposDelItem(item("lucia-fernandez-por-validar"), AHORA).map((c) => `${c.rotulo}=${c.valor}`)).toEqual([
      "MONTO=$U 9.000",
      "PARA QUÉ ES=Casa editora",
      "DÓNDE=Depósito en banco · BROU",
      "N.º DE AUTORIZACIÓN=0482",
      "TARJETA=No",
      "COLPORTOR=Lucía Fernández",
      "CIUDAD=Rivera",
      "FECHA DEL DEPÓSITO=09/11/2026",
      "ENVIADO=hace 15 h",
    ]);
    expect(camposDelItem(item("marta-perez-retiro"), AHORA).map((c) => c.rotulo)).toEqual([
      "MONTO",
      "PARA QUÉ ES",
      "COLPORTOR",
      "CIUDAD",
      "FECHA DE ENTREGA",
      "ENVIADO",
    ]);
    expect(camposDelItem(item("marta-perez-retiro"), AHORA)[2].valor).toBe("Marta Pérez · vos");
  });

  describe("previaDelItem", () => {
    it("dice en mano, la deuda y cómo queda (36R·01)", () => {
      expect(previaDelItem(item("lucia-benitez-retiro"))?.campos.map((c) => `${c.rotulo}=${c.valor}`)).toEqual([
        "EN MANO SEGÚN LA APP=$U 9.400",
        "DEUDA CON LA CASA EDITORA=$U 21.300",
        "SI CONFIRMÁS, QUEDA EN=$U 15.300",
      ]);
    });

    it("un depósito de casa editora mayor que la deuda avisa lo que queda a favor, sin frenar («Pago de más»)", () => {
      const previa = previaDelItem(item("joaquin-duarte-de-mas"));
      expect(previa?.aviso).toBe("Supera la deuda de $U 5.000: quedan $U 3.000 a favor");
      expect(previa?.campos[2]).toMatchObject({ rotulo: "SI VALIDÁS, QUEDA EN", valor: "a favor $U 3.000" });
    });

    it("el alquiler usa su propia deuda", () => {
      expect(previaDelItem(item("valentina-silva-alquiler"))?.campos[1]).toMatchObject({ rotulo: "DEUDA DE ALQUILER", valor: "$U 13.500" });
    });

    it("lo resuelto o lo propio no tiene previa", () => {
      expect(previaDelItem(item("agustina-rey-retiro"))).toBeNull();
      expect(previaDelItem(item("marta-perez-retiro"))).toBeNull();
    });
  });

  describe("validarMotivo", () => {
    it("pide el motivo si está vacío o es solo espacios, con el texto de cada tipo", () => {
      expect(validarMotivo("   ", "deposito")).toEqual({ ok: false, error: "Escribí el motivo para rechazar el ticket." });
      expect(validarMotivo("", "retiro")).toEqual({ ok: false, error: "Escribí el motivo para rechazar el retiro." });
    });

    it("no corta un motivo de más de 500: avisa con el número", () => {
      expect(validarMotivo("a".repeat(612), "retiro")).toEqual({ ok: false, error: "El motivo tiene 612 caracteres y el máximo es 500. Acortalo para rechazar." });
      expect(validarMotivo(`  ${"a".repeat(500)}  `, "retiro")).toEqual({ ok: true, motivo: "a".repeat(500) });
      expect(contadorDelMotivo("a".repeat(1200))).toBe("1.200 / 500");
    });
  });

  it("los avisos de abajo nombran al ticket o al retiro", () => {
    expect(textoDeDecision(item("lucia-fernandez-por-validar"), "validar")).toBe("✓ Ticket 0482 de Lucía Fernández validado.");
    expect(textoDeDecision(item("lucia-benitez-retiro"), "rechazar")).toBe("✕ Retiro de Lucía Benítez rechazado. Le avisamos.");
    expect(textoDeDecision(item("lucia-benitez-retiro"), "validar")).toBe("✓ Retiro de Lucía Benítez confirmado.");
  });

  it("la franja del retiro propio dice quién lo resuelve; la de lo rechazado, quién y cuándo", () => {
    expect(bandaDelItem(item("marta-perez-retiro"), AHORA)?.texto).toBe(
      "Este retiro es tuyo. Nadie confirma ni rechaza lo suyo: lo resuelve otro coordinador o el administrador.",
    );
    expect(bandaDelItem(item("agustina-rey-retiro"), AHORA)?.texto).toBe("Confirmado por vos · ayer 09:12");
    expect(bandaDelItem(item("lucia-benitez-retiro"), AHORA)).toBeNull();
  });

  it("después de decidir abre el siguiente que se puede validar, o el primero de antes, o ninguno", () => {
    const cola = ordenarCola(datos.items);
    expect(siguienteAccionable(cola, "lucia-fernandez-por-validar")).toBe("valentina-silva-alquiler");
    expect(siguienteAccionable(cola, "lucia-benitez-retiro")).toBe("gonzalo-mendez-retiro");
    const sola = cola.filter((x) => x.id === "lucia-benitez-retiro");
    expect(siguienteAccionable(sola, "lucia-benitez-retiro")).toBeNull();
  });
});
