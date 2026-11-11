// QA de punta a punta del panel tal como se despliega en staging (issue #27): el build de producción servido con
// `next start` (o un staging ya desplegado), recorrido en un Chromium real. Tiene dos modos, según cómo se armó el build:
//
// - `apagado` (el de siempre, sin variables de Supabase: datos simulados, sin login). Corre al final de `npm run check`, después
//   de `next build` (como `verificar:pestanas-ocultas`):
//     docker compose -f compose.dev.yml run --rm -e NEXT_PUBLIC_MODO_DEV=0 app sh -c "npm run build && npm run qa:staging"
//
// - `activo` (con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`: login de coordinador y RPC reales, como el staging de
//   Vercel contra el Supabase de demo). Dos maneras de correrlo:
//     a) contra el staging desplegado:   QA_STAGING_URL=https://<el-staging> npm run qa:staging
//     b) contra un build local con la conexión puesta (solo la parte «sin sesión»; la URL puede ser una que no existe, porque
//        sin sesión no se le pregunta nada a Supabase):
//        NEXT_PUBLIC_SUPABASE_URL=https://sin-red.invalid NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_qa npm run build &&
//        QA_STAGING_MODO=activo npm run qa:staging
//
// Las cuentas de la demo y su contraseña NO están en el código ni en el repo (es público): se leen del entorno y se pasan por fuera.
//   QA_STAGING_CORREO / QA_STAGING_CONTRASENA                       una cuenta con el rol COORDINADOR vigente
//   QA_STAGING_CORREO_SIN_ACCESO / QA_STAGING_CONTRASENA_SIN_ACCESO (opcional) una cuenta que NO es coordinador
//   QA_STAGING_BUSQUEDA                                              (opcional) qué buscar en «Añadir colportor» (por defecto «ana»)
//   QA_STAGING_EXIGIR_LOGIN=1                                        falla si faltan las cuentas, en vez de avisar que se saltó esa parte
// Sin cuentas, el modo activo prueba solo lo que se ve sin sesión y lo dice al final: nunca da por probado lo que no se probó.
//
// Qué comprueba el modo apagado, ruta por ruta (1280 x 800, el mínimo que fija el shell):
//   - cada pestaña visible responde 200, tiene su título (h1), marca la pestaña activa en el menú y no se desborda;
//   - no hay errores de consola, excepciones de la página ni pedidos propios que fallen;
//   - ningún rastro del modo dev (chips ni panel «Estado de HU») y el menú no ofrece Stock ni Cuentas;
//   - Stock, Cuentas y sus subrutas responden 404 con el aviso del panel;
//   - /acceso no tiene nada que hacer sin login y vuelve a Inicio;
//   - axe-core (WCAG 2.2 AA) sin violaciones;
//   - los flujos que pasan por el servidor (server actions): elegir campaña en el topbar y buscar y añadir un colportor.
//
// Qué comprueba el modo activo:
//   - sin sesión: todas las rutas (también las ocultas y las que no existen) redirigen a /acceso y se acuerdan de adónde volver;
//     una llamada a una server action (o cualquier POST) sin sesión da 401 con la marca del motivo, no una página; /acceso
//     responde 200 sin el marco del panel, con su formulario, axe y los textos de cada motivo;
//   - con las cuentas: contraseña equivocada (aviso sin decir cuál campo falló), cuenta sin rol de coordinador (si hay), entrar
//     (vuelve a donde se iba), /acceso con sesión devuelve a Inicio, las mismas comprobaciones de cada pestaña con la sesión puesta
//     (y sin el aviso de «datos simulados»: con todo conectado no debe aparecer), Stock y Cuentas en 404, los dos flujos por el
//     servidor contra las RPC reales (añadir siempre se deshace: no queda nada escrito) y cerrar sesión desde el menú del avatar.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

import { chromium } from "@playwright/test";

const requerir = createRequire(import.meta.url);
const rutaAxe = requerir.resolve("axe-core/axe.min.js");

const PUERTO = 3198;
const VISTA = { width: 1280, height: 800 };

