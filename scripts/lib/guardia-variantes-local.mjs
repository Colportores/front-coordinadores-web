// Guarda estática (sin compilar) del sitio de prueba de GitHub Pages (issue #127, seguimiento de #126).
//
// `build:pages` ya no corre en el CI de los PR (solo en staging.yml), así que una página con server actions a la que le falta
// su variante `*Local` —o que importa el módulo de las acciones donde el export estático no lo admite— se rompería recién al
// pasar a staging. Este módulo revisa, leyendo texto y sin compilar, las reglas de docs/PESTANAS.md §2 que hacen que
// `build:pages` falle. Funciones puras: las prueba scripts/lib/guardia-variantes-local.test.mjs sobre el código real y sobre
// casos rotos a propósito.
//
// Reglas, por cada `page.tsx` y `layout.tsx` de `src/app`:
//  1. Toda mención de `NEXT_PUBLIC_DEPLOY_PAGES` es la condición literal `process.env.NEXT_PUBLIC_DEPLOY_PAGES === "1"`
//     (si no, el compilador no descarta la rama que no corresponde).
//  2. Ningún módulo de server actions (un archivo con la directiva `"use server"`) se importa de forma estática, y el
//     `import()` dinámico va en el `else` de esa condición (el export estático no admite server actions).
//  3. La rama del sitio de prueba no usa `next/headers`, `connection()` ni `force-dynamic`.
//  4. Una PÁGINA que importa server actions renderiza en la rama del sitio de prueba una variante `*Local` que existe, es
//     `"use client"`, no importa server actions ni `next/headers` y no toma el selector de fuente (`fuenteX`): solo la simulada.

/** Páginas con server actions que, por construcción, no tienen una vista con variante `*Local` (el motivo va en el test). */
export const PAGINAS_SIN_LOCAL = Object.freeze({
  "src/app/acceso/page.tsx": "el sitio de prueba no tiene login: muestra un mensaje fijo y manda al inicio",
});

const CONDICION = 'process.env.NEXT_PUBLIC_DEPLOY_PAGES === "1"';

