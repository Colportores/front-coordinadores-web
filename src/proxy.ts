import { NextResponse, type NextRequest } from "next/server";

import { verificarAcceso, type ResultadoAcceso } from "@/auth/acceso";
import { CABECERA_SIN_MARCO, decidirGuarda, destinoSeguro, RUTA_ACCESO, rutaDeAcceso, type MotivoDeAcceso } from "@/auth/guarda";
import { modoDeAcceso } from "@/auth/modo";
import { crearSupabaseDeProxy } from "@/auth/supabase-proxy";
import { pestanaVisible, type Pestana } from "@/config/flags";
import { configPublicaSupabase } from "@/datos/supabase/config-publica";

/** Ruta que no existe: reescribir hacia ella devuelve la página 404 del panel. */
export const RUTA_NO_DISPONIBLE = "/_pestana-no-disponible";

const PESTANAS_CON_FLAG: readonly Pestana[] = ["stock", "cuentas"];

function pestanaDeRuta(ruta: string): Pestana | undefined {
  return PESTANAS_CON_FLAG.find((p) => ruta === `/${p}` || ruta.startsWith(`/${p}/`) || ruta.startsWith(`/${p}.`));
}

/**
 * Pestañas con flag apagado (Stock y Cuentas en staging y producción): la
 * petición se corta ANTES de renderizar. Un `notFound()` en el layout no
 * alcanza, porque en el App Router layout y page se renderizan en paralelo y
 * el payload RSC igual llevaría el árbol de la página.
 */
function cortarPestanaSinFlag(request: NextRequest, cabeceras?: Headers): NextResponse | null {
  const pestana = pestanaDeRuta(request.nextUrl.pathname);
  if (!pestana || pestanaVisible(pestana)) return null;
  return NextResponse.rewrite(new URL(RUTA_NO_DISPONIBLE, request.url), cabeceras ? { request: { headers: cabeceras } } : undefined);
}

function esPantallaDeAcceso(ruta: string): boolean {
  return ruta === RUTA_ACCESO || ruta.startsWith(`${RUTA_ACCESO}/`);
}

/** Dónde estaba la persona, para volver ahí después de entrar. Sin `_rsc`: es el parámetro con que el navegador pide el payload. */
function destinoDelPedido(request: NextRequest): string {
  const consulta = new URLSearchParams(request.nextUrl.search);
  consulta.delete("_rsc");
  const texto = consulta.toString();
  return destinoSeguro(`${request.nextUrl.pathname}${texto ? `?${texto}` : ""}`);
}

/** Una llamada a una server action (un POST a la ruta donde se usa) o cualquier pedido que no es navegar: no se redirige, se rechaza. */
function noEsNavegacion(request: NextRequest): boolean {
  return (request.method !== "GET" && request.method !== "HEAD") || request.headers.has("next-action");
}

function aLaPantallaDeAcceso(request: NextRequest, motivo: MotivoDeAcceso | null, conDestino: boolean): NextResponse {
  const ruta = rutaDeAcceso(motivo, conDestino ? destinoDelPedido(request) : undefined);
  return NextResponse.redirect(new URL(ruta, request.nextUrl.origin));
}

/** El rechazo de lo que no se puede redirigir: 401 si la persona tiene que volver a entrar, 503 si el panel no está disponible. */
function rechazar(resultado: ResultadoAcceso["tipo"] | "mal-configurado"): NextResponse {
  const noDisponible = resultado === "no-disponible" || resultado === "mal-configurado";
  return new NextResponse(null, { status: noDisponible ? 503 : 401, headers: { "Cache-Control": "no-store" } });
}

/**
 * El proxy del panel. Hace dos cosas, en este orden:
 *
 * 1. **La guarda de rutas** (issue #18, decisión «Sesión panel»): antes de renderizar cualquier pantalla renueva la sesión de
 *    la cookie y comprueba con la base que la cuenta tenga el rol `COORDINADOR` vigente (`verificarAcceso`); si no, manda a la
 *    pantalla de acceso (`/acceso`, vista 38). Solo corre con las variables públicas de Supabase (`modoDeAcceso`): sin ellas
 *    el panel es el de siempre, sin login. Un panel mal configurado se bloquea, nunca deja pasar.
 * 2. **Las pestañas con flag apagado** (Stock y Cuentas en staging y producción), ver `cortarPestanaSinFlag`.
 *
 * Lo que se llama desde una server action y no pasa la guarda se rechaza con 401 o 503 en vez de redirigir: el navegador espera
 * la respuesta de la acción, no una página. Cada server action además habla con la RLS de la base con el JWT de quien la llama,
 * que es la autoridad: el proxy solo decide qué pantalla se pinta.
 */
export async function proxy(request: NextRequest) {
  const modo = modoDeAcceso();
  if (modo === "apagado") return cortarPestanaSinFlag(request) ?? NextResponse.next();

  const enAcceso = esPantallaDeAcceso(request.nextUrl.pathname);

  if (modo === "mal-configurado") {
    if (enAcceso) return paraAcceso(request.headers);
    return noEsNavegacion(request) ? rechazar("mal-configurado") : aLaPantallaDeAcceso(request, "no-disponible", false);
  }

  const config = configPublicaSupabase();
  if (!config) return noEsNavegacion(request) ? rechazar("mal-configurado") : aLaPantallaDeAcceso(request, "no-disponible", false);
  const { supabase, aplicar } = crearSupabaseDeProxy(request, config);

  if (enAcceso) {
    // Quien ya tiene una sesión buena y abre la pantalla de acceso sin un motivo, no tiene nada que hacer ahí. Con motivo
    // (sin acceso, no disponible, cerrada…) la pantalla se muestra tal cual: es justamente la respuesta a lo que pasó.
    if (!noEsNavegacion(request) && !request.nextUrl.searchParams.has("motivo")) {
      const resultado = await verificarAcceso(supabase);
      if (resultado.tipo === "ok") {
        return aplicar(NextResponse.redirect(new URL(destinoSeguro(request.nextUrl.searchParams.get("siguiente")), request.nextUrl.origin)));
      }
    }
    return aplicar(paraAcceso(request.headers));
  }

  const resultado = await verificarAcceso(supabase);
  const decision = decidirGuarda(resultado);
  if (decision.tipo === "a-acceso") {
    if (noEsNavegacion(request)) return aplicar(rechazar(resultado.tipo));
    // «Sin acceso» no vuelve a la pantalla de antes: la cuenta no sirve para el panel.
    return aplicar(aLaPantallaDeAcceso(request, decision.motivo, decision.motivo !== "sin-acceso"));
  }

  // El pedido sigue con la sesión ya renovada (`request.cookies`), y sin una cabecera de «sin marco» que haya mandado el cliente.
  const cabeceras = new Headers(request.headers);
  cabeceras.delete(CABECERA_SIN_MARCO);
  return aplicar(cortarPestanaSinFlag(request, cabeceras) ?? NextResponse.next({ request: { headers: cabeceras } }));
}

/** La pantalla de acceso va sin el marco del panel: el layout lo sabe por esta cabecera, que solo pone el proxy. */
function paraAcceso(cabecerasDelPedido: Headers): NextResponse {
  const cabeceras = new Headers(cabecerasDelPedido);
  cabeceras.set(CABECERA_SIN_MARCO, "1");
  return NextResponse.next({ request: { headers: cabeceras } });
}

export const config = {
  // Todas las pantallas, también las llamadas a server actions y los payload RSC; no los archivos estáticos ni el worker del mapa.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|maplibre/|fuentes/).*)"],
};
