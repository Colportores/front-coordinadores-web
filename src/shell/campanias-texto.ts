import type { CampaniaElegible } from "@/datos/shell/contrato";

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `dd/mm` de un día `AAAA-MM-DD`; si no tiene esa forma, tal cual vino. */
export function fechaCorta(dia: string): string {
  const partes = DIA.exec(dia);
  return partes ? `${partes[3]}/${partes[2]}` : dia;
}

/** `dd/mm/aaaa` de un día `AAAA-MM-DD`; si no tiene esa forma, tal cual vino. */
export function fechaConAnio(dia: string): string {
  const partes = DIA.exec(dia);
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : dia;
}

/**
 * La línea de fechas de una campaña en la lista del topbar (canvas vista 37): «15/09 – 15/12 · en curso» y «empieza el
 * 04/01/2027». Una campaña sin fin (`fechaFin` null) dice «desde el 15/09 · en curso» (el canvas no dibuja ese caso).
 */
export function textoDeFechas(campania: CampaniaElegible): string {
  if (campania.estado === "por-empezar") return `empieza el ${fechaConAnio(campania.fechaInicio)}`;
  if (campania.fechaFin === null) return `desde el ${fechaCorta(campania.fechaInicio)} · en curso`;
  return `${fechaCorta(campania.fechaInicio)} – ${fechaCorta(campania.fechaFin)} · en curso`;
}

/** Lo que dice el botón del topbar: «<ciudades> · <campaña>»; sin ciudades, solo la campaña. */
export function textoDelBoton(region: string, campania: string): string {
  return region === "" ? campania : `${region} · ${campania}`;
}
