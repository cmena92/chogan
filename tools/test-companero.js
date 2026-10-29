#!/usr/bin/env node
// Tests of Capybara's companion (epic #2). They live apart from tools/test.js on purpose:
// upstream changes that file almost every day, and every line of ours in it would conflict on
// each update. The coins are the core's own code, run from www/lib/chogan.js, as upstream's
// test does.
// Usage: node tools/test-companero.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let checks = 0, fails = 0;
function head(t) { console.log('\n' + t); }
function ok(cond, msg) {
  checks++;
  if (cond) console.log('  ✓ ' + msg);
  else { fails++; console.log('  ✗ ' + msg); }
}

/* ------------------------------------------------ helpers */

const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
const coinSrc = (core.match(/(?:  function isPrice[^\n]*\n)?  var coinsApi = \{[\s\S]*?\n  \};/) || [])[0];

// The core's coin API over a balance, with add() forbidden: the companion never pays out
function monedas(saldo) {
  const box = {
    saved: {}, state: { coins: saldo },
    appStore: { get(k, d) { return k in box.saved ? box.saved[k] : d; }, set(k, v) { box.saved[k] = v; } },
    mutate() {}, bump() {},
    Chogan: { achievements: { check() {} }, ui: { refreshCoins() {}, coinFly() {} } },
  };
  vm.createContext(box);
  vm.runInContext(coinSrc + '\nthis.api = coinsApi; coinsApi.add = function () { throw new Error("the companion must never add coins"); };', box);
  return { api: box.api, saldo: () => box.state.coins };
}

// A store like Chogan.storage(id): get(key, def) and set(key, value), recording the keys written
function almacen(inicial) {
  const datos = Object.assign({}, inicial), escritas = [];
  return {
    get(k, d) { return k in datos ? JSON.parse(JSON.stringify(datos[k])) : (d === undefined ? null : d); },
    set(k, v) { escritas.push(k); datos[k] = JSON.parse(JSON.stringify(v)); return v; },
    datos, escritas,
  };
}

function congelado(o) {
  Object.freeze(o);
  Object.values(o).forEach((v) => { if (v && typeof v === 'object') congelado(v); });
  return o;
}

const ECON = path.join(ROOT, 'www/games/companero/economia.js');
const E = fs.existsSync(ECON) ? require(ECON) : null;

function nuevo(o) {
  o = o || {};
  const m = monedas(o.saldo === undefined ? 1000 : o.saldo);
  const s = almacen(o.datos);
  let t = 1000;
  const nucleo = congelado(o.nucleo || { unlocks: [], mascot: 'fox' });
  const eco = E.crear({ store: s, coins: m.api, nucleo: () => nucleo, ahora: () => t });
  return { eco, m, s, nucleo, avanzar(ms) { t += ms; } };
}

/* ------------------------------------------------ tests */

function testModulo() {
  head('El módulo existe y carga sin navegador');
  ok(!!coinSrc, 'el código de las monedas del núcleo se encuentra');
  ok(!!E && typeof E.crear === 'function', 'www/games/companero/economia.js exporta crear()');
}

function testCatalogo() {
  head('Catálogo');
  if (!E) return ok(false, 'sin módulo no hay catálogo');
  const c = E.CATALOGO;
  const precio = (id) => (c.find((a) => a.id === id) || {}).precio;
  ok(E.VERSION === 1, 'el catálogo tiene versión');
  ok(precio('capybara') === 0 && precio('conejo') === 180 && precio('panda') === 260 && precio('nutria') === 340, 'animales nuevos con los precios de #6');
  ok(precio('fruta') === 5 && precio('zanahoria') === 8 && precio('pastel') === 15 && precio('jabon') === 10, 'consumibles con los precios de #9');
  ok(['gorra', 'corona', 'lentes', 'lazo', 'panuelo', 'sueter', 'capa'].every((id) => precio(id) > 0), 'las siete prendas de #16 están a la venta');
  // a single source: the design prices of the art (#17) and the catalogue agree
  const disenos = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/companero/disenos.json'), 'utf8')).disenos;
  ok(disenos.every((d) => precio(d.id) === d.precio), 'los diseños cuestan lo mismo que en design/companero/disenos.json');
  ok(new Set(c.map((a) => a.id)).size === c.length, 'ningún id se repite');
  ok(!c.some((a) => ['fox', 'owl', 'cat', 'bear'].includes(a.id)), 'los cuatro personajes del núcleo no se venden en el compañero');
}

