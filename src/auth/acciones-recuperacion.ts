"use server";

import { cerrarSesion } from "@/auth/acceso";
import { guardarContrasena, abrirEnlace, cerrarOtrasSesiones, pedirEnlace } from "@/auth/recuperacion";
import { modoDeAcceso } from "@/auth/modo";
import {
  direccionDeNuevaContrasena,
  piso,
  ponerMarcaDeRecuperacion,
  quitarMarcaDeRecuperacion,
  recuperacionEnCurso,
} from "@/auth/recuperacion-servidor";
import { crearSupabaseDeServidor } from "@/auth/supabase-servidor";
import { normalizarCorreo, problemaDeCorreo, reglasDeContrasena } from "@/features/acceso/validacion";

/**
 * Recuperar la contraseña (vista 40). Son server actions por lo mismo que el login (`acciones.ts`): la sesión vive en una cookie
 * `httpOnly`, así que el canje del código del enlace y el cambio de contraseña los hace el servidor. Este módulo no entra al build
 * exportado del sitio de prueba: las páginas lo importan solo cuando no es ese build.
 */

export type RespuestaDelPedido = { tipo: "enviado" } | { tipo: "correo-invalido" } | { tipo: "no-disponible" };

export type RespuestaDeApertura = { tipo: "ok"; correo: string } | { tipo: "no-valido"; sinVerificador?: true } | { tipo: "no-disponible" };

export type RespuestaDeGuardado =
  | { tipo: "ok" }
  /** La contraseña cambió pero no se pudieron cerrar las otras sesiones: la pantalla lo avisa y ofrece reintentar. */
  | { tipo: "ok-sin-revocar" }
  | { tipo: "enlace-no-valido" }
  | { tipo: "misma-contrasena" }
  | { tipo: "contrasena-debil" }
  /** Pasa de los 72 bytes en UTF-8: la pantalla dice «Es demasiado larga. Acortala.» y nunca recorta lo escrito. */
  | { tipo: "contrasena-larga" }
  | { tipo: "no-disponible" };

async function conPiso<T>(trabajo: () => Promise<T>, minimoMs: number): Promise<T> {
  const inicio = Date.now();
  const resultado = await trabajo();
  const falta = minimoMs - (Date.now() - inicio);
  if (falta > 0) await new Promise((resolver) => setTimeout(resolver, falta));
  return resultado;
}

/** El largo máximo de un código del enlace: bastante más de lo que Supabase manda, para no canjear cualquier cosa. */
const LARGO_MAXIMO_DEL_CODIGO = 1024;

export async function pedirEnlaceAccion(correo: unknown): Promise<RespuestaDelPedido> {
  // Los argumentos vienen del navegador: se miran como lo que son.
  if (typeof correo !== "string") return { tipo: "correo-invalido" };
  const normalizado = normalizarCorreo(correo);
  if (normalizado === "" || problemaDeCorreo(normalizado) !== null) return { tipo: "correo-invalido" };
  if (modoDeAcceso() !== "activo") return { tipo: "no-disponible" };
  return conPiso<RespuestaDelPedido>(async () => {
    try {
      const resultado = await pedirEnlace(await crearSupabaseDeServidor(), normalizado, await direccionDeNuevaContrasena());
      return resultado;
    } catch {
      return { tipo: "no-disponible" };
    }
  }, piso.pedidoMs);
}

/** `tipo` llega del navegador: lo que no es «un-solo-uso» se trata como el `?code=` de siempre (PKCE). */
export async function abrirEnlaceAccion(codigo: unknown, tipo?: unknown): Promise<RespuestaDeApertura> {
  if (typeof codigo !== "string" || codigo === "" || codigo.length > LARGO_MAXIMO_DEL_CODIGO) return { tipo: "no-valido" };
  if (modoDeAcceso() !== "activo") return { tipo: "no-disponible" };
  try {
    const resultado = await abrirEnlace(await crearSupabaseDeServidor(), codigo, undefined, tipo === "un-solo-uso" ? "un-solo-uso" : "pkce");
    if (resultado.tipo !== "ok") return resultado;
    await ponerMarcaDeRecuperacion(resultado.usuarioId);
    return { tipo: "ok", correo: resultado.correo };
  } catch {
    return { tipo: "no-disponible" };
  }
}

export async function guardarContrasenaAccion(contrasena: unknown): Promise<RespuestaDeGuardado> {
  if (typeof contrasena !== "string") return { tipo: "contrasena-debil" };
  const reglas = reglasDeContrasena(contrasena);
  if (reglas.demasiadoLarga) return { tipo: "contrasena-larga" };
  if (!reglas.cumple) return { tipo: "contrasena-debil" };
  if (modoDeAcceso() !== "activo") return { tipo: "no-disponible" };
  try {
    // Sin la marca del canje de un enlace (o con la sesión de otra cuenta) no se cambia nada: la sesión sola no alcanza.
    if (!(await recuperacionEnCurso())) return { tipo: "enlace-no-valido" };
    const resultado = await guardarContrasena(await crearSupabaseDeServidor(), contrasena);
    switch (resultado.tipo) {
      case "ok":
        await quitarMarcaDeRecuperacion();
        return { tipo: "ok" };
      case "ok-sin-revocar":
        // La marca y la sesión quedan: el reintento del cierre las necesita.
        return { tipo: "ok-sin-revocar" };
      case "sin-sesion":
        await quitarMarcaDeRecuperacion();
        return { tipo: "enlace-no-valido" };
      default:
        return resultado;
    }
  } catch {
    return { tipo: "no-disponible" };
  }
}

export type RespuestaDeCierreDeSesiones = { tipo: "ok" } | { tipo: "ok-sin-revocar" };

/** «Cerrar las otras sesiones»: reintenta el cierre global tras un guardado `ok-sin-revocar`. Sin pedir la contraseña otra vez. */
export async function cerrarOtrasSesionesAccion(): Promise<RespuestaDeCierreDeSesiones> {
  if (modoDeAcceso() !== "activo") return { tipo: "ok-sin-revocar" };
  try {
    // Solo dentro de la recuperación que cambió la contraseña (marca + misma cuenta), como el guardado.
    if (!(await recuperacionEnCurso())) return { tipo: "ok-sin-revocar" };
    const resultado = await cerrarOtrasSesiones(await crearSupabaseDeServidor());
    if (resultado.tipo === "ok") await quitarMarcaDeRecuperacion();
    return resultado;
  } catch {
    return { tipo: "ok-sin-revocar" };
  }
}

/**
 * «Ir al login» cuando el cierre de las otras sesiones no se pudo confirmar (40B·05): cierra solo la sesión de ESTE navegador
 * (`scope: "local"`, no toca las de los demás dispositivos) y borra la marca de la recuperación, para que el login no deje
 * entrar al panel con la sesión de recuperación que sigue abierta. Nunca falla hacia afuera: `cerrarSesion` borra la cookie
 * aunque el servidor de Supabase no conteste; si ni así se pudo (un throw), la pantalla se queda donde está y puede reintentar.
 */
export async function salirDeLaRecuperacionAccion(): Promise<{ tipo: "ok" }> {
  if (modoDeAcceso() !== "activo") return { tipo: "ok" };
  await cerrarSesion(await crearSupabaseDeServidor());
  await quitarMarcaDeRecuperacion();
  return { tipo: "ok" };
}
