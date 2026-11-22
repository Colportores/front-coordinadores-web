import { cn } from "@/lib/utils";

/** Lo que dicen el aviso y, en su lista vacía, el selector del topbar: el mismo texto en los dos lugares. */
export const TEXTO_SIN_CAMPANIA = "No tenés campañas en curso ni por empezar";
export const TEXTO_SIN_CAMPANIA_DETALLE = "Las campañas terminadas no se eligen desde acá.";

/**
 * El aviso único de todas las pestañas cuando la coordinadora no tiene ninguna campaña en curso ni por empezar (decisión de
 * Cristian, 23/10, «Sin campaña»; canvas 37-06): qué pasa y a quién pedir una. No hay botón «Crear una campaña» hasta que se
 * diseñe esa pantalla (HU-CAM-001). Los dos párrafos son de una sola vista: el único `role="status"` es el primero.
 *
 * @param className margen o relleno de la pestaña que lo muestra (las que llenan el área sin relleno le dan `m-[22px]`).
 */
export function AvisoSinCampania({ className }: { className?: string }) {
  return (
    <div className={cn("flex max-w-xl flex-col items-start gap-1.5 rounded-tarjeta border border-borde bg-superficie px-[18px] py-4", className)}>
      <p role="status" className="text-nav font-semibold text-tinta">
        {TEXTO_SIN_CAMPANIA}
      </p>
      <p className="text-nav text-tinta-2">
        {TEXTO_SIN_CAMPANIA_DETALLE} Si esperabas una campaña, pedísela a la administración: cuando te la asigne, la vas a ver en el selector de arriba y en
        todas las pestañas.
      </p>
    </div>
  );
}
