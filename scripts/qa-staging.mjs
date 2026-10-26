// QA de punta a punta del panel tal como se despliega en staging (issue #27): el build de producción servido con
// `next start`, el modo dev apagado y sin variables de Supabase (datos simulados), recorrido en un Chromium real.
// Corre al final de `npm run check`, después de `next build` (como `verificar:pestanas-ocultas`).
//
//   docker compose -f compose.dev.yml run --rm -e NEXT_PUBLIC_MODO_DEV=0 app sh -c "npm run build && npm run qa:staging"
//
// Qué comprueba, ruta por ruta (1280 x 800, el mínimo que fija el shell):
//   - cada pestaña visible responde 200, tiene su título (h1), marca la pestaña activa en el menú y no se desborda;
//   - no hay errores de consola, excepciones de la página ni pedidos propios que fallen;
//   - ningún rastro del modo dev (chips ni panel «Estado de HU») y el menú no ofrece Stock ni Cuentas;
//   - Stock, Cuentas y sus subrutas responden 404 con el aviso del panel;
//   - axe-core (WCAG 2.2 AA) sin violaciones;
//   - los flujos que pasan por el servidor (server actions): elegir campaña en el topbar y buscar y añadir un colportor.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

import { chromium } from "@playwright/test";

const requerir = createRequire(import.meta.url);
const rutaAxe = requerir.resolve("axe-core/axe.min.js");

const PUERTO = 3198;
const base = `http://127.0.0.1:${PUERTO}`;
const VISTA = { width: 1280, height: 800 };

const PESTANAS_VISIBLES = ["Inicio", "Equipo", "Ciudades", "Reportes"];
const RUTAS_VISIBLES = [
  { ruta: "/inicio", pestana: "Inicio" },
  { ruta: "/equipo", pestana: "Equipo" },
  { ruta: "/equipo/anadir", pestana: "Equipo" },
  { ruta: "/ciudades", pestana: "Ciudades" },
  { ruta: "/reportes", pestana: "Reportes" },
];
const RUTAS_OCULTAS = ["/stock", "/stock/pedidos", "/stock/detalle", "/cuentas", "/cuentas/detalle"];
const TEXTO_NO_DISPONIBLE = "Esta sección no existe o no está disponible.";
const ETIQUETAS_AXE = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const fallas = [];
const falla = (donde, texto) => fallas.push(`${donde}: ${texto}`);

const servidor = spawn("node_modules/.bin/next", ["start", "-p", String(PUERTO)], { stdio: "ignore" });
let navegador;

