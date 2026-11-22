/**
 * Lo que toca el navegador al exportar (HU-REP-005): bajar un archivo. El CSV se arma en el equipo de la persona y no
 * pide nada a la red; el «Informe PDF» lo arma el servidor (issue #84) y acá solo se baja lo que llegó.
 */

/** Cuánto vive la dirección temporal de un archivo bajado. */
const VIDA_DE_LA_DIRECCION_MS = 30_000;

/** Baja un archivo de texto con ese nombre. Lanza si el navegador no puede armarlo. */
export function descargarArchivo(nombre: string, contenido: string, tipo: string): void {
  bajar(nombre, contenido, tipo);
}

/** Baja un archivo binario (el PDF) con ese nombre. Lanza si el navegador no puede armarlo. */
export function descargarBytes(nombre: string, contenido: Uint8Array<ArrayBuffer>, tipo: string): void {
  bajar(nombre, contenido, tipo);
}

function bajar(nombre: string, contenido: BlobPart, tipo: string): void {
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

/** Los bytes de un texto en base64 (lo que viaja de la server action al navegador). Lanza si no es base64 válido. */
export function bytesDeBase64(base64: string): Uint8Array<ArrayBuffer> {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}
