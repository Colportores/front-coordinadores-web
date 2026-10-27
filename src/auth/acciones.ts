"use server";

import { cerrarSesion, iniciarSesion, type ResultadoCierre, type ResultadoInicioSesion } from "@/auth/acceso";
import { destinoSeguro } from "@/auth/guarda";
import { modoDeAcceso } from "@/auth/modo";
import { crearSupabaseDeServidor } from "@/auth/supabase-servidor";

/**
 * Iniciar y cerrar sesión (vista 38). Son server actions y no llamadas del navegador a Supabase porque la sesión vive en una
 * cookie `httpOnly` (decisión «Sesión panel», 21/10): el JavaScript de la página nunca ve el token, solo el servidor lo lee y
 * lo escribe (`src/auth/supabase-cookies.ts`). La pantalla de acceso recibe el resultado tipado y lo traduce a su aviso.
 *
 * Este módulo no entra al build exportado del sitio de prueba (no hay servidor ni login ahí): el layout y la página de acceso lo
 * importan solo cuando no es ese build. Ver README, «Sitio de prueba».
 */

export type RespuestaDeInicio =
  /** Entró: `destino` es la ruta del panel adonde ir (siempre una ruta propia, ver `destinoSeguro`). */
  | { tipo: "ok"; destino: string }
  | Exclude<ResultadoInicioSesion, { tipo: "ok" }>;

export async function iniciarSesionAccion(correo: unknown, contrasena: unknown, siguiente?: unknown): Promise<RespuestaDeInicio> {
  // Los argumentos vienen del navegador: se miran como lo que son, y algo que no es texto es un correo o una contraseña vacíos.
  if (typeof correo !== "string" || typeof contrasena !== "string") return { tipo: "credenciales-invalidas" };
  if (modoDeAcceso() !== "activo") return { tipo: "no-disponible" };
  try {
    const resultado = await iniciarSesion(await crearSupabaseDeServidor(), { correo, contrasena });
    return resultado.tipo === "ok" ? { tipo: "ok", destino: destinoSeguro(siguiente) } : resultado;
  } catch {
    // Una acción de producción tapa lo que tira: la causa viaja en el resultado. No se sabe qué pasó, no se acusa a las credenciales.
    return { tipo: "no-disponible" };
  }
}

/**
 * Cierra la sesión de este navegador. Nunca falla hacia afuera: si el servidor no pudo revocar el token, la cookie se borra
 * igual (`cerrada-sin-revocar`), y sin configuración no hay sesión que cerrar.
 */
export async function cerrarSesionAccion(): Promise<ResultadoCierre> {
  if (modoDeAcceso() !== "activo") return { tipo: "cerrada" };
  try {
    return await cerrarSesion(await crearSupabaseDeServidor());
  } catch {
    return { tipo: "cerrada-sin-revocar" };
  }
}
