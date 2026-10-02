import { sitioDePruebaActivo } from "@/config/flags";

/**
 * Franja fija arriba de cada pantalla del sitio de prueba (GitHub Pages, datos
 * simulados): quien abre el sitio ve un panel que parece de verdad, hace algo
 * que parece guardarse y al recargar desaparece. No se puede cerrar y no
 * aparece en `next dev` ni en el build de staging y producción.
 * Texto: decisión del 02/10 (PR #43).
 */
export function AvisoVersionDePrueba() {
  if (!sitioDePruebaActivo()) return null;

  return (
    <div
      role="note"
      className="flex min-h-[var(--spacing-aviso)] items-center justify-center border-b border-alerta-punto bg-alerta-fondo px-[22px] py-1 text-center text-chico text-tinta"
    >
      <p>
        <strong className="font-semibold">Versión de prueba con datos simulados.</strong> Lo que hagas no se guarda: al
        recargar la página vuelve a los datos de ejemplo.
      </p>
    </div>
  );
}
