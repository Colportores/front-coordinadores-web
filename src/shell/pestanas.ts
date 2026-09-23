import { pestanaVisible, type Pestana } from "@/config/flags";

export type { Pestana };

export interface DefinicionPestana {
  id: Pestana;
  etiqueta: string;
  ruta: `/${Pestana}`;
}

/** Orden de la navegación, igual que en el diseño. Lo mantiene el shell. */
export const PESTANAS: readonly DefinicionPestana[] = [
  { id: "inicio", etiqueta: "Inicio", ruta: "/inicio" },
  { id: "equipo", etiqueta: "Equipo", ruta: "/equipo" },
  { id: "stock", etiqueta: "Stock", ruta: "/stock" },
  { id: "cuentas", etiqueta: "Cuentas", ruta: "/cuentas" },
  { id: "reportes", etiqueta: "Reportes", ruta: "/reportes" },
];

export const RUTA_INICIAL = "/inicio";

export function pestanasVisibles(): DefinicionPestana[] {
  return PESTANAS.filter((p) => pestanaVisible(p.id));
}
