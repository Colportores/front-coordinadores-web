"use client";

import { rutaParaVolverAEntrar, type MotivoDeRechazo } from "@/auth/sesion-vencida";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Lo que sigue a «Tu sesión venció» (issue #41, P3): en vez de «Reintentar», que no sirve sin sesión, lleva a la pantalla de
 * acceso con su motivo (vista 38: 05 sesión vencida, que al entrar vuelve a esta pantalla; 04 sin acceso o cuenta suspendida, que explica el caso con su texto). Es un enlace común y no `next/link`: la pantalla de acceso va sin
 * el marco del panel y eso lo decide el proxy en una carga completa. El texto del enlace es provisorio (mapa §2, sin artboard).
 */
export function EnlaceEntrarDeNuevo({ motivo }: { motivo: MotivoDeRechazo }) {
  return (
    <a href={rutaParaVolverAEntrar(motivo)} className={cn(buttonVariants({ variant: "outline" }), "min-h-6 text-nav font-semibold")}>
      Entrar de nuevo
    </a>
  );
}