const URL_REMOTA = process.env.QA_STAGING_URL?.trim().replace(/\/+$/, "") || "";
const MODO = URL_REMOTA || process.env.QA_STAGING_MODO === "activo" ? "activo" : "apagado";
const base = URL_REMOTA || `http://127.0.0.1:${PUERTO}`;

const CUENTA = { correo: process.env.QA_STAGING_CORREO?.trim() ?? "", contrasena: process.env.QA_STAGING_CONTRASENA ?? "" };
const CUENTA_SIN_ACCESO = {
  correo: process.env.QA_STAGING_CORREO_SIN_ACCESO?.trim() ?? "",
  contrasena: process.env.QA_STAGING_CONTRASENA_SIN_ACCESO ?? "",
};
const BUSQUEDA = process.env.QA_STAGING_BUSQUEDA?.trim() || "ana";
const EXIGIR_LOGIN = process.env.QA_STAGING_EXIGIR_LOGIN === "1";
const SECRETOS = [CUENTA.contrasena, CUENTA_SIN_ACCESO.contrasena, CUENTA.correo, CUENTA_SIN_ACCESO.correo].filter((s) => s.length >= 4);

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
// Los textos de la pantalla de acceso (src/features/acceso/textos.ts): acá van literales porque el script no importa TypeScript.
const TEXTO_TITULO_ACCESO = "Iniciá sesión";
const TEXTO_CREDENCIALES = "El correo o la contraseña no son correctos.";
const TEXTO_SESION_VENCIDA = "Tu sesión venció.";
const TEXTO_SESION_CERRADA = "Cerraste sesión.";
const TEXTO_NO_DISPONIBLE_ACCESO = "El panel no está disponible en este momento.";
const TEXTO_SIN_ACCESO = "Sin acceso al panel";
const TEXTO_DATOS_SIMULADOS = /Versión de prueba con datos simulados/i;
const MARCA_DE_RECHAZO_VENCIDA = "panel-acceso:vencida";

const fallas = [];
const avisos = [];
const falla = (donde, texto) => fallas.push(`${donde}: ${texto}`);
const aviso = (texto) => avisos.push(texto);

const servidor = URL_REMOTA ? null : spawn("node_modules/.bin/next", ["start", "-p", String(PUERTO)], { stdio: "ignore" });
let navegador;