function testCompra() {
  head('Compra y recompra');
  if (!E) return ok(false, 'sin módulo');
  const { eco, m } = nuevo({ saldo: 500 });
  const r = eco.comprar('conejo');
  ok(r.ok && m.saldo() === 320 && eco.poseido('conejo'), 'una compra descuenta 180 una vez y entrega el conejo');
  const r2 = eco.comprar('conejo');
  ok(r2.ok && r2.yaTenia && m.saldo() === 320, 'recomprar un permanente no cobra y dice que ya lo tenía');
  const r3 = eco.comprar('nutria');
  ok(!r3.ok && r3.motivo === 'saldo' && m.saldo() === 320 && !eco.poseido('nutria'), 'sin saldo suficiente no cambia nada');
  ok(eco.poseido('capybara') && eco.poseido('natural'), 'el capibara y el diseño natural son de todos, gratis');
  ok(!eco.comprar('dragon').ok, 'un artículo desconocido no se compra');
  ok(eco.comprar('fox').motivo === 'nucleo', 'los personajes del núcleo se compran en su tienda, no aquí');
}

function testConsumibles() {
  head('Consumibles');
  if (!E) return ok(false, 'sin módulo');
  const x = nuevo({ saldo: 100 });
  x.eco.comprar('fruta'); x.avanzar(500); x.eco.comprar('fruta');
  ok(x.eco.cantidad('fruta') === 2 && x.m.saldo() === 90, 'dos frutas: cantidad 2 y 10 monedas menos');
  ok(x.eco.usar('fruta').ok && x.eco.cantidad('fruta') === 1, 'usar una resta una');
  x.eco.usar('fruta');
  ok(!x.eco.usar('fruta').ok && x.eco.cantidad('fruta') === 0, 'sin unidades no se usa y nunca queda negativo');
}

function testDobleToque() {
  head('Doble toque');
  if (!E) return ok(false, 'sin módulo');
  const x = nuevo({ saldo: 100 });
  x.eco.comprar('pastel'); x.avanzar(120);
  const r = x.eco.comprar('pastel');
  ok(!r.ok && r.motivo === 'doble' && x.m.saldo() === 85 && x.eco.cantidad('pastel') === 1, 'una segunda compra en menos de 400 ms no cobra');
  x.avanzar(400);
  ok(x.eco.comprar('pastel').ok && x.m.saldo() === 70, 'pasados 400 ms, la compra vuelve a valer');
}

function testNucleo() {
  head('Estado del núcleo, solo lectura');
  if (!E) return ok(false, 'sin módulo');
  const nucleo = { unlocks: ['mascot.owl', 'palette.sea'], mascot: 'owl' };
  const antes = JSON.stringify(nucleo);
  const x = nuevo({ nucleo });
  ok(x.eco.poseido('fox') && x.eco.poseido('owl') && !x.eco.poseido('cat'), 'zorro siempre; búho porque el núcleo lo tiene; gato no');
  ok(x.eco.equipado().animal === 'owl', 'la primera vez, el animal equipado es el personaje elegido en el núcleo');
  x.eco.comprar('conejo'); x.eco.equipar('conejo');
  ok(JSON.stringify(x.nucleo) === antes, 'el estado del núcleo (unlocks, personaje) queda idéntico');
}

function testEquipar() {
  head('Equipar');
  if (!E) return ok(false, 'sin módulo');
  const x = nuevo({ saldo: 1000 });
  ok(!x.eco.equipar('corona').ok, 'no se equipa lo que no se tiene');
  x.eco.comprar('corona'); x.avanzar(500); x.eco.comprar('gorra');
  x.eco.equipar('corona'); x.eco.equipar('gorra');
  ok(x.eco.equipado().prendas.cabeza === 'gorra', 'una prenda por espacio: la gorra reemplaza a la corona');
  x.eco.quitar('cabeza');
  ok(!x.eco.equipado().prendas.cabeza, 'quitar deja el espacio vacío, sin costo');
  ok(x.m.saldo() === 1000 - 220 - 90, 'equipar y quitar nunca cobran');
}

