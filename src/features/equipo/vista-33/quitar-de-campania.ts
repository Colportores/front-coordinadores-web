import { mensajeSinConexion } from "@/lib/mensajes";

/**
 * Textos de «Quitar de la campaña» (HU-CAM-005, «Remover» sin reasignar; front-coordinadores-web#184). El canvas de Equipo no
 * dibuja la acción: sigue el «Quitar» de la zona (vista 24, «<nombre> quedó sin zona.») y la doble confirmación aprobada del
 * panel (vista 39, 39A·02 y 39A·04: primero qué pasa, después la confirmación con el botón rojo que dice la acción entera).
 * Cada aviso dice qué pasa y qué hacer: queda sin zona y se lo puede volver a añadir desde «+ Añadir colportor».
 */

/** La etiqueta del botón de la fila. */
export const TEXTO_QUITAR = "Quitar de la campaña";

/** Lo que el lector de pantalla oye del botón de la fila: a quién quita (empieza con el texto visible, WCAG 2.5.3). */
export const etiquetaQuitar = (nombre: string) => `${TEXTO_QUITAR} a ${nombre}`;

export interface TextosDelPaso {
  titulo: string;
  texto: string;
}

/** Primer paso: qué pasa al quitarlo. */
export function textosDeQuePasa(nombre: string, campania: string): TextosDelPaso {
  return {
    titulo: `Quitar a ${nombre} de la campaña`,
    texto:
      `${nombre} deja de estar en el equipo de ${campania} y queda sin zona. No se borra nada de lo que registró (casas, ventas y jornadas). ` +
      "Si fue un error, lo podés volver a añadir desde «+ Añadir colportor»: vuelve sin zona.",
  };
}

/** Segundo paso: la confirmación final. */
export function textosDeConfirmacion(nombre: string): TextosDelPaso {
  return {
    titulo: `¿Quitar a ${nombre} de la campaña?`,
    texto:
      "Sale de la lista del equipo ahora y su zona queda libre. Acá no hay «Deshacer»: para que vuelva, añadilo de nuevo desde «+ Añadir colportor» y asignale una zona.",
  };
}

/** El botón rojo del segundo paso. */
export const TEXTO_CONFIRMAR_QUITAR = "Sí, quitar de la campaña";
export const TEXTO_QUITANDO = "Quitando…";

/** Falla de red (o el navegador sin conexión): no cambió nada. */
export const textoSinConexionAlQuitar = (nombre: string) => mensajeSinConexion(`quitar a ${nombre} de la campaña`);

/** Cómo quedó, en el aviso de arriba de la tabla. */
export const avisoDeQuitado = (nombre: string) =>
  `${nombre} ya no está en la campaña y quedó sin zona. Si fue un error, añadilo de nuevo desde «+ Añadir colportor».`;
