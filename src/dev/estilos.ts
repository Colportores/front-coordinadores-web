import type { EstadoHu, SchemaEnBack } from "@/dev/estado-hu";

/** Colores del modo dev, siempre con tokens del diseño. */
export const CLASES_ESTADO: Record<EstadoHu, { pastilla: string; punto: string; contorno: string }> = {
  bloqueada: { pastilla: "bg-peligro-fondo text-peligro", punto: "bg-peligro", contorno: "outline-peligro/40" },
  mockeada: { pastilla: "bg-alerta-fondo text-alerta", punto: "bg-alerta-punto", contorno: "outline-alerta-punto/50" },
  implementada: { pastilla: "bg-marca-clara text-marca-media", punto: "bg-acento", contorno: "outline-acento/40" },
  "validada-qa": { pastilla: "bg-exito-fondo text-exito", punto: "bg-exito", contorno: "outline-exito/40" },
};

export const CLASES_SCHEMA: Record<SchemaEnBack, string> = {
  si: "text-exito",
  parcial: "text-alerta",
  no: "text-peligro",
};
