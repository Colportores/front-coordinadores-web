import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * El marco de las pantallas de acceso del panel (vistas 38 y 40): a la izquierda la marca, a la derecha una columna de 380 px
 * con el contenido. Lo comparten el acceso (`PantallaDeAcceso`) y la recuperación de la contraseña (`PantallaOlvide`,
 * `PantallaNuevaContrasena`), que el canvas dibuja «con el mismo marco que el login».
 */

export interface DatosDelAviso {
  texto: string;
  /** `alert` para lo que salió mal, `status` para lo informativo. */
  rol: "alert" | "status";
  tono: "info" | "error" | "exito" | "sin-red";
}

const ESTILO_DE_TONO: Record<DatosDelAviso["tono"], { caja: string; icono: string; glifo: string }> = {
  info: { caja: "border-tinta-2", icono: "bg-tinta-2", glifo: "i" },
  error: { caja: "border-peligro", icono: "bg-peligro", glifo: "!" },
  exito: { caja: "border-exito", icono: "bg-exito", glifo: "✓" },
  "sin-red": { caja: "border-dashed border-tinta-suave", icono: "bg-tinta-suave", glifo: "✕" },
};

/** El recuadro de aviso del canvas: ícono redondo y texto, con el borde del tono (punteado sin conexión). */
export function Cartel({ aviso }: { aviso: DatosDelAviso }) {
  const estilo = ESTILO_DE_TONO[aviso.tono];
  return (
    <div role={aviso.rol} className={cn("flex items-start gap-3 rounded-lg border-[1.5px] bg-superficie px-3.5 py-3", estilo.caja)}>
      <span
        aria-hidden
        className={cn("grid size-5 flex-none place-items-center rounded-pastilla text-mini font-bold text-superficie", estilo.icono)}
      >
        {estilo.glifo}
      </span>
      <p className="text-[13.5px] leading-[1.45] wrap-anywhere text-pretty">{aviso.texto}</p>
    </div>
  );
}

export const CLASE_DE_ETIQUETA = "font-mono text-etiqueta tracking-[.14em] text-tinta-suave";

export const CLASE_DE_CAMPO =
  "min-w-0 rounded-control border bg-superficie px-3 py-[11px] text-[14px] text-tinta outline-none focus-visible:ring-2 focus-visible:ring-acento disabled:bg-superficie-suave disabled:text-tinta-suave";

export const CLASE_DE_ENLACE = "text-[13px] font-semibold text-marca underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento";

export function MarcoDeAcceso({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen bg-fondo lg:grid-cols-[420px_minmax(0,1fr)]">
      <div className="hidden flex-col justify-between bg-marca p-10 text-superficie lg:flex">
        <div className="flex items-center gap-[11px]">
          <div aria-hidden className="grid size-8 place-items-center rounded-pastilla bg-superficie font-serif text-chico font-semibold text-marca">
            UU
          </div>
          <span className="font-serif text-titulo font-semibold">Colportaje</span>
        </div>
        <div className="flex flex-col gap-2.5">
          <span className="font-mono text-etiqueta tracking-[.2em] text-marca-clara">PANEL DE COORDINADORES</span>
          <span className="font-serif text-[28px] leading-tight font-semibold text-pretty">Tu campaña, ciudad por ciudad.</span>
        </div>
        <span className="text-chico text-marca-clara">Unión Uruguaya</span>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="flex w-full max-w-[380px] flex-col gap-[22px]">{children}</div>
      </div>
    </main>
  );
}