async function esperarServidor() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/${MODO === "activo" ? "acceso" : "inicio"}`)).ok) return;
    } catch {
      // todavía no escucha
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`el servidor no contestó en ${base}`);
}

/** Una página nueva con los vigías de errores puestos; `problemas` junta lo que pase mientras se la usa. */
async function paginaNueva(estado) {
  const contexto = await navegador.newContext({ viewport: VISTA, locale: "es-UY", ...(estado ? { storageState: estado } : {}) });
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

async function recorrerVisible({ ruta, pestana }, estado) {
  const donde = estado ? `${ruta} (con sesión)` : ruta;
  const { pagina, problemas, contexto } = await paginaNueva(estado);
  try {
    const respuesta = await pagina.goto(`${base}${ruta}`, { waitUntil: "load" });
    await reposar(pagina);
    if (respuesta?.status() !== 200 || new URL(pagina.url()).pathname !== ruta) {
      falla(donde, `respondió ${respuesta?.status()} y quedó en ${new URL(pagina.url()).pathname} (se esperaba 200 en ${ruta})`);
    }

    const titulos = await pagina.locator("h1").allTextContents();
    if (titulos.length !== 1 || !titulos[0].trim()) falla(donde, `debería tener un h1 con texto y tiene ${JSON.stringify(titulos)}`);

    const menu = await pagina.locator('nav[aria-label="Secciones del panel"] a').allTextContents();
    if (JSON.stringify(menu.map((t) => t.trim())) !== JSON.stringify(PESTANAS_VISIBLES)) {
      falla(donde, `el menú debería ofrecer ${PESTANAS_VISIBLES.join(", ")} y ofrece ${menu.join(", ")}`);
    }
    const activas = await pagina.locator('nav[aria-label="Secciones del panel"] a[aria-current="page"]').allTextContents();
    if (activas.length !== 1 || activas[0].trim() !== pestana) falla(donde, `la pestaña activa debería ser ${pestana} y es ${JSON.stringify(activas)}`);

    const texto = await pagina.evaluate(() => document.body.innerText);
    if (/Estado de HU/i.test(texto) || /\bHU-[A-Z]{3,4}-\d{3}\b/.test(texto)) falla(donde, "se ve el modo dev (chips o panel de estado de HU)");
    if (await pagina.locator('[data-testid^="estado-pestana"]').count()) falla(donde, "el menú muestra el estado de HU del modo dev");
    if (MODO === "activo") {
      if (TEXTO_DATOS_SIMULADOS.test(texto)) falla(donde, "con la conexión puesta se ve el aviso de «datos simulados»: alguna pestaña sigue en la fuente simulada");
      if (!(await pagina.getByRole("button", { name: /^Cuenta: / }).count())) falla(donde, "el topbar no muestra el menú de la cuenta (el avatar)");
    }

    const desborde = await pagina.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (desborde > 0) falla(donde, `la página se desborda ${desborde}px a lo ancho a 1280 px`);

    await auditarAccesibilidad(pagina, donde);
    for (const p of problemas) falla(donde, p);
  } finally {
    await contexto.close();
  }
}

async function recorrerOculta(ruta, estado) {
  const donde = estado ? `${ruta} (con sesión)` : ruta;
  const { pagina, problemas, contexto } = await paginaNueva(estado);
  try {
    const respuesta = await pagina.goto(`${base}${ruta}`, { waitUntil: "load" });
    await reposar(pagina);
    if (respuesta?.status() !== 404) falla(donde, `respondió ${respuesta?.status()} (se esperaba 404)`);
    if (!(await pagina.getByText(TEXTO_NO_DISPONIBLE).count())) falla(donde, `el 404 no muestra «${TEXTO_NO_DISPONIBLE}»`);
    const vuelta = pagina.getByRole("link", { name: "Ir a Inicio" });
    if (!(await vuelta.count())) falla(donde, "el 404 no ofrece volver a Inicio");
    await auditarAccesibilidad(pagina, donde);
    // El 404 es la respuesta esperada: lo único que no debería haber son errores de consola o excepciones.
    for (const p of problemas) if (!p.includes("404")) falla(donde, p);
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
    // Sin login (modo apagado) la pantalla de acceso no tiene nada que hacer: vuelve a Inicio.
    await pagina.goto(`${base}/acceso`, { waitUntil: "load" });
    if (new URL(pagina.url()).pathname !== "/inicio") falla("/acceso", `sin login debería volver a /inicio y quedó en ${new URL(pagina.url()).pathname}`);
  } finally {
    await contexto.close();
  }
}

/** Topbar → selector de campaña: la lista sale de una server action; elegir otra cambia el botón y se avisa. */
async function flujoElegirCampania(estado) {
  const donde = "flujo: elegir campaña";
  const { pagina, problemas, contexto } = await paginaNueva(estado);
  try {
    await pagina.goto(`${base}/inicio`, { waitUntil: "load" });
    await reposar(pagina);
    const boton = pagina.locator('button[aria-haspopup="listbox"]');
    await boton.click();
    const lista = pagina.getByRole("listbox", { name: "Campañas" });
    await lista.waitFor({ timeout: 10_000 });
    const opciones = await lista.getByRole("option").count();
    // Los datos simulados traen varias campañas; la base de demo puede tener una sola.
    const minimo = MODO === "apagado" ? 2 : 1;
    if (opciones < minimo) falla(donde, `la lista debería traer las campañas y trae ${opciones}`);

    await pagina.keyboard.press("Escape");
    if (await lista.count()) falla(donde, "Esc no cerró la lista");
    if (!(await boton.evaluate((b) => b === document.activeElement))) falla(donde, "Esc no devolvió el foco al botón");

    if (opciones >= 2) {
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
    } else {
      aviso("elegir campaña: la cuenta ve una sola campaña, no se probó el cambio de campaña");
    }
    await reposar(pagina);
    for (const p of problemas) falla(donde, p);
  } finally {
    await contexto.close();
  }
}

/**
 * Equipo → Añadir colportor: buscar y añadir van por server actions del build de producción; Deshacer lo devuelve. El alta se
 * demora 8 s justamente para eso: deshacer enseguida deja la base como estaba, también contra el Supabase de demo. Una cuenta de
 * coordinación o administración pide confirmar antes (diálogo): se cancela y se prueba con la siguiente.
 */
async function flujoAnadirColportor(estado) {
  const donde = "flujo: añadir colportor";
  const { pagina, problemas, contexto } = await paginaNueva(estado);
  try {
    await pagina.goto(`${base}/equipo/anadir`, { waitUntil: "load" });
    await reposar(pagina);
    const buscador = pagina.getByRole("textbox", { name: "Buscar por email o nombre" });
    await buscador.fill(BUSQUEDA);
    const filas = pagina.getByRole("button", { name: /^Añadir a / });
    await filas.first().waitFor({ timeout: 15_000 }).catch(() => {
      falla(donde, `buscar «${BUSQUEDA}» no trajo ninguna cuenta para añadir${MODO === "activo" ? " (QA_STAGING_BUSQUEDA cambia la búsqueda)" : ""}`);
    });
    const cuantas = Math.min(await filas.count(), 5);
    let deshecho = false;
    for (let i = 0; i < cuantas && !deshecho; i++) {
      const fila = filas.nth(i);
      const nombre = ((await fila.getAttribute("aria-label")) ?? "").replace("Añadir a ", "");
      await fila.click();
      const deshacer = pagina.getByRole("button", { name: `Deshacer: ${nombre}` });
      const dialogo = pagina.getByRole("alertdialog");
      await Promise.race([deshacer.waitFor({ timeout: 10_000 }), dialogo.waitFor({ timeout: 10_000 })]).catch(() => {
        falla(donde, `«Añadir a ${nombre}» no mostró ni el aviso con «Deshacer» ni el diálogo de confirmación`);
      });
      if (await dialogo.count()) {
        await dialogo.getByRole("button", { name: "Cancelar" }).click();
        continue;
      }
      if (!(await deshacer.count())) break;
      await deshacer.click();
      await deshacer.waitFor({ state: "detached", timeout: 10_000 }).catch(() => falla(donde, "«Deshacer» no quitó el aviso"));
      deshecho = true;
    }
    if (!deshecho && cuantas > 0 && !fallas.some((f) => f.startsWith(donde))) falla(donde, "ninguna de las primeras cuentas se pudo añadir y deshacer");
    await reposar(pagina);
    for (const p of problemas) falla(donde, p);
  } finally {
    await contexto.close();
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Modo activo

/** Un pedido sin seguir redirecciones, para ver qué contesta el proxy y no la página a la que lleva. */
async function pedir(ruta, opciones = {}) {
  return fetch(`${base}${ruta}`, { redirect: "manual", ...opciones });
}

/** Sin sesión, el proxy manda a /acceso antes de renderizar nada: tampoco se enteran las rutas ocultas ni las que no existen. */
async function guardaSinSesion() {
  const rutas = ["/", ...RUTAS_VISIBLES.map((r) => r.ruta), ...RUTAS_OCULTAS, "/esto-no-existe"];
  for (const ruta of rutas) {
    const respuesta = await pedir(ruta);
    const destino = respuesta.headers.get("location");
    if (![302, 303, 307, 308].includes(respuesta.status) || !destino) {
      falla(`guarda: ${ruta}`, `sin sesión respondió ${respuesta.status} (se esperaba una redirección a /acceso)`);
      continue;
    }
    const url = new URL(destino, base);
    if (url.origin !== new URL(base).origin || url.pathname !== "/acceso") {
      falla(`guarda: ${ruta}`, `sin sesión redirige a ${url.origin}${url.pathname} (se esperaba /acceso)`);
      continue;
    }
    if (ruta !== "/" && ruta !== "/inicio" && url.searchParams.get("siguiente") !== ruta) {
      falla(`guarda: ${ruta}`, `la redirección no recuerda adónde volver (siguiente=${url.searchParams.get("siguiente")})`);
    }
    if (url.searchParams.has("motivo")) falla(`guarda: ${ruta}`, `sin sesión no es un caso con motivo y llegó ${url.searchParams.get("motivo")}`);
  }
}

/** Una server action (o cualquier POST) sin sesión: 401 con la marca del motivo, que es lo que la pantalla abierta sabe leer. */
async function rechazoDeAccionesSinSesion() {
  const cabecerasDeAccion = { "next-action": "0000000000000000000000000000000000000000aa", "content-type": "text/plain;charset=UTF-8", accept: "text/x-component" };
  const intentos = [
    { donde: "server action en /equipo/anadir", ruta: "/equipo/anadir", init: { method: "POST", headers: cabecerasDeAccion, body: "[]" } },
    { donde: "server action en /inicio", ruta: "/inicio", init: { method: "POST", headers: cabecerasDeAccion, body: "[]" } },
    { donde: "POST común en /equipo", ruta: "/equipo", init: { method: "POST", headers: { "content-type": "text/plain" }, body: "x" } },
  ];
  for (const { donde, ruta, init } of intentos) {
    const respuesta = await pedir(ruta, init);
    const texto = await respuesta.text();
    const tipo = respuesta.headers.get("content-type") ?? "";
    if (respuesta.status !== 401) {
      falla(`401 sin sesión: ${donde}`, `respondió ${respuesta.status} (se esperaba 401)`);
      continue;
    }
    if (!tipo.startsWith("text/plain")) falla(`401 sin sesión: ${donde}`, `el tipo es «${tipo}» y tiene que ser text/plain, o Next no deja pasar la marca`);
    if (texto !== MARCA_DE_RECHAZO_VENCIDA) falla(`401 sin sesión: ${donde}`, `la marca del rechazo es «${texto.slice(0, 60)}» y se esperaba «${MARCA_DE_RECHAZO_VENCIDA}»`);
    if (!/no-store/.test(respuesta.headers.get("cache-control") ?? "")) falla(`401 sin sesión: ${donde}`, "el rechazo no lleva Cache-Control: no-store");
  }
}

async function auditarPantallaDeAcceso(pagina, donde) {
  await reposar(pagina);
  const titulos = await pagina.locator("h1").allTextContents();
  if (titulos.length !== 1 || !titulos[0].trim()) falla(donde, `debería tener un h1 con texto y tiene ${JSON.stringify(titulos)}`);
  if (await pagina.locator('nav[aria-label="Secciones del panel"]').count()) falla(donde, "la pantalla de acceso lleva el marco del panel (menú de pestañas)");
  if (await pagina.getByRole("button", { name: /^Cuenta: / }).count()) falla(donde, "la pantalla de acceso muestra el menú de una cuenta sin sesión");
  const desborde = await pagina.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (desborde > 0) falla(donde, `la página se desborda ${desborde}px a lo ancho a 1280 px`);
  await auditarAccesibilidad(pagina, donde);
}

/** La pantalla de acceso tal como la ve quien llega sin sesión, y cada motivo con su texto (vista 38). */
async function pantallaDeAcceso() {
  const donde = "/acceso";
  const { pagina, problemas, contexto } = await paginaNueva();
  try {
    const respuesta = await pagina.goto(`${base}/acceso`, { waitUntil: "load" });
    if (respuesta?.status() !== 200) falla(donde, `respondió ${respuesta?.status()} (se esperaba 200)`);
    await auditarPantallaDeAcceso(pagina, donde);
    if ((await pagina.locator("h1").first().textContent())?.trim() !== TEXTO_TITULO_ACCESO) falla(donde, `el título debería ser «${TEXTO_TITULO_ACCESO}»`);
    if (!(await pagina.getByLabel("CORREO").count()) || !(await pagina.getByLabel("CONTRASEÑA").count())) falla(donde, "faltan los campos de correo y contraseña");
    const entrar = pagina.getByRole("button", { name: "Entrar" });
    if ((await entrar.getAttribute("aria-disabled")) !== "true") falla(donde, "«Entrar» debería estar apagado con los campos vacíos");

    // Un destino que no es del panel no se sigue: la pantalla se muestra igual y no hay nada que lleve a otro sitio.
    await pagina.goto(`${base}/acceso?siguiente=//sitio.malo`, { waitUntil: "load" });
    if (new URL(pagina.url()).origin !== new URL(base).origin) falla(donde, "un ?siguiente=//… sacó la pantalla del panel");

    for (const [motivo, texto] of [
      ["vencida", TEXTO_SESION_VENCIDA],
      ["cerrada", TEXTO_SESION_CERRADA],
      ["no-disponible", TEXTO_NO_DISPONIBLE_ACCESO],
    ]) {
      await pagina.goto(`${base}/acceso?motivo=${motivo}`, { waitUntil: "load" });
      await reposar(pagina);
      if (new URL(pagina.url()).pathname !== "/acceso") falla(`${donde}?motivo=${motivo}`, `no se quedó en /acceso (${new URL(pagina.url()).pathname})`);
      if (!(await pagina.getByText(texto).count())) falla(`${donde}?motivo=${motivo}`, `no muestra «${texto}»`);
      await auditarAccesibilidad(pagina, `${donde}?motivo=${motivo}`);
    }
    for (const p of problemas) falla(donde, p);
  } finally {
    await contexto.close();
  }
}

