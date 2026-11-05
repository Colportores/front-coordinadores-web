// Verifica, sobre un build de producción, que las pestañas con flag apagado
// (Stock y Cuentas en staging/producción) no filtren contenido: ni en los
// archivos prerenderizados ni en las respuestas HTML y RSC del servidor.
// Corre al final de `npm run check`, después de `next build`.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const VERDADEROS = new Set(["1", "true", "si", "sí", "on"]);
const FALSOS = new Set(["0", "false", "no", "off"]);
const bandera = (v) => {
  const n = v?.trim().toLowerCase();
  return n === undefined ? undefined : VERDADEROS.has(n) ? true : FALSOS.has(n) ? false : undefined;
};
const modoDev = bandera(process.env.NEXT_PUBLIC_MODO_DEV) ?? false;
const ocultas = [
  { ruta: "stock", flag: bandera(process.env.NEXT_PUBLIC_PESTANA_STOCK) ?? modoDev, patron: /HU-STK|Pestaña Stock/ },
  { ruta: "cuentas", flag: bandera(process.env.NEXT_PUBLIC_PESTANA_CUENTAS) ?? modoDev, patron: /HU-CTA|HU-COB|Pestaña Cuentas/ },
].filter((p) => !p.flag);

if (ocultas.length === 0) {
  console.log("verificar-pestanas-ocultas: no hay pestañas ocultas con estos flags, se omite.");
  process.exit(0);
}

const errores = [];

for (const { ruta, patron } of ocultas) {
  for (const ext of ["html", "rsc"]) {
    const archivo = `.next/server/app/${ruta}.${ext}`;
    if (existsSync(archivo) && patron.test(readFileSync(archivo, "utf8"))) {
      errores.push(`${archivo} contiene la pestaña oculta`);
    }
  }
}

const PUERTO = 3199;
const servidor = spawn("node_modules/.bin/next", ["start", "-p", String(PUERTO)], { stdio: "ignore" });
const base = `http://127.0.0.1:${PUERTO}`;

try {
  let listo = false;
  for (let i = 0; i < 60 && !listo; i++) {
    try {
      listo = (await fetch(`${base}/inicio`)).ok;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (!listo) throw new Error("el servidor no arrancó");

  for (const { ruta, patron } of ocultas) {
    for (const camino of [`/${ruta}`, `/${ruta}/detalle`]) {
      const html = await fetch(`${base}${camino}`);
      const cuerpoHtml = await html.text();
      if (html.status !== 404) errores.push(`${camino} respondió ${html.status} (se esperaba 404)`);
      if (patron.test(cuerpoHtml)) errores.push(`${camino}: el HTML contiene la pestaña oculta`);

      const rsc = await fetch(`${base}${camino}`, { headers: { RSC: "1" } });
      if (patron.test(await rsc.text())) errores.push(`${camino}: el payload RSC contiene la pestaña oculta`);
    }
  }
} finally {
  servidor.kill();
}

if (errores.length > 0) {
  console.error("verificar-pestanas-ocultas: FALLA\n- " + errores.join("\n- "));
  process.exit(1);
}
console.log(`verificar-pestanas-ocultas: OK (${ocultas.map((p) => p.ruta).join(", ")}: 404 sin contenido en HTML ni RSC)`);
