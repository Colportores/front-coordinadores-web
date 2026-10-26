/**
 * Lo que toca el navegador al exportar (HU-REP-005): bajar un archivo y abrir el cuadro de impresión de un
 * documento. Todo pasa en el equipo de la persona: no pide nada a la red, así que exportar anda también sin conexión.
 */

/** Cuánto se espera a que cargue el documento del informe antes de darlo por fallado. */
const ESPERA_DE_CARGA_MS = 10_000;
/** Si el navegador nunca avisa que terminó de imprimir (`afterprint`), el documento oculto se retira pasado este tiempo. */
const RETIRO_DE_RESPALDO_MS = 5 * 60_000;
/** Cuánto vive la dirección temporal de un archivo bajado. */
const VIDA_DE_LA_DIRECCION_MS = 30_000;

/** Baja un archivo de texto con ese nombre. Lanza si el navegador no puede armarlo. */
export function descargarArchivo(nombre: string, contenido: string, tipo: string): void {
  const direccion = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  try {
    const enlace = document.createElement("a");
    enlace.href = direccion;
    enlace.download = nombre;
    enlace.rel = "noopener";
    enlace.style.display = "none";
    document.body.appendChild(enlace);
    try {
      enlace.click();
    } finally {
      enlace.remove();
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(direccion), VIDA_DE_LA_DIRECCION_MS);
  }
}

let marco: HTMLIFrameElement | null = null;
let temporizadores: ReturnType<typeof setTimeout>[] = [];
let alCancelar: (() => void) | null = null;
/** Lo que tenía el foco antes de enfocar el marco de impresión (el botón «Informe PDF»): ahí vuelve al retirarlo. */
let focoAnterior: HTMLElement | null = null;

/** Retira el documento oculto de la impresión anterior (o el que sigue cargando, si la pantalla se cerró). */
export function retirarDocumentoDeImpresion(): void {
  for (const t of temporizadores) clearTimeout(t);
  temporizadores = [];
  // Si el foco quedó en el marco (o cayó al <body> al quitarlo), vuelve a donde estaba; si la persona ya lo movió, no se toca.
  const activo = document.activeElement;
  const devolverFoco = marco !== null && (activo === marco || activo === document.body || activo === null) && focoAnterior?.isConnected === true;
  const destino = focoAnterior;
  focoAnterior = null;
  marco?.remove();
  marco = null;
  if (devolverFoco) destino?.focus();
  const cancelar = alCancelar;
  alCancelar = null;
  cancelar?.();
}

/**
 * Abre el cuadro de impresión con ese documento HTML (desde ahí se imprime o se guarda como PDF). Se resuelve cuando
 * el cuadro ya se pidió; se rechaza si el documento no carga a tiempo o el navegador no deja imprimir. Si la pantalla
 * se cierra mientras carga, se resuelve sin imprimir nada.
 */
export function imprimirDocumento(html: string): Promise<void> {
  retirarDocumentoDeImpresion();
  return new Promise<void>((resolver, rechazar) => {
    const iframe = document.createElement("iframe");
    iframe.title = "Informe para imprimir";
    iframe.setAttribute("aria-hidden", "true");
    iframe.tabIndex = -1;
    Object.assign(iframe.style, { position: "fixed", left: "-9999px", top: "0", width: "0", height: "0", border: "0" });

    let atendido = false;
    const cerrar = () => {
      if (marco === iframe) retirarDocumentoDeImpresion();
      else iframe.remove();
    };
    alCancelar = () => {
      atendido = true;
      resolver();
    };
    temporizadores.push(
      setTimeout(() => {
        if (atendido) return;
        atendido = true;
        alCancelar = null; // se rechaza, no se resuelve
        cerrar();
        rechazar(new Error("El informe no cargó a tiempo."));
      }, ESPERA_DE_CARGA_MS),
    );

    iframe.addEventListener("load", () => {
      if (atendido) return;
      atendido = true;
      alCancelar = null;
      try {
        const ventana = iframe.contentWindow;
        if (!ventana) throw new Error("El informe no tiene ventana donde imprimir.");
        ventana.addEventListener("afterprint", cerrar);
        temporizadores.push(setTimeout(cerrar, RETIRO_DE_RESPALDO_MS));
        const activo = document.activeElement;
        focoAnterior = activo instanceof HTMLElement && activo !== iframe && activo !== document.body ? activo : null;
        ventana.focus();
        ventana.print();
        resolver();
      } catch (error) {
        cerrar();
        rechazar(error);
      }
    });

    marco = iframe;
    iframe.srcdoc = html;
    document.body.appendChild(iframe);
  });
}