/** Quien abre una pantalla del panel sin sesión llega a /acceso, con el destino recordado y sin errores. */
async function llegadaSinSesion() {
  const donde = "/equipo/anadir sin sesión";
  const { pagina, problemas, contexto } = await paginaNueva();
  try {
    const respuesta = await pagina.goto(`${base}/equipo/anadir`, { waitUntil: "load" });
    if (respuesta?.status() !== 200) falla(donde, `terminó en ${respuesta?.status()} (se esperaba la pantalla de acceso con 200)`);
    const url = new URL(pagina.url());
    if (url.pathname !== "/acceso" || url.searchParams.get("siguiente") !== "/equipo/anadir") {
      falla(donde, `debería quedar en /acceso?siguiente=/equipo/anadir y quedó en ${url.pathname}${url.search}`);
    }
    await auditarPantallaDeAcceso(pagina, donde);
    for (const p of problemas) if (!p.includes("307")) falla(donde, p);
  } finally {
    await contexto.close();
  }
}

/** Escribe las credenciales en la pantalla de acceso y toca «Entrar». */
async function entrarCon(pagina, cuenta) {
  await pagina.getByLabel("CORREO").fill(cuenta.correo);
  await pagina.getByLabel("CONTRASEÑA").fill(cuenta.contrasena);
  await pagina.getByRole("button", { name: "Entrar" }).click();
}