function testMigracion() {
  head('Datos guardados');
  if (!E) return ok(false, 'sin módulo');
  for (const malo of [{ version: 99, permanentes: ['dorado'] }, 'basura', { version: 1, permanentes: 'no-es-lista', consumibles: null }]) {
    const x = nuevo({ saldo: 50, datos: { inventario: malo } });
    ok(x.m.saldo() === 50 && !x.eco.poseido('dorado') && x.eco.cantidad('fruta') === 0, 'datos inválidos (' + JSON.stringify(malo).slice(0, 30) + ') vuelven a los valores por defecto sin tocar el saldo');
  }
  const a = nuevo({ saldo: 300 });
  a.eco.comprar('lazo'); a.avanzar(500); a.eco.comprar('fruta'); a.eco.equipar('lazo');
  const b = E.crear({ store: a.s, coins: a.m.api, nucleo: () => a.nucleo, ahora: () => 9e9 });
  ok(b.poseido('lazo') && b.cantidad('fruta') === 1 && b.equipado().prendas.cuello === 'lazo', 'lo comprado y lo equipado se recupera al recargar');
  ok(a.s.escritas.length > 0 && a.s.escritas.every((k) => k === 'inventario'), 'el módulo escribe solo su clave «inventario» en el almacenamiento que recibe');
  ok(/var NS = 'chogan';/.test(core) && /var pre = NS \+ '\.' \+ id \+ '\.';/.test(core), 'con Chogan.storage("companero"), esa clave queda bajo el prefijo chogan.companero.');
  const mov = a.s.datos.inventario.movimientos;
  ok(Array.isArray(mov) && mov.length === 2 && mov.every((x) => x.tipo && x.item && x.cantidad && x.fecha) && !JSON.stringify(mov).match(/@|nombre|email/), 'los movimientos guardan tipo, artículo, cantidad y fecha, sin datos personales');
}

/* ------------------------------------------------ the space «Mi compañero» (#5) */

const PAGINA = path.join(ROOT, 'www/games/companero/index.html');
const ARTE = path.join(ROOT, 'www/games/companero/arte.js');
const entradas = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'www/games.json'), 'utf8')).games;

function testEntrada() {
  head('La entrada del compañero en games.json');
  const g = entradas().find((x) => x.id === 'companero');
  ok(!!g, 'games.json tiene la entrada companero');
  if (!g) return;
  ok(g.cat === 'skill', 'está en Habilidad, la categoría que eligió el responsable');
  ok(g.path === 'games/companero/index.html' && fs.existsSync(PAGINA), 'su página existe');
  ok(fs.existsSync(path.join(ROOT, 'www', g.icon)), 'su ícono existe');
  ok(['fa', 'en', 'zh', 'de', 'es'].every((l) => g.name[l] && g.summary[l]), 'nombre y resumen en los cinco idiomas');
  ok(['games/companero/economia.js', 'games/companero/arte.js'].every((f) => g.files.includes(f) && fs.existsSync(path.join(ROOT, 'www', f))), 'files lista economia.js y arte.js, y existen: el service worker los guarda');
  const html = fs.existsSync(PAGINA) ? fs.readFileSync(PAGINA, 'utf8') : '';
  ok(['fa', 'en', 'zh', 'de', 'es'].every((l) => html.includes(JSON.stringify(g.name[l]).slice(1, -1))), 'la página usa el mismo nombre que games.json en cada idioma');
}

