import { datosSimulados, pestanasSimuladasVisibles } from "@/config/datos-simulados";
import { sitioDePruebaActivo } from "@/config/flags";

/**
 * Franja fija arriba de cada pantalla donde hay datos simulados (issue #101): quien la abre ve un panel que parece de
 * verdad, hace algo que parece guardarse y no llega a ningún lado. No se puede cerrar. Aparece:
 *
 * - en el sitio de prueba de Pages (texto de la decisión del 02/10, PR #43, que `build:pages` exige en cada página);
 * - en cualquier otro build donde ninguna pestaña hable con Supabase (sin la conexión ni el puente de desarrollo);
 * - con la conexión real, mientras haya a la vista pestañas que todavía son simuladas (Stock y Cuentas, solo con el
 *   modo dev o su flag): el aviso dice cuáles.
 * Con todo conectado, en staging y producción, no aparece. Qué es simulado: `src/config/datos-simulados.ts`.
 */
export function AvisoVersionDePrueba() {
  const simulado = datosSimulados();
  if (!simulado) return null;

  return (
    <div
      role="note"
      className="flex min-h-[var(--spacing-aviso)] items-center justify-center border-b border-alerta-punto bg-alerta-fondo px-[22px] py-1 text-center text-chico text-tinta"
    >
      {simulado === "pestanas" ? <AvisoDePestanas /> : sitioDePruebaActivo() ? <AvisoDelSitioDePrueba /> : <AvisoSinConexion />}
    </div>
  );
}

function AvisoDelSitioDePrueba() {
  return (
    <p>
      <strong className="font-semibold">Versión de prueba con datos simulados.</strong> Lo que hagas no se guarda: al
      recargar la página vuelve a los datos de ejemplo.
    </p>
  );
}

function AvisoSinConexion() {
  return (
    <p>
      <strong className="font-semibold">Versión de prueba con datos simulados.</strong> Este panel no está conectado a la
      base de datos: lo que ves es de ejemplo y lo que hagas no se guarda.
    </p>
  );
}

function AvisoDePestanas() {
  const nombres = pestanasSimuladasVisibles();
  const lista = nombres.length > 1 ? `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}` : nombres.join("");
  return (
    <p>
      <strong className="font-semibold">{lista}: datos simulados.</strong>{" "}
      {nombres.length > 1 ? "Esas pestañas todavía no están conectadas" : "Esa pestaña todavía no está conectada"} a la base de
      datos: lo que muestran es de ejemplo y lo que hagas en {nombres.length > 1 ? "ellas" : "ella"} no se guarda.
    </p>
  );
}
