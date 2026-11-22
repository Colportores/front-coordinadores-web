"use server";

import { guardarContrasena, abrirEnlace, pedirEnlace } from "@/auth/recuperacion";
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

export type RespuestaDeApertura = { tipo: "ok"; correo: string } | { tipo: "no-valido" } | { tipo: "no-disponible" };

export type RespuestaDeGuardado =
  | { tipo: "ok" }
  | { tipo: "enlace-no-valido" }
  | { tipo: "misma-contrasena" }
  | { tipo: "contrasena-debil" }
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

export async function abrirEnlaceAccion(codigo: unknown): Promise<RespuestaDeApertura> {
  if (typeof codigo !== "string" || codigo === "" || codigo.length > LARGO_MAXIMO_DEL_CODIGO) return { tipo: "no-valido" };
  if (modoDeAcceso() !== "activo") return { tipo: "no-disponible" };
  try {
    const resultado = await abrirEnlace(await crearSupabaseDeServidor(), codigo);
    if (resultado.tipo !== "ok") return resultado;
    await ponerMarcaDeRecuperacion(resultado.usuarioId);
    return { tipo: "ok", correo: resultado.correo };
  } catch {
    return { tipo: "no-disponible" };
  }
}

export async function guardarContrasenaAccion(contrasena: unknown): Promise<RespuestaDeGuardado> {
  if (typeof contrasena !== "string" || !reglasDeContrasena(contrasena).cumple) return { tipo: "contrasena-debil" };
  if (modoDeAcceso() !== "activo") return { tipo: "no-disponible" };
  try {
    // Sin la marca del canje de un enlace (o con la sesión de otra cuenta) no se cambia nada: la sesión sola no alcanza.
    if (!(await recuperacionEnCurso())) return { tipo: "enlace-no-valido" };
    const resultado = await guardarContrasena(await crearSupabaseDeServidor(), contrasena);
    switch (resultado.tipo) {
      case "ok":
        await quitarMarcaDeRecuperacion();
        return { tipo: "ok" };
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
