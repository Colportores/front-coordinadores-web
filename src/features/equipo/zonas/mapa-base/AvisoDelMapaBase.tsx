"use client";

import { cn } from "@/lib/utils";

/** Lo que el mapa le avisa al coordinador cuando no puede dibujar todo (issue #140). */
export type AvisoBase =
  /** El navegador no puede crear el mapa: no hay nada que dibujar. */
  | { tipo: "sin-webgl" }
  /** El estilo o los tiles de las calles no llegaron; las zonas se ven igual. */
  | { tipo: "sin-calles"; onReintentar(): void }
  /** El mapa no termina de cargar (el motor del mapa no se sirvió o la red está muy lenta). */
  | { tipo: "lento" }
  /** El bucket responde, pero todavía no publicó el mapa de esta ciudad. */
  | { tipo: "sin-paquete"; ciudad: string };

function textoDe(aviso: AvisoBase): string {
  switch (aviso.tipo) {
    case "sin-webgl":
      return "Este navegador no puede dibujar el mapa (le falta WebGL). Probá con Chrome, Edge o Firefox actualizados, o activá la aceleración por hardware en sus ajustes y recargá la página. Las zonas se siguen viendo en la lista.";
    case "sin-calles":
      return "No pudimos traer las calles del mapa. Las zonas se ven y se pueden editar igual.";
    case "lento":
      return "El mapa tarda más de lo normal en dibujarse. Si sigue en blanco, recargá la página; si pasa de nuevo, avisale al equipo técnico.";
    case "sin-paquete":
      return `Todavía no hay mapa de calles de ${aviso.ciudad}. Las zonas se ven y se pueden editar igual; avisale al equipo técnico para que lo publique.`;
  }
}

/**
 * Sin WebGL ocupa el lugar del mapa (no hay mapa); el resto es una pastilla abajo a la izquierda, que no tapa el aviso de las
 * casas (arriba) ni el zoom (abajo a la derecha). Lo que falla es una alerta; el resto, un aviso cortés (`aria-live`, no un
 * `role="status"` más: la vista ya tiene el de las acciones).
 */
export function AvisoDelMapaBase({ aviso }: { aviso: AvisoBase }) {
  const alerta = aviso.tipo !== "sin-paquete" && aviso.tipo !== "lento";
  if (aviso.tipo === "sin-webgl") {
    return (
      <div
        role="alert"
        data-aviso-del-mapa="sin-webgl"
        className="grid h-full place-items-center bg-superficie-mapa p-6 text-center text-chico text-tinta-2"
      >
        <p className="max-w-[420px]">{textoDe(aviso)}</p>
      </div>
    );
  }
  return (
    <div
      role={alerta ? "alert" : undefined}
      aria-live={alerta ? undefined : "polite"}
      data-aviso-del-mapa={aviso.tipo}
      className={cn(
        "absolute bottom-3 left-3 z-10 flex max-w-[420px] items-center gap-3 rounded-lg border-[1.5px] border-solid bg-superficie px-3.5 py-2.5 text-chico text-tinta shadow-lg",
        alerta ? "border-peligro" : "border-tinta-2",
      )}
    >
      <span>{textoDe(aviso)}</span>
      {aviso.tipo === "sin-calles" ? (
        <button
          type="button"
          onClick={aviso.onReintentar}
          className="flex-none rounded-control border border-borde px-2.5 py-1 text-chico font-medium hover:bg-superficie-suave focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Reintentar
        </button>
      ) : null}
    </div>
  );
}
