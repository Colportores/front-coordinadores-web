/**
 * Los textos de la pantalla de acceso (vista 38, `disenio-vistas/web/38 Login Coordinador.dc.html`). Salen del canvas, que los
 * marca como propuesta (el de credenciales no dice cuál de los dos campos falló). Los dos avisos que el canvas no dibuja
 * (`CORREO_SIN_VERIFICAR`, `DEMASIADOS_INTENTOS`) y los del cierre de sesión los redactó el implementador (mapa §2: texto/aviso,
 * ver el archivo de pendientes del PR): cada aviso dice qué pasó y qué hacer.
 */
export const TEXTOS_DE_ACCESO = {
  tituloFormulario: "Iniciá sesión",
  tituloSinAcceso: "Sin acceso al panel",
  correo: "CORREO",
  contrasena: "CONTRASEÑA",
  placeholderCorreo: "nombre@correo.com",
  placeholderContrasena: "••••••••",
  entrar: "Entrar",
  entrando: "Entrando…",
  reintentar: "Reintentar",
  entrarConOtraCuenta: "Entrar con otra cuenta",
  /** 01 · vacío */
  pieVacio: "Entrar se habilita con correo y contraseña escritos.",
  /** 02 · entrando */
  pieEntrando: "Los campos y el botón quedan apagados hasta que llegue la respuesta.",
  /** 03 · correo o contraseña incorrectos: no dice cuál de los dos falló. */
  credenciales: "El correo o la contraseña no son correctos.",
  /** 05 · sesión vencida */
  sesionVencida: "Tu sesión venció. Entrá de nuevo para seguir donde estabas.",
  /** 06 · servicio no disponible */
  noDisponible: "El panel no está disponible en este momento. No es un problema de tu cuenta: probá en unos minutos.",
  /** 07 · sesión cerrada */
  sesionCerrada: "Cerraste sesión.",
  /** 08 · sin conexión */
  sinConexion: "Sin conexión. Revisá tu internet para iniciar sesión.",
  /** Sin artboard (mapa §2). */
  correoSinVerificar: "Todavía no verificaste tu correo. Abrí el enlace que te mandamos y volvé a intentar.",
  demasiadosIntentos: "Hiciste demasiados intentos seguidos. Esperá unos minutos y volvé a intentar.",
} as const;

/** 04 · sin acceso (no es coordinador). Sin el correo, si no se pudo saber de qué cuenta se trata. */
export function textoSinAcceso(correo: string | null): string {
  const cuenta = correo ? `La cuenta ${correo}` : "Esta cuenta";
  return `${cuenta} no tiene el rol de coordinador vigente. Si creés que es un error, hablá con el administrador.`;
}