/** Contraseña equivocada: un aviso que no dice cuál de los dos falló, la pantalla sigue ahí y el botón vuelve a servir. */
async function entrarConClaveEquivocada() {
  const donde = "acceso: contraseña equivocada";
  const { pagina, problemas, contexto } = await paginaNueva();
  try {
    await pagina.goto(`${base}/acceso`, { waitUntil: "load" });
    await reposar(pagina);
    // Larga y sin relación con ninguna cuenta; no se prueba la contraseña real con un cambio, solo una que no puede ser.
    await entrarCon(pagina, { correo: CUENTA.correo, contrasena: "qa-staging-clave-que-no-es-0000" });
    const cartel = pagina.getByText(TEXTO_CREDENCIALES);
    await cartel.waitFor({ timeout: 20_000 }).catch(() => {
      falla(donde, `no apareció «${TEXTO_CREDENCIALES}» (la pantalla quedó en ${new URL(pagina.url()).pathname})`);
    });
    if (new URL(pagina.url()).pathname !== "/acceso") falla(donde, "con una contraseña equivocada salió de la pantalla de acceso");
    if (!(await pagina.getByLabel("CORREO").isEnabled())) falla(donde, "tras el error los campos quedaron apagados");
    await auditarAccesibilidad(pagina, donde);
    // 401 de Supabase Auth a la consola es lo esperado; el resto de los problemas, no.
    for (const p of problemas) if (!/40[01]/.test(p)) falla(donde, p);
  } finally {
    await contexto.close();
  }
}

