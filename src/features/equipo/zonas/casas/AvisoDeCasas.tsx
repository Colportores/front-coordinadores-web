"use client";

import { cn } from "@/lib/utils";

/** Los avisos que el diseño pone arriba del mapa (24P·04 a 24P·08). */
export type AvisoDelMapa =
  | { tipo: "cargando"; ciudad: string }
  | { tipo: "vacio"; ciudad: string }
  | { tipo: "error"; onReintentar(): void }
  | { tipo: "sin-conexion"; hora: string }
  | { tipo: "agrupadas" };

function textoDe(aviso: AvisoDelMapa): string {
  switch (aviso.tipo) {
    case "cargando":
      return `Cargando las casas de ${aviso.ciudad}…`;
    case "vacio":
      return `Todavía no hay casas registradas en ${aviso.ciudad}. Aparecen acá cuando los colportores las registran y sincronizan.`;
    case "error":
      return "No pudimos traer las casas. Las zonas se pueden editar igual.";
    case "sin-conexion":
      return `Sin conexión. Ves las casas como estaban a las ${aviso.hora}; no se pueden guardar zonas.`;
    case "agrupadas":
      return "Acercá el mapa para ver el estado de cada casa.";
  }
}

/**
 * La pastilla de arriba del mapa. Informa sin quitar el foco: el error es una alerta y el resto, un aviso cortés (`aria-live`,
 * no un `role="status"` más: la vista ya tiene el de las acciones).
 */
export function AvisoDeCasas({ aviso }: { aviso: AvisoDelMapa }) {
  const error = aviso.tipo === "error";
  const sinConexion = aviso.tipo === "sin-conexion";
  return (
    <div
      role={error ? "alert" : undefined}
      aria-live={error ? undefined : "polite"}
      data-aviso-de-casas={aviso.tipo}
      className={cn(
        "absolute top-[18px] left-1/2 z-10 flex max-w-[560px] -translate-x-1/2 items-center gap-2.5 rounded-lg bg-superficie px-3.5 py-2.5 shadow-lg",
        sinConexion ? "border-[1.5px] border-dashed" : "border-[1.5px] border-solid",
        error ? "border-peligro" : sinConexion ? "border-tinta-suave" : "border-tinta-2",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid size-5 flex-none place-items-center rounded-full text-mini font-bold text-superficie",
          error ? "bg-peligro" : sinConexion ? "bg-tinta-suave" : "bg-tinta-2",
        )}
      >
        {error ? "!" : sinConexion ? "✕" : "i"}
      </span>
      <span className="text-nav leading-[1.4] wrap-anywhere text-tinta">{textoDe(aviso)}</span>
      {aviso.tipo === "error" ? (
        <button
          type="button"
          onClick={aviso.onReintentar}
          className="flex-none cursor-pointer rounded-control pl-1.5 text-nav font-semibold text-marca-media underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none"
        >
          Reintentar
        </button>
      ) : null}
    </div>
  );
}