function testArte() {
  head('El arte que dibuja la app coincide con design/');
  const A = fs.existsSync(ARTE) ? require(ARTE) : null;
  ok(!!A && !!A.cuerpos, 'arte.js exporta los cuerpos');
  if (!A) return;
  const dir = path.join(ROOT, 'design/companero/cuerpos');
  const ids = fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4));
  ok(ids.length === 8 && ids.every((id) => A.cuerpos[id] === fs.readFileSync(path.join(dir, id + '.svg'), 'utf8')), 'los ocho cuerpos son idénticos a design/companero/cuerpos/ (si no, correr design/companero/exportar.mjs)');
}

// Chrome driven over its DevTools protocol, with Node's own fetch and WebSocket: no dependency
async function navegador(fn) {
  const { spawn } = require('child_process');
  const os = require('os');
  const binario = process.env.CHROME || ['google-chrome', 'chromium', 'chromium-browser'].find((c) => require('child_process').spawnSync('sh', ['-c', 'command -v ' + c]).status === 0);
  if (!binario) throw new Error('Chrome or Chromium not found; set CHROME');
  const puerto = 8900 + Math.floor(Math.random() * 400);
  const servidor = spawn('python3', ['-m', 'http.server', String(puerto), '-d', path.join(ROOT, 'www'), '--bind', '127.0.0.1'], { stdio: 'ignore' });
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'companero-'));
  const chrome = spawn(binario, ['--headless=new', '--no-sandbox', '--remote-debugging-port=' + (puerto + 1000), '--user-data-dir=' + perfil, 'about:blank'], { stdio: 'ignore' });
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    let lista = null;
    for (let i = 0; i < 60 && !lista; i++) {
      try { lista = await (await fetch('http://127.0.0.1:' + (puerto + 1000) + '/json/list')).json(); } catch (e) { await espera(200); }
    }
    for (let i = 0; i < 30; i++) {
      try { await fetch('http://127.0.0.1:' + puerto + '/games.json'); break; } catch (e) { await espera(200); }
    }
    const ws = new WebSocket(lista.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    let n = 0;
    const pendientes = {};
    ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (pendientes[d.id]) { pendientes[d.id](d); delete pendientes[d.id]; } });
    const cdp = (method, params) => new Promise((r) => { const id = ++n; pendientes[id] = r; ws.send(JSON.stringify({ id, method, params: params || {} })); });
    const evaluar = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.result.value;
    const abrir = async (ruta) => {
      await cdp('Page.navigate', { url: 'http://127.0.0.1:' + puerto + ruta });
      for (let i = 0; i < 50; i++) { await espera(150); if (await evaluate("document.readyState === 'complete' && !!document.querySelector('[data-seccion]')")) return true; }
      return false;
      async function evaluate(e) { return evaluar(e); }
    };
    await cdp('Page.enable');
    return await fn({ abrir, evaluar, origen: 'http://127.0.0.1:' + puerto });
  } finally {
    chrome.kill(); servidor.kill();
    await espera(300);
    fs.rmSync(perfil, { recursive: true, force: true });
  }
}

// Sets the app's saved state for the next load: language, character, unlocks and coins
const preparar = (o) => `(() => { localStorage.clear();
  localStorage.setItem('chogan.app.settings', JSON.stringify(Object.assign({ lang: '${o.lang || 'es'}', welcomed: true }, ${JSON.stringify(o.settings || {})})));
  localStorage.setItem('chogan.app.unlocks', JSON.stringify(${JSON.stringify(o.unlocks || [])}));
  localStorage.setItem('chogan.app.coins', '${o.monedas === undefined ? 100 : o.monedas}'); return true; })()`;

