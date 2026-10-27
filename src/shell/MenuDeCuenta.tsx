"use client";

import { useRef, useState } from "react";
import { DropdownMenu } from "radix-ui";

import type { ResultadoCierre } from "@/auth/acceso";
import { rutaDeAcceso } from "@/auth/guarda";
import { cn } from "@/lib/utils";
import { esperarYSalir } from "@/shell/trabajo-pendiente";

/** Decidido el 27/10 (mapa §2: el canvas no dibuja el menú abierto ni sus fallas): lo que se ve cuando algo impide cerrar la sesión. */
export const TEXTO_CAMBIOS_SIN_GUARDAR =
  "No se cerró la sesión porque hay cambios que no se guardaron. Revisá el aviso de la pantalla y volvé a probar.";
export const TEXTO_NO_SE_PUDO_CERRAR = "No se pudo cerrar la sesión. Revisá tu conexión y volvé a probar.";
export const TEXTO_CERRANDO = "Cerrando sesión…";

type Estado = "reposo" | "cerrando" | "cambios-sin-guardar" | "sin-conexion";

/**
 * El avatar del topbar, con el menú de la cuenta (vista 38: «Cerrar sesión» está en el menú del avatar). Cierra la sesión del
 * servidor con `cerrarSesion` (server action) y vuelve a la pantalla de acceso con el aviso «Cerraste sesión.».
 *
 * - **Primero se espera lo que está a medio mandar** (`esperarYSalir`, igual que cambiar de pestaña): una inscripción dentro
 *   del plazo de «Deshacer» o sin contestar se manda antes de salir, y si alguna falla la sesión NO se cierra (nunca se pierde
 *   una persona sin aviso). No hay confirmación: el panel no guarda nada local (canvas).
 * - **Un solo cierre a la vez.** Mientras uno está en curso, el ítem queda apagado y un segundo clic no hace nada.
 * - **Si no llega al servidor, se avisa y se puede reintentar**: el menú no se cierra solo ni se queda «Cerrando…» para siempre.
 * - La navegación es una carga completa de la página (`irA`): tira lo que el navegador guardó de las pantallas de la sesión.
 */
export function MenuDeCuenta({
  nombre,
  iniciales,
  cerrarSesion,
  irA = (ruta) => window.location.assign(ruta),
}: {
  nombre: string;
  iniciales: string;
  cerrarSesion: () => Promise<ResultadoCierre>;
  /** Adónde ir cuando la sesión se cerró; en los tests se cambia por un doble. */
  irA?: (ruta: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState<Estado>("reposo");
  const cerrando = useRef(false);

  async function cerrar() {
    if (cerrando.current) return;
    cerrando.current = true;
    setEstado("cerrando");
    try {
      let puedeSalir = false;
      const salida = await esperarYSalir(() => {
        puedeSalir = true;
      });
      if (!puedeSalir) {
        // `fallo`: una inscripción no salió. `ocupado` o ya se fue de la pantalla: no es de este cierre y no hay nada que avisar.
        setEstado(salida === "fallo" ? "cambios-sin-guardar" : "reposo");
        setAbierto(false);
        return;
      }
      try {
        await cerrarSesion();
      } catch {
        setEstado("sin-conexion");
        setAbierto(false);
        return;
      }
      // Cerrada, o cerrada sin avisar al servidor (la cookie se borra igual): para la persona es lo mismo.
      irA(rutaDeAcceso("cerrada"));
    } finally {
      cerrando.current = false;
    }
  }

  const ocupado = estado === "cerrando";
  const aviso = estado === "cambios-sin-guardar" ? TEXTO_CAMBIOS_SIN_GUARDAR : estado === "sin-conexion" ? TEXTO_NO_SE_PUDO_CERRAR : null;

  return (
    <>
      <DropdownMenu.Root
        open={abierto}
        onOpenChange={(valor) => {
          // Mientras se cierra la sesión el menú no se cierra solo: el texto «Cerrando sesión…» es la respuesta.
          if (!valor && ocupado) return;
          setAbierto(valor);
          if (valor) setEstado("reposo");
        }}
      >
        <DropdownMenu.Trigger
          aria-label={`Cuenta: ${nombre}`}
          className="grid size-8 place-items-center rounded-pastilla bg-marca-clara text-chico font-semibold text-marca focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none"
        >
          {iniciales}
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-50 min-w-56 max-w-72 rounded-tarjeta border border-borde bg-superficie p-1.5 text-cuerpo text-tinta shadow-lg"
          >
            <DropdownMenu.Label className="px-2.5 py-1.5 text-chico break-words text-tinta-suave">{nombre}</DropdownMenu.Label>
            <DropdownMenu.Separator className="my-1 h-px bg-borde" />
            <DropdownMenu.Item
              disabled={ocupado}
              // El menú queda abierto mientras se cierra la sesión (dice «Cerrando sesión…»); si falla, se cierra y aparece el aviso.
              onSelect={(evento) => {
                evento.preventDefault();
                void cerrar();
              }}
              className={cn(
                "flex min-h-8 cursor-default items-center rounded-control px-2.5 py-1.5 text-nav outline-none select-none",
                "data-[highlighted]:bg-marca-clara data-[highlighted]:text-marca data-[disabled]:text-tinta-suave",
              )}
            >
              {ocupado ? TEXTO_CERRANDO : "Cerrar sesión"}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {/* Fuera del menú (un `role="menu"` solo admite ítems): la falla se avisa debajo del topbar y se va al abrir el menú de nuevo. */}
      <div role="alert" className={aviso ? "fixed top-14 right-4 z-50 max-w-72 rounded-tarjeta border border-peligro bg-superficie px-3 py-2 text-chico leading-snug text-peligro shadow-lg" : "sr-only"}>
        {aviso}
      </div>
    </>
  );
}
