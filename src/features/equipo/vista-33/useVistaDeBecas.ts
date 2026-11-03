"use client";

import { useCallback, useState } from "react";

import { alternarOrden, FILTROS_VACIOS, type ColumnaDeBecas, type FiltrosDeBecas, type OrdenDeBecas } from "./becas-tabla";

export interface VistaDeBecas {
  filtros: FiltrosDeBecas;
  orden: OrdenDeBecas;
  /** Sube con cada cambio de filtro u orden: sirve para saber si algo guardado a la vez sigue siendo de la misma vista. */
  version: number;
  filtrar(cambio: Partial<FiltrosDeBecas>): void;
  limpiarFiltros(): void;
  ordenarPor(columna: ColumnaDeBecas): void;
}

/**
 * Los filtros y el orden de la tabla «Becas». Viven en la vista y no en la tabla: cambiar de pestaña o de ciudad no los
 * borra, y volver a «Becas» encuentra la tabla como se dejó.
 */
export function useVistaDeBecas(): VistaDeBecas {
  const [filtros, setFiltros] = useState<FiltrosDeBecas>(FILTROS_VACIOS);
  const [orden, setOrden] = useState<OrdenDeBecas>(null);
  const [version, setVersion] = useState(0);

  const filtrar = useCallback((cambio: Partial<FiltrosDeBecas>) => {
    setFiltros((actuales) => ({ ...actuales, ...cambio }));
    setVersion((v) => v + 1);
  }, []);
  const limpiarFiltros = useCallback(() => {
    setFiltros(FILTROS_VACIOS);
    setVersion((v) => v + 1);
  }, []);
  const ordenarPor = useCallback((columna: ColumnaDeBecas) => {
    setOrden((actual) => alternarOrden(actual, columna));
    setVersion((v) => v + 1);
  }, []);

  return { filtros, orden, version, filtrar, limpiarFiltros, ordenarPor };
}