/** Directiva `"use server"` de módulo (primera línea) o dentro de una función (server action en línea). */
export function esModuloDeServerActions(texto) {
  return /^[ \t]*(["'])use server\1[ \t]*;?[ \t]*$/m.test(texto);
}

/** Los `import ... from "x"`, `import "x"` e `import("x")` de un texto, con su posición y si son dinámicos o solo de tipos. */
export function importsDe(texto) {
  const encontrados = [];
  // Sin una expresión regular para el cuerpo del import (su retroceso era super-lineal, Sonar S8786): se recorre el texto
  // una vez, y la próxima comilla o `;` se guarda para que muchos `import` sin cierre no vuelvan a recorrer lo mismo.
  let parada = -1;
  const proximaParada = (desde) => {
    if (parada >= desde) return parada;
    parada = desde;
    while (parada < texto.length && !'"\';'.includes(texto[parada])) parada += 1;
    return parada;
  };
  for (const m of texto.matchAll(/^[ \t]*import(?=[\s"'])/gm)) {
    const importado = leerImportEstatico(texto, m.index + m[0].length, proximaParada);
    if (importado) encontrados.push({ ...importado, posicion: m.index });
  }
  for (const m of texto.matchAll(/\bimport\(\s*(["'])([^"']+)\1\s*\)/g)) {
    encontrados.push({ especificador: m[2], dinamico: true, soloTipos: false, nombres: "", posicion: m.index });
  }
  return encontrados;
}

const esBlanco = (caracter) => caracter !== undefined && /\s/.test(caracter);

/** El especificador entre comillas que empieza en `texto[inicio]` (la comilla de apertura), o `null` si no está bien cerrado. */
function especificadorDesde(texto, inicio) {
  const comilla = texto[inicio];
  const cierre = texto.indexOf(comilla, inicio + 1);
  if (cierre === -1) return null;
  const especificador = texto.slice(inicio + 1, cierre);
  return especificador === "" || especificador.includes('"') || especificador.includes("'") ? null : especificador;
}

/** El resto de un `import` estático desde justo después de la palabra `import`; `null` si no es uno. */
function leerImportEstatico(texto, desde, proximaParada) {
  let i = desde;
  while (esBlanco(texto[i])) i += 1;
  const hubo = i > desde;
  if (texto[i] === '"' || texto[i] === "'") {
    const especificador = especificadorDesde(texto, i);
    return especificador === null ? null : { especificador, dinamico: false, soloTipos: false, nombres: "" };
  }
  if (!hubo) return null;
  let soloTipos = false;
  if (texto.startsWith("type", i) && esBlanco(texto[i + 4])) {
    soloTipos = true;
    i += 4;
    while (esBlanco(texto[i])) i += 1;
  }
  const parada = proximaParada(i);
  if (parada >= texto.length || texto[parada] === ";") return null;
  let fin = parada;
  while (fin > i && esBlanco(texto[fin - 1])) fin -= 1;
  if (fin - 4 < i || texto.slice(fin - 4, fin) !== "from") return null;
  const especificador = especificadorDesde(texto, parada);
  if (especificador === null) return null;
  return { especificador, dinamico: false, soloTipos, nombres: texto.slice(i, fin - 4).trimEnd() };
}

/** Ruta de archivo (con `/`, relativa a la raíz del repo) a la que apunta un import, probando las extensiones; `null` si es de un paquete. */
export function resolverImport(especificador, desde, existe) {
  let base;
  if (especificador.startsWith("@/")) base = `src/${especificador.slice(2)}`;
  else if (especificador.startsWith(".")) base = normalizar(`${carpetaDe(desde)}/${especificador}`);
  else return null;
  for (const candidata of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (existe(candidata)) return candidata;
  }
  return null;
}

function carpetaDe(ruta) {
  return ruta.split("/").slice(0, -1).join("/");
}

function normalizar(ruta) {
  const partes = [];
  for (const parte of ruta.split("/")) {
    if (parte === "." || parte === "") continue;
    if (parte === "..") partes.pop();
    else partes.push(parte);
  }
  return partes.join("/");
}

/** Texto de la rama del sitio de prueba: de `if (condición literal)` al `else` que le sigue (o al final si no hay). `null` si no hay ese `if`. */
function ramaDelSitioDePrueba(texto) {
  const inicio = texto.search(/\bif\s*\(\s*process\.env\.NEXT_PUBLIC_DEPLOY_PAGES === "1"\s*\)/);
  if (inicio === -1) return null;
  const hasta = texto.slice(inicio).search(/\belse\b/);
  const fin = hasta === -1 ? texto.length : inicio + hasta;
  return { inicio, fin, texto: texto.slice(inicio, fin) };
}

/** El texto sin comentarios (los comentarios nombran el selector y las funciones que justamente no se usan). */
function sinComentarios(texto) {
  // Los bloques `/* … */` con indexOf (la expresión con `[\s\S]*?` era cuadrática con muchos `/*` sin cierre); uno sin cierre queda como estaba.
  const partes = [];
  let desde = 0;
  for (;;) {
    const abre = texto.indexOf("/*", desde);
    const cierra = abre === -1 ? -1 : texto.indexOf("*/", abre + 2);
    if (cierra === -1) break;
    partes.push(texto.slice(desde, abre));
    desde = cierra + 2;
  }
  partes.push(texto.slice(desde));
  return partes.join("").replace(/^[ \t]*\/\/.*$/gm, "");
}

const PROHIBIDO_EN_LA_RAMA = [
  { patron: /next\/headers/, que: "`next/headers`" },
  { patron: /\bcookies\s*\(/, que: "`cookies()`" },
  { patron: /\bheaders\s*\(/, que: "`headers()`" },
  { patron: /\bconnection\s*\(/, que: "`connection()`" },
  { patron: /force-dynamic/, que: "`force-dynamic`" },
];

/** Nombres de componente (`<AlgoLocal`) que la rama del sitio de prueba renderiza. */
function localesRenderizados(rama) {
  return [...new Set([...rama.matchAll(/<([A-Z]\w*Local)\b/g)].map((m) => m[1]))];
}

/**
 * Revisa las páginas y layouts de `src/app`.
 * @param {Record<string, string>} archivos ruta (con `/`, desde la raíz del repo) -> texto, de todo `src/` salvo los tests.
 * @returns {string[]} lo que está mal, una frase por hallazgo (vacío si todo está bien).
 */
export function revisarVariantesLocal(archivos) {
  const hallazgos = [];
  const existe = (ruta) => Object.hasOwn(archivos, ruta);
  const modulosDeAcciones = new Set(Object.keys(archivos).filter((ruta) => esModuloDeServerActions(archivos[ruta])));

  const entradas = Object.keys(archivos)
    .filter((ruta) => /^src\/app\/(?:.+\/)?(?:page|layout)\.tsx$/.test(ruta))
    .sort((a, b) => (a < b ? -1 : Number(a > b))); // orden por unidades de código, como el .sort() previo

  for (const ruta of entradas) {
    const texto = archivos[ruta];
    const esPagina = ruta.endsWith("/page.tsx");
    const rama = ramaDelSitioDePrueba(texto);

    // 1. La condición, siempre literal.
    const menciones = texto.match(/NEXT_PUBLIC_DEPLOY_PAGES/g)?.length ?? 0;
    const literales = texto.split(CONDICION).length - 1;
    if (menciones !== literales) {
      hallazgos.push(`${ruta}: usa NEXT_PUBLIC_DEPLOY_PAGES sin la condición literal \`${CONDICION}\` (el compilador no descarta la otra rama).`);
    }

    // 2. Server actions: nunca estáticas, y el import dinámico en el `else`.
    const deAcciones = importsDe(texto).flatMap((imp) => {
      const destino = resolverImport(imp.especificador, ruta, existe);
      return destino && modulosDeAcciones.has(destino) ? [{ ...imp, destino }] : [];
    });
    for (const imp of deAcciones) {
      if (!imp.dinamico) {
        if (!imp.soloTipos) {
          hallazgos.push(`${ruta}: importa las server actions de ${imp.destino} de forma estática; va con \`await import()\` en el \`else\` de la condición del sitio de prueba.`);
        }
      } else if (!rama) {
        hallazgos.push(`${ruta}: importa las server actions de ${imp.destino} y no tiene el \`if (${CONDICION})\` que las deje fuera del sitio de prueba.`);
      } else if (imp.posicion < rama.fin) {
        hallazgos.push(`${ruta}: el \`import()\` de las server actions de ${imp.destino} no está en el \`else\` de la condición del sitio de prueba.`);
      }
    }

    if (!rama) continue;

    // 3. Lo que el export estático no admite, fuera de la rama del sitio de prueba.
    for (const { patron, que } of PROHIBIDO_EN_LA_RAMA) {
      if (patron.test(rama.texto)) hallazgos.push(`${ruta}: la rama del sitio de prueba usa ${que}, que el export estático no admite.`);
    }

    // 4. La variante `*Local` de la vista.
    if (!esPagina || deAcciones.length === 0) continue;
    if (Object.hasOwn(PAGINAS_SIN_LOCAL, ruta)) continue;
    const locales = localesRenderizados(rama.texto);
    if (locales.length === 0) {
      hallazgos.push(`${ruta}: usa server actions y su rama del sitio de prueba no renderiza ninguna variante \`*Local\` (docs/PESTANAS.md §2).`);
      continue;
    }
    for (const nombre of locales) {
      hallazgos.push(...revisarLocal(ruta, nombre, texto, archivos, existe, modulosDeAcciones));
    }
  }
  return hallazgos;
}

function revisarLocal(ruta, nombre, textoDeLaPagina, archivos, existe, modulosDeAcciones) {
  const importado = importsDe(textoDeLaPagina).find((imp) => !imp.dinamico && new RegExp(`\\b${nombre}\\b`).test(imp.nombres));
  const destino = importado ? resolverImport(importado.especificador, ruta, existe) : null;
  if (!destino) return [`${ruta}: renderiza <${nombre}> pero no se encuentra su archivo (¿falta el import?).`];

  const hallazgos = [];
  const texto = archivos[destino];
  if (!/^\s*(["'])use client\1/.test(texto)) hallazgos.push(`${destino}: la variante \`*Local\` tiene que ser un componente de cliente (\`"use client"\`).`);
  for (const imp of importsDe(texto)) {
    const alDestino = resolverImport(imp.especificador, destino, existe);
    if (alDestino && modulosDeAcciones.has(alDestino)) {
      hallazgos.push(`${destino}: la variante \`*Local\` importa las server actions de ${alDestino}; en el sitio de prueba no hay servidor.`);
    }
    if (/^next\/(headers|server)$/.test(imp.especificador)) {
      hallazgos.push(`${destino}: la variante \`*Local\` importa \`${imp.especificador}\`, que el export estático no admite.`);
    }
  }
  // Siempre la fuente simulada, por construcción: nunca el selector `fuenteX` de `index.ts` (ni importado ni leído de un `import()`).
  for (const nombreDeFuente of new Set(sinComentarios(texto).match(/\bfuente[A-Z]\w*/g) ?? [])) {
    if (!/Simulad[ao]$/.test(nombreDeFuente)) {
      hallazgos.push(`${destino}: la variante \`*Local\` usa el selector \`${nombreDeFuente}\`; tiene que usar solo la fuente simulada (docs/PESTANAS.md §2).`);
    }
  }
  return hallazgos;
}