async function esperarServidor() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/inicio`)).ok) return;
    } catch {
      // todavía no escucha
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("el servidor no arrancó");
}

/** Una página nueva con los vigías de errores puestos; `problemas` junta lo que pase mientras se la usa. */
async function paginaNueva() {
  const contexto = await navegador.newContext({ viewport: VISTA, locale: "es-UY" });
  const pagina = await contexto.newPage();
  const problemas = [];
  pagina.on("console", (m) => {
    if (m.type() === "error") problemas.push(`consola: ${m.text()}`);
  });
  pagina.on("pageerror", (e) => problemas.push(`excepción: ${e.message}`));
  pagina.on("response", (r) => {
    if (r.url().startsWith(base) && r.status() >= 400 && !r.url().endsWith("/favicon.ico")) {
      problemas.push(`pedido propio ${r.status()}: ${r.url().replace(base, "")}`);
    }
  });
  pagina.on("requestfailed", (p) => {
    // ERR_ABORTED: el navegador corta un pedido porque la página lo reemplaza (router.refresh(), cambio de ruta); no es una caída.
    if (p.failure()?.errorText.includes("ERR_ABORTED")) return;
    if (p.url().startsWith(base)) problemas.push(`pedido propio caído: ${p.url().replace(base, "")} (${p.failure()?.errorText})`);
  });
  return { pagina, problemas, contexto };
}

async function reposar(pagina) {
  await pagina.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
}

async function auditarAccesibilidad(pagina, donde) {
  await pagina.addScriptTag({ path: rutaAxe });
  const resultado = await pagina.evaluate(
    (etiquetas) => globalThis.axe.run(document, { runOnly: { type: "tag", values: etiquetas } }),
    ETIQUETAS_AXE,
  );
  for (const v of resultado.violations) {
    const nodos = v.nodes
      .slice(0, 3)
      .map((n) => n.target.join(" "))
      .join(" | ");
    falla(donde, `axe ${v.id} (${v.impact}): ${v.help} → ${nodos}`);
  }
}

async function recorrerVisible({ ruta, pestana }) {
  const { pagina, problemas, contexto } = await paginaNueva();
  try {
    const respuesta = await pagina.goto(`${base}${ruta}`, { waitUntil: "load" });
    await reposar(pagina);
    if (respuesta?.status() !== 200) falla(ruta, `respondió ${respuesta?.status()} (se esperaba 200)`);

    const titulos = await pagina.locator("h1").allTextContents();
    if (titulos.length !== 1 || !titulos[0].trim()) falla(ruta, `debería tener un h1 con texto y tiene ${JSON.stringify(titulos)}`);

    const menu = await pagina.locator('nav[aria-label="Secciones del panel"] a').allTextContents();
    if (JSON.stringify(menu.map((t) => t.trim())) !== JSON.stringify(PESTANAS_VISIBLES)) {
      falla(ruta, `el menú debería ofrecer ${PESTANAS_VISIBLES.join(", ")} y ofrece ${menu.join(", ")}`);
    }
    const activas = await pagina.locator('nav[aria-label="Secciones del panel"] a[aria-current="page"]').allTextContents();
    if (activas.length !== 1 || activas[0].trim() !== pestana) falla(ruta, `la pestaña activa debería ser ${pestana} y es ${JSON.stringify(activas)}`);

    const texto = await pagina.evaluate(() => document.body.innerText);
    if (/Estado de HU/i.test(texto) || /\bHU-[A-Z]{3,4}-\d{3}\b/.test(texto)) falla(ruta, "se ve el modo dev (chips o panel de estado de HU)");
    if (await pagina.locator('[data-testid^="estado-pestana"]').count()) falla(ruta, "el menú muestra el estado de HU del modo dev");

    const desborde = await pagina.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (desborde > 0) falla(ruta, `la página se desborda ${desborde}px a lo ancho a 1280 px`);

    await auditarAccesibilidad(pagina, ruta);
    for (const p of problemas) falla(ruta, p);
  } finally {
    await contexto.close();
  }
}

async function recorrerOculta(ruta) {
  const { pagina, problemas, contexto } = await paginaNueva();
  try {
    const respuesta = await pagina.goto(`${base}${ruta}`, { waitUntil: "load" });
    await reposar(pagina);
    if (respuesta?.status() !== 404) falla(ruta, `respondió ${respuesta?.status()} (se esperaba 404)`);
    if (!(await pagina.getByText(TEXTO_NO_DISPONIBLE).count())) falla(ruta, `el 404 no muestra «${TEXTO_NO_DISPONIBLE}»`);
    const vuelta = pagina.getByRole("link", { name: "Ir a Inicio" });
    if (!(await vuelta.count())) falla(ruta, "el 404 no ofrece volver a Inicio");
    await auditarAccesibilidad(pagina, ruta);
    // El 404 es la respuesta esperada: lo único que no debería haber son errores de consola o excepciones.
    for (const p of problemas) if (!p.startsWith("pedido propio 404") && !p.includes("404")) falla(ruta, p);
  } finally {
    await contexto.close();
  }
}

async function recorrerRaizYDesconocida() {
  const { pagina, contexto } = await paginaNueva();
  try {
    await pagina.goto(`${base}/`, { waitUntil: "load" });
    if (new URL(pagina.url()).pathname !== "/inicio") falla("/", `debería ir a /inicio y quedó en ${new URL(pagina.url()).pathname}`);
    const respuesta = await pagina.goto(`${base}/esto-no-existe`, { waitUntil: "load" });
    if (respuesta?.status() !== 404) falla("/esto-no-existe", `respondió ${respuesta?.status()} (se esperaba 404)`);
    if (!(await pagina.getByText(TEXTO_NO_DISPONIBLE).count())) falla("/esto-no-existe", "el 404 no muestra el aviso del panel");
  } finally {
    await contexto.close();
  }
}

/** Topbar → selector de campaña: la lista sale de una server action; elegir otra cambia el botón y se avisa. */
async function flujoElegirCampania() {
  const donde = "flujo: elegir campaña";
  const { pagina, problemas, contexto } = await paginaNueva();
  try {
    await pagina.goto(`${base}/inicio`, { waitUntil: "load" });
    await reposar(pagina);
    const boton = pagina.locator('button[aria-haspopup="listbox"]');
    await boton.click();
    const lista = pagina.getByRole("listbox", { name: "Campañas" });
    await lista.waitFor({ timeout: 10_000 });
    const opciones = await lista.getByRole("option").count();
    if (opciones < 2) falla(donde, `la lista debería traer las campañas y trae ${opciones}`);

    await pagina.keyboard.press("Escape");
    if (await lista.count()) falla(donde, "Esc no cerró la lista");
    if (!(await boton.evaluate((b) => b === document.activeElement))) falla(donde, "Esc no devolvió el foco al botón");

    await boton.click();
    await lista.waitFor({ timeout: 10_000 });
    const otra = lista.getByRole("option", { selected: false }).first();
    const nombre = (await otra.getAttribute("title")) ?? "";
    await otra.click();
    await pagina.getByRole("button", { name: new RegExp(nombre.slice(0, 10)) }).first().waitFor({ timeout: 10_000 }).catch(() => {
      falla(donde, `elegir «${nombre}» no cambió el botón del topbar`);
    });
    const cookie = (await contexto.cookies()).find((c) => c.name === "campania-elegida");
    if (!cookie) falla(donde, "no quedó la cookie campania-elegida");
    await reposar(pagina);
    for (const p of problemas) falla(donde, p);
  } finally {
    await contexto.close();
  }
}

/** Equipo → Añadir colportor: buscar y añadir van por server actions del build de producción; Deshacer lo devuelve. */
async function flujoAnadirColportor() {
  const donde = "flujo: añadir colportor";
  const { pagina, problemas, contexto } = await paginaNueva();
  try {
    await pagina.goto(`${base}/equipo/anadir`, { waitUntil: "load" });
    await reposar(pagina);
    const buscador = pagina.getByRole("textbox", { name: "Buscar por email o nombre" });
    await buscador.fill("ana");
    const fila = pagina.getByRole("button", { name: /^Añadir a / }).first();
    await fila.waitFor({ timeout: 15_000 });
    const nombre = ((await fila.getAttribute("aria-label")) ?? "").replace("Añadir a ", "");
    await fila.click();
    const deshacer = pagina.getByRole("button", { name: `Deshacer: ${nombre}` });
    await deshacer.waitFor({ timeout: 10_000 });
    await deshacer.click();
    await deshacer.waitFor({ state: "detached", timeout: 10_000 }).catch(() => falla(donde, "«Deshacer» no quitó el aviso"));
    await reposar(pagina);
    for (const p of problemas) falla(donde, p);
  } finally {
    await contexto.close();
  }
}

try {
  await esperarServidor();
  navegador = await chromium.launch();
  for (const r of RUTAS_VISIBLES) await recorrerVisible(r);
  for (const r of RUTAS_OCULTAS) await recorrerOculta(r);
  await recorrerRaizYDesconocida();
  await flujoElegirCampania();
  await flujoAnadirColportor();
} catch (error) {
  falla("qa-staging", `se cortó: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await navegador?.close();
  servidor.kill();
}

if (fallas.length > 0) {
  console.error(`qa-staging: FALLA (${fallas.length})\n- ${fallas.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `qa-staging: OK (${RUTAS_VISIBLES.length} rutas visibles, ${RUTAS_OCULTAS.length} ocultas con 404, axe WCAG 2.2 AA y 2 flujos por el servidor)`,
);
