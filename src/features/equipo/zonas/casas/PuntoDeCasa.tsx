import type { CSSProperties } from "react";

import { estadoVisual } from "@/features/equipo/zonas/casas/estados";
import type { EstadoDeCasa } from "@/datos/equipo/zonas";

interface Props {
  estado: EstadoDeCasa;
  /** Lado en píxeles: 18 en la leyenda, 16 sobre el mapa. */
  lado: number;
  /** Sobre el mapa lleva sombra; en la leyenda no. */
  sombra?: boolean;
}

/**
 * El símbolo de un estado: círculo (visita) o cuadrado (venta y cobro), con su color y su glifo. Decorativo: quien lo usa le
 * pone el nombre del estado (la leyenda lo escribe al lado; el punto del mapa lleva `aria-label`).
 */
export function PuntoDeCasa({ estado, lado, sombra }: Props) {
  const v = estadoVisual(estado);
  const estilo: CSSProperties = {
    width: lado,
    height: lado,
    borderRadius: v.forma === "circulo" ? "50%" : 4,
    background: v.fondo,
    border: v.borde ? `${lado > 16 ? 2.5 : 2}px solid ${v.color}` : "none",
    color: v.texto,
    fontSize: lado > 16 ? 10 : 9,
    boxShadow: sombra ? "0 1px 2px rgba(14,26,43,.25)" : undefined,
  };
  return (
    <span aria-hidden="true" style={estilo} className="box-border grid flex-none place-items-center font-bold leading-none">
      {v.glifo}
    </span>
  );
}
