"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import type { ResultadoCierre } from "@/auth/acceso";
import type { ResultadoCampanias, ResumenCoordinador } from "@/datos/shell/contrato";
import { fuenteShellSimulada } from "@/datos/shell/simulado";
import { estadoDePestana, ETIQUETA_ESTADO } from "@/dev/estado-hu";
import { CLASES_ESTADO } from "@/dev/estilos";
import { useModoDev } from "@/dev/ProveedorModoDev";
import { cn } from "@/lib/utils";
import type { DefinicionPestana } from "@/shell/pestanas";
import { MenuDeCuenta } from "@/shell/MenuDeCuenta";
import { SelectorDeCampania } from "@/shell/SelectorDeCampania";
import {
  esperarYSalir,
  estaEsperando,
  hayQueEsperar,
  useEsperandoTrabajo,
} from "@/shell/trabajo-pendiente";
import { useFrenoDeAtrasYAdelante } from "@/shell/useFrenoDeAtrasYAdelante";

/** Decidido el 16/10 (mapa §2: el canvas no dibuja este estado): lo que se ve mientras se espera a que contesten las inscripciones. */
export const TEXTO_ESPERANDO_ENVIOS = "Guardando lo que añadiste a la campaña…";

function EstadoPestana({ pestana }: { pestana: DefinicionPestana }) {
  const { chipsVisibles } = useModoDev();
  const estado = estadoDePestana(pestana.id);
  if (!chipsVisibles || !estado) return null;
  return (
    <span
      data-testid={`estado-pestana-${pestana.id}`}
      title={`Estado de las HU de ${pestana.etiqueta}: ${ETIQUETA_ESTADO[estado]}`}
      className="ml-1.5 inline-flex items-center"
    >
      <span aria-hidden className={cn("size-1.5 rounded-pastilla", CLASES_ESTADO[estado].punto)} />
      <span className="sr-only">(HU: {ETIQUETA_ESTADO[estado]})</span>
    </span>
  );
}

/** Sin una fuente propia (el sitio de prueba y los tests), el selector ofrece las campañas simuladas desde el navegador. */
async function pedirCampaniasSimuladas(): Promise<ResultadoCampanias> {
  return { ok: true, campanias: await fuenteShellSimulada.listarCampanias() };
}

export function Topbar({
  resumen,
  pestanas,
  pedirCampanias = pedirCampaniasSimuladas,
  cerrarSesion,
}: {
  resumen: ResumenCoordinador;
  pestanas: DefinicionPestana[];
  /** La lista de campañas que se eligen (server action de `src/app/acciones-campanias.ts`); se pide al abrir el selector. */
  pedirCampanias?: () => Promise<ResultadoCampanias>;
  /**
   * «Cerrar sesión» (server action de `src/auth/acciones.ts`). Solo hay con el login prendido: sin ella (sitio de prueba, panel
   * sin variables de Supabase) el avatar es solo la marca de la cuenta y no abre ningún menú.
   */
  cerrarSesion?: () => Promise<ResultadoCierre>;
}) {
  const ruta = usePathname();
  const router = useRouter();
  // Se espera desde el menú, desde «‹ Equipo», con Esc o con atrás/adelante del navegador: el estado es el mismo.
  const esperando = useEsperandoTrabajo();
  useFrenoDeAtrasYAdelante();

  /**
   * Cambiar de pestaña con inscripciones dentro del plazo o sin contestar (vista 23): se mandan ahora, se espera la respuesta
   * y se cambia solo si todas salieron bien; si alguna falla, la vista se queda con su aviso. Sin nada pendiente el enlace
   * navega como siempre. Igual que «‹ Equipo», Esc y atrás/adelante (decisión del 16/10 en #41). Una sola espera a la vez:
   * un clic mientras otra espera se ignora y gana el primer destino.
   */
  async function alElegirPestana(evento: React.MouseEvent<HTMLAnchorElement>, destino: string) {
    // Un clic con modificador abre otra pestaña del navegador y esta se queda como está.
    if (evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
    if (!estaEsperando() && !hayQueEsperar()) return;
    evento.preventDefault();
    await esperarYSalir(() => router.push(destino));
  }

  return (
    <header className="z-10 flex items-center justify-between border-b border-borde bg-superficie px-[22px]">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-[11px]">
          <div
            aria-hidden
            className="grid size-8 place-items-center rounded-pastilla bg-marca font-serif text-chico font-semibold text-superficie"
          >
            UU
          </div>
          <span className="font-serif text-titulo font-semibold">Colportaje</span>
          <span className="rounded-pastilla bg-marca-clara px-[9px] py-[3px] text-etiqueta font-bold tracking-[.12em] text-marca-media">
            COORDINADOR
          </span>
        </div>
        <nav aria-label="Secciones del panel" aria-busy={esperando || undefined}>
          <ul className="flex gap-1 text-nav">
            {pestanas.map((p) => {
              const activa = ruta === p.ruta || ruta.startsWith(`${p.ruta}/`);
              return (
                <li key={p.id}>
                  <Link
                    href={p.ruta}
                    onClick={(evento) => void alElegirPestana(evento, p.ruta)}
                    aria-current={activa ? "page" : undefined}
                    className={cn(
                      "inline-flex items-center rounded-control px-3.5 py-2 focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none",
                      activa ? "bg-marca-clara font-semibold text-marca" : "text-tinta-2 hover:bg-fondo",
                    )}
                  >
                    {p.etiqueta}
                    <EstadoPestana pestana={p} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        {/* El lector de pantalla lo anuncia desde una región que ya estaba en la página; a la vista, el texto aparece solo mientras se espera. */}
        <span role="status" className="sr-only">
          {esperando ? TEXTO_ESPERANDO_ENVIOS : null}
        </span>
        {esperando ? (
          <span aria-hidden className="text-chico text-tinta-suave">
            {TEXTO_ESPERANDO_ENVIOS}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <SelectorDeCampania resumen={resumen} pedirCampanias={pedirCampanias} />
        {cerrarSesion ? (
          <MenuDeCuenta nombre={resumen.nombre} iniciales={resumen.iniciales} cerrarSesion={cerrarSesion} />
        ) : (
          <div
            role="img"
            aria-label={`Cuenta: ${resumen.nombre}`}
            className="grid size-8 place-items-center rounded-pastilla bg-marca-clara text-chico font-semibold text-marca"
          >
            {resumen.iniciales}
          </div>
        )}
      </div>
    </header>
  );
}