/** Entra con una cuenta que no es de coordinador: «Sin acceso al panel», con la cuenta nombrada y sin sesión que sirva. */
async function entrarSinRolDeCoordinador() {
  const donde = "acceso: cuenta sin rol de coordinador";
  const { pagina, problemas, contexto } = await paginaNueva();
  try {
    await pagina.goto(`${base}/acceso`, { waitUntil: "load" });
    await reposar(pagina);
    await entrarCon(pagina, CUENTA_SIN_ACCESO);
    await pagina.getByRole("heading", { name: TEXTO_SIN_ACCESO }).waitFor({ timeout: 20_000 }).catch(() => {
      falla(donde, `no apareció «${TEXTO_SIN_ACCESO}» (la pantalla quedó en ${new URL(pagina.url()).pathname})`);
    });
    if (!(await pagina.getByText(/no tiene el rol de coordinador vigente/).count())) falla(donde, "el aviso no dice que la cuenta no tiene el rol de coordinador");
    const respuesta = await pagina.goto(`${base}/inicio`, { waitUntil: "load" });
    if (new URL(pagina.url()).pathname === "/inicio" && respuesta?.status() === 200) falla(donde, "una cuenta sin el rol entró a Inicio");
    for (const p of problemas) if (!/40[01]/.test(p)) falla(donde, p);
  } finally {
    await contexto.close();
  }
}

