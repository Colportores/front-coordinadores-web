import { LARGO_MINIMO_CONTRASENA } from "@/features/acceso/validacion";

/**
 * Los textos de recuperar la contraseña (vista 40, `disenio-vistas/web/40 Recuperar Contrasena.dc.html`, HU-AUTH-004 y
 * HU-AUTH-005): salen del canvas, con el rótulo tal cual. Los estados que el canvas no dibuja los redactó el implementador
 * (mapa §2: texto/aviso, ver el archivo de pendientes del PR) y dicen qué pasó y qué hacer.
 */
export const TEXTOS_DE_OLVIDE = {
  /** 40A-01 */
  titulo: "¿Olvidaste tu contraseña?",
  texto: "Ingresá tu correo y te enviamos un enlace para elegir una nueva.",
  correo: "CORREO",
  placeholderCorreo: "nombre@correo.com",
  enviar: "Enviar enlace",
  /** 40A-03: el canvas; con un carácter que no va (tilde, ñ, espacio, coma…) rige el aviso del login. */
  correoIncompleto: "Revisá el correo: parece incompleto.",
  /** 40A-04 */
  enviando: "Enviando…",
  /** 40A-05: la respuesta es la misma tenga o no cuenta ese correo (no se revela si existe). */
  tituloEnviado: "Revisá tu correo",
  textoEnviado: (correo: string) =>
    `Si ${correo} tiene una cuenta de coordinador, te mandamos un enlace para elegir una contraseña nueva. Si no lo encontrás, mirá la carpeta de spam.`,
  reenviarEn: (segundos: number) => `Reenviar en ${segundos} s`,
  /** Sin artboard: pasados los 60 s el botón de la pantalla 05 vuelve a servir. */
  reenviar: "Reenviar enlace",
  /** Sin artboard: lo anuncia el lector de pantalla cuando el reenvío salió. */
  reenviado: "Enlace reenviado.",
  /** 40A-06 */
  espera: (segundos: number) => `Podés pedir otro enlace en ${segundos} s.`,
  /** 40A-07 */
  sinConexion: "Sin conexión. Revisá tu internet para pedir el enlace.",
  /** 40A-08 */
  noDisponible: "No pudimos enviar el enlace en este momento. Probá en unos minutos.",
  reintentar: "Reintentar",
  volverAlLogin: "‹ Volver al login",
} as const;

export const TEXTOS_DE_NUEVA_CONTRASENA = {
  /** 40B-01 */
  titulo: "Elegí una contraseña nueva",
  para: (correo: string) => `Para ${correo}.`,
  nueva: "NUEVA CONTRASEÑA",
  repetida: "REPETILA",
  ver: "Ver",
  ocultar: "Ocultar",
  guardar: "Guardar contraseña",
  /** 40B-02: las reglas del teléfono (vista 15). */
  reglaLargo: `Al menos ${LARGO_MINIMO_CONTRASENA} caracteres`,
  reglaLargoFaltan: (faltan: number) => `Al menos ${LARGO_MINIMO_CONTRASENA} caracteres · faltan ${faltan}`,
  reglaMayuscula: "Una mayúscula",
  reglaNumero: "Un número",
  reglasTitulo: "Requisitos de la contraseña",
  cumple: "cumple",
  noCumple: "no cumple",
  /** 40B-03 */
  noCoinciden: "Las contraseñas no coinciden.",
  /** 40B-04 */
  guardando: "Guardando…",
  /** 40B-05 */
  tituloCambiada: "Contraseña cambiada",
  cambiada: "Ya podés entrar con tu contraseña nueva.",
  irAlLogin: "Ir al login",
  /** 40B-05 con el cierre de las otras sesiones sin confirmar (decisión del orquestador 22/11, precedente HU-AUTH-005 02/10). */
  sinRevocar: "Cambiaste la contraseña, pero no pudimos cerrar las otras sesiones de tu cuenta. Probá de nuevo.",
  cerrarOtras: "Cerrar las otras sesiones",
  cerrandoOtras: "Cerrando…",
  /** Sin artboard (mapa §2: texto/aviso): «Ir al login» no pudo cerrar la sesión de este navegador; sin cerrarla no se sale. */
  noPudoSalir: "No pudimos cerrar la sesión en este navegador. Probá de nuevo.",
  saliendo: "Saliendo…",
  /** Sin artboard (decisión del 23/11, opción a; tono de 40B-08): con el cierre fallido y sin red, los dos botones quedan apagados. */
  sinConexionParaSalir: "Sin conexión. Revisá tu internet para cerrar la sesión.",
  /** 40B-06: una sola pantalla para vencido, ya usado y otro navegador (HU-AUTH-005); el texto no afirma el motivo (decisión P3). */
  tituloNoValido: "Enlace no válido",
  noValido: "No pudimos abrir este enlace en este navegador. Abrilo en el navegador donde lo pediste, o pedí uno nuevo desde acá.",
  solicitarNuevo: "Solicitar un enlace nuevo",
  /** 40B-07 */
  errorAlGuardar: "No pudimos guardar la contraseña. Probá de nuevo.",
  reintentar: "Reintentar",
  /** 40B-08 */
  sinConexion: "Sin conexión. Revisá tu internet para guardar la contraseña.",
  volverAlLogin: "‹ Volver al login",
  /** Sin artboard: mientras se abre el enlace del correo. */
  verificando: "Verificando el enlace…",
  /** Sin artboard: no se pudo comprobar el enlace (red o servicio), que no es lo mismo que un enlace vencido. */
  tituloNoSePudoAbrir: "No pudimos abrir el enlace",
  noSePudoAbrir: "No pudimos comprobar el enlace en este momento. Probá de nuevo en unos minutos.",
  /** Sin artboard: Supabase rechazó la contraseña por ser la misma que la actual (HU-AUTH-005: no puede ser igual a la anterior). */
  /** Tope de 72 bytes (HU-AUTH-001 «Topes de largo»): el mismo texto que el registro del teléfono. */
  demasiadaLarga: "Es demasiado larga. Acortala.",
  mismaContrasena: "La contraseña nueva tiene que ser distinta de la actual. Elegí otra.",
  /** Sin artboard: el servidor aplica la política y no la aceptó. */
  contrasenaDebil: `La contraseña no cumple los requisitos: al menos ${LARGO_MINIMO_CONTRASENA} caracteres, una mayúscula y un número.`,
} as const;