async function testPagina() {
  head('La página «Mi compañero» en el navegador');
  if (!fs.existsSync(PAGINA)) return ok(false, 'la página no existe todavía');
  await navegador(async ({ abrir, evaluar }) => {
    await abrir('/games/companero/index.html');
    await evaluar(preparar({ unlocks: ['mascot.owl'], monedas: 100 }));
    ok(await abrir('/games/companero/index.html'), 'la página carga y dibuja sus regiones');
    const r = await evaluar(`(() => { const s = [...document.querySelectorAll('[data-seccion]')];
      return { todas: s.map((x) => x.dataset.seccion).sort().join(), visibles: s.filter((x) => !x.hidden).map((x) => x.dataset.seccion).join(),
        compa: !!document.querySelector('.cp-compa svg'), animales: [...document.querySelectorAll('[data-animal]')].map((b) => b.dataset.animal).join(),
        equipado: (document.querySelector('[data-animal][aria-pressed="true"]') || {}).dataset?.animal,
        foco: [...document.querySelectorAll('[data-seccion]:not([hidden]) button')].every((b) => b.tabIndex >= 0 && !b.disabled) }; })()`);
    ok(r.todas === 'animales,colores,cuidado,ropa', 'hay cuatro regiones identificables: animales, colores, ropa y cuidado');
    ok(r.visibles === 'animales', 'solo animales está visible; las demás esperan a su issue');
    ok(r.compa, 'se ve el compañero equipado');
    ok(r.animales === 'capybara,fox,owl,cat,bear,conejo,panda,nutria', 'muestra los ocho animales, el capibara primero');
    ok(await evaluar(`[...document.querySelectorAll('[data-animal][data-tiene="1"]')].map((b) => b.dataset.animal).join()`) === 'capybara,fox,owl', 'son del jugador: el capibara (gratis), el zorro (siempre) y el búho (lo desbloqueó)');
    ok(r.foco, 'todos los botones visibles se alcanzan con el teclado');
    await evaluar(`document.querySelector('[data-animal="owl"]').click()`);
    await abrir('/games/companero/index.html');
    ok(await evaluar(`document.querySelector('[data-animal="owl"]').getAttribute('aria-pressed') === 'true'`), 'elegir el búho lo equipa y la elección persiste al recargar');
    ok(await evaluar(`JSON.parse(localStorage.getItem('chogan.app.unlocks')).join() === 'mascot.owl'`), 'elegir no toca los desbloqueos del núcleo');
    ok(!(await evaluar(`!!document.querySelector('[data-estado="sin-monedas"]:not([hidden])')`)), 'con monedas, no aparece el aviso de sin monedas');

    await evaluar(preparar({ monedas: 0 }));
    await abrir('/games/companero/index.html');
    ok(await evaluar(`!!document.querySelector('[data-estado="sin-monedas"]:not([hidden])')`), 'sin monedas, aparece su aviso');

    await evaluar(preparar({ lang: 'fa', monedas: 5 }));
    await abrir('/games/companero/index.html');
    const fa = await evaluar(`({ dir: document.documentElement.dir, titulo: (document.querySelector('.ch-gamebar__title') || {}).textContent })`);
    const g = entradas().find((x) => x.id === 'companero');
    ok(fa.dir === 'rtl' && fa.titulo === g.name.fa, 'en persa la página va de derecha a izquierda, con su nombre persa');
  });
}

// Waits inside the page, so a dialog or a toast has time to appear
const pausa = (ms) => `new Promise((r) => setTimeout(() => r(true), ${ms}))`;
const aceptar = `(() => { const b = [...document.querySelectorAll('.ch-scrim button')].find((x) => /primary/.test(x.className)); if (b) b.click(); return !!b; })()`;