/** Entra con la cuenta de coordinador, vuelve a donde se iba y deja la sesión para el resto del recorrido. */
async function entrarYGuardarSesion() {
  const donde = "acceso: entrar";
  const { pagina, problemas, contexto } = await paginaNueva();
  try {
    await pagina.goto(`${base}/acceso?siguiente=%2Fequipo`, { waitUntil: "load" });
    await reposar(pagina);
    await entrarCon(pagina, CUENTA);
    await pagina.waitForURL((u) => u.pathname !== "/acceso", { timeout: 30_000 }).catch(() => {
      falla(donde, `con las credenciales de la demo la pantalla no avanzó (quedó en ${new URL(pagina.url()).pathname}${new URL(pagina.url()).search})`);
    });
    if (new URL(pagina.url()).pathname !== "/equipo") {
      falla(donde, `debería volver a /equipo (el ?siguiente=) y quedó en ${new URL(pagina.url()).pathname}`);
      return null;
    }
    await reposar(pagina);

    // Con sesión, la pantalla de acceso sin motivo no tiene nada que hacer: manda al destino.
    await pagina.goto(`${base}/acceso`, { waitUntil: "load" });
    if (new URL(pagina.url()).pathname !== "/inicio") falla(donde, `con sesión, /acceso debería llevar a /inicio y quedó en ${new URL(pagina.url()).pathname}`);
    // Y un destino que no es del panel no es adónde volver.
    await pagina.goto(`${base}/acceso?siguiente=//sitio.malo`, { waitUntil: "load" });
    if (new URL(pagina.url()).origin !== new URL(base).origin) falla(donde, "con sesión, ?siguiente=//… sacó la persona del panel");

    for (const p of problemas) falla(donde, p);
    return await contexto.storageState();
  } finally {
    await contexto.close();
  }
}