async function testAnimales() {
  head('Los ocho animales: comprar, saldo insuficiente y los del núcleo (#6)');
  if (!fs.existsSync(PAGINA)) return ok(false, 'la página no existe todavía');
  await navegador(async ({ abrir, evaluar }) => {
    await abrir('/games/companero/index.html');
    await evaluar(preparar({ unlocks: [], monedas: 200 }));
    await abrir('/games/companero/index.html');
    const precio = await evaluar(`(document.querySelector('[data-animal="conejo"] [data-precio]') || {}).textContent || ''`);
    ok(/180/.test(precio), 'el conejo, que no se tiene, muestra su precio (180)');
    ok(await evaluar(`!!document.querySelector('[data-animal="owl"][data-bloqueado="perfil"]')`), 'el búho del núcleo, sin desbloquear, aparece bloqueado y remite al perfil');

    await evaluar(`document.querySelector('[data-animal="conejo"]').click()`);
    await evaluar(pausa(300));
    ok(await evaluar(`!!document.querySelector('.ch-scrim')`), 'tocar el conejo pide confirmación');
    ok(await evaluar(aceptar), 'se acepta la compra');
    await evaluar(pausa(300));
    const tras = await evaluar(`({ monedas: +localStorage.getItem('chogan.app.coins'), tiene: document.querySelector('[data-animal="conejo"]').dataset.tiene, puesto: document.querySelector('[data-animal="conejo"]').getAttribute('aria-pressed') })`);
    ok(tras.monedas === 20 && tras.tiene === '1' && tras.puesto === 'true', 'el conejo cuesta 180 una sola vez (200 → 20), queda del jugador y equipado');
    await abrir('/games/companero/index.html');
    ok(await evaluar(`document.querySelector('[data-animal="conejo"]').getAttribute('aria-pressed') === 'true' && +localStorage.getItem('chogan.app.coins') === 20`), 'la compra y la elección persisten al recargar');

    await evaluar(`document.querySelector('[data-animal="panda"]').click()`);
    await evaluar(pausa(300));
    const sin = await evaluar(`({ dialogo: !!document.querySelector('.ch-scrim'), monedas: +localStorage.getItem('chogan.app.coins'), aviso: (document.querySelector('.ch-toast, [class*="toast"]') || {}).textContent || '' })`);
    ok(!sin.dialogo && sin.monedas === 20, 'sin saldo para el panda (260), no hay compra ni cobro');
    ok(/240/.test(sin.aviso), 'el aviso dice cuánto falta (240 monedas)');

    await evaluar(`document.querySelector('[data-animal="owl"]').click()`);
    await evaluar(pausa(300));
    ok(await evaluar(`!document.querySelector('.ch-scrim') && JSON.parse(localStorage.getItem('chogan.app.unlocks')).length === 0 && +localStorage.getItem('chogan.app.coins') === 20`), 'el búho del núcleo no se compra aquí: sin diálogo, sin cobro y sin tocar los desbloqueos');

    await evaluar(`document.querySelector('[data-animal="capybara"]').click()`);
    ok(await evaluar(`document.querySelector('[data-animal="capybara"]').getAttribute('aria-pressed') === 'true' && +localStorage.getItem('chogan.app.coins') === 20`), 'el capibara se elige gratis');
  });
  const html = fs.readFileSync(PAGINA, 'utf8');
  ok(!/coins\.add|achievements\.unlock/.test(html), 'la página nunca suma monedas ni da logros: ningún animal es una ventaja');
}

function testEstados() {
  head('Los textos de los cuatro estados, en los cinco idiomas');
  if (!fs.existsSync(PAGINA)) return ok(false, 'la página no existe todavía');
  const html = fs.readFileSync(PAGINA, 'utf8');
  const bloque = (html.match(/\/\* ==== TEXTOS START ==== \*\/([\s\S]*?)\/\* ==== TEXTOS END ==== \*\//) || [])[1];
  ok(!!bloque, 'la página marca sus textos entre TEXTOS START y TEXTOS END');
  if (!bloque) return;
  const T = vm.runInNewContext('(' + bloque.slice(bloque.indexOf('{'), bloque.lastIndexOf('}') + 1) + ')');
  const claves = ['cargando', 'vacio', 'sinMonedas', 'equipado'];
  for (const l of ['fa', 'en', 'zh', 'de', 'es']) ok(claves.every((k) => typeof T[l][k] === 'string' && T[l][k].length > 2), l + ': los cuatro estados tienen texto');
  ok(/juega/i.test(T.es.sinMonedas) && /play/i.test(T.en.sinMonedas), 'sin monedas dice qué hacer: jugar para ganarlas');
}

/* ------------------------------------------------ run */

const GROUPS = [...fs.readFileSync(__filename, 'utf8').matchAll(/^(?:async )?function (test[A-Za-z0-9]+)\(\) \{/gm)].map((m) => m[1]);
(async () => {
for (const name of GROUPS) await eval(name)();
console.log(`\n${fails ? '✗ ' + fails + ' de ' + checks + ' comprobaciones fallaron' : 'Compañero: las ' + checks + ' comprobaciones en verde'}`);
process.exit(fails ? 1 : 0);
})();