/** Cerrar sesión desde el avatar: vuelve a /acceso con «Cerraste sesión.» y las pantallas dejan de abrirse. */
async function cerrarSesionDesdeElMenu(estado) {
  const donde = "acceso: cerrar sesión";
  const { pagina, problemas, contexto } = await paginaNueva(estado);
  try {
    await pagina.goto(`${base}/inicio`, { waitUntil: "load" });
    await reposar(pagina);
    await pagina.getByRole("button", { name: /^Cuenta: / }).click();
    await pagina.getByRole("menuitem", { name: "Cerrar sesión" }).click();
    await pagina.waitForURL((u) => u.pathname === "/acceso", { timeout: 30_000 }).catch(() => falla(donde, `no volvió a /acceso (quedó en ${new URL(pagina.url()).pathname})`));
    if (!(await pagina.getByText(TEXTO_SESION_CERRADA).count())) falla(donde, `la pantalla no dice «${TEXTO_SESION_CERRADA}»`);
    await pagina.goto(`${base}/inicio`, { waitUntil: "load" });
    if (new URL(pagina.url()).pathname !== "/acceso") falla(donde, `tras cerrar sesión /inicio debería mandar a /acceso y quedó en ${new URL(pagina.url()).pathname}`);
    for (const p of problemas) falla(donde, p);
  } finally {
    await contexto.close();
  }
}

async function recorrerActivoSinSesion() {
  await guardaSinSesion();
  await rechazoDeAccionesSinSesion();
  await pantallaDeAcceso();
  await llegadaSinSesion();
}

async function recorrerActivoConSesion() {
  if (!CUENTA.correo || !CUENTA.contrasena) {
    const mensaje = "falta QA_STAGING_CORREO / QA_STAGING_CONTRASENA (una cuenta con rol COORDINADOR): no se probó el login ni nada con sesión";
    if (EXIGIR_LOGIN) falla("login", mensaje);
    else aviso(mensaje);
    return;
  }
  await entrarConClaveEquivocada();
  const estado = await entrarYGuardarSesion();
  if (!estado) return;
  for (const r of RUTAS_VISIBLES) await recorrerVisible(r, estado);
  for (const r of RUTAS_OCULTAS) await recorrerOculta(r, estado);
  await flujoElegirCampania(estado);
  await flujoAnadirColportor(estado);
  await cerrarSesionDesdeElMenu(estado);

  if (CUENTA_SIN_ACCESO.correo && CUENTA_SIN_ACCESO.contrasena) await entrarSinRolDeCoordinador();
  else aviso("falta QA_STAGING_CORREO_SIN_ACCESO / QA_STAGING_CONTRASENA_SIN_ACCESO: no se probó la cuenta sin rol de coordinador");
}

try {
  await esperarServidor();
  navegador = await chromium.launch();
  if (MODO === "apagado") {
    for (const r of RUTAS_VISIBLES) await recorrerVisible(r);
    for (const r of RUTAS_OCULTAS) await recorrerOculta(r);
    await recorrerRaizYDesconocida();
    await flujoElegirCampania();
    await flujoAnadirColportor();
  } else {
    await recorrerActivoSinSesion();
    await recorrerActivoConSesion();
  }
} catch (error) {
  falla("qa-staging", `se cortó: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await navegador?.close();
  servidor?.kill();
}

/** Nada de lo que imprime el script puede llevar una contraseña ni un correo de la demo (los logs de CI son públicos). */
const sinSecretos = (texto) => SECRETOS.reduce((t, s) => t.split(s).join("«credencial»"), texto);

for (const a of avisos) console.warn(sinSecretos(`qa-staging: AVISO ${a}`));
if (fallas.length > 0) {
  console.error(sinSecretos(`qa-staging (${MODO}): FALLA (${fallas.length})\n- ${fallas.join("\n- ")}`));
  process.exit(1);
}
console.log(
  MODO === "apagado"
    ? `qa-staging: OK (${RUTAS_VISIBLES.length} rutas visibles, ${RUTAS_OCULTAS.length} ocultas con 404, /acceso sin login, axe WCAG 2.2 AA y 2 flujos por el servidor)`
    : `qa-staging (activo, ${URL_REMOTA ? "staging desplegado" : "build local"}): OK (guarda sin sesión, 401 de las server actions, pantalla de acceso con axe${
        avisos.length ? ", SIN la parte con sesión: ver los avisos" : ", login, recorrido de cada pestaña con sesión, 2 flujos por el servidor y cerrar sesión"
      })`,
);
