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
  ok(['games/companero/economia.js', 'games/companero/arte.js', 'games/companero/disenos.js', 'games/companero/prendas.js', 'games/companero/expresiones.js', 'games/companero/cuidado.js'].every((f) => g.files.includes(f) && fs.existsSync(path.join(ROOT, 'www', f))), 'files lista todos los módulos del compañero, y existen: el service worker los guarda');
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

function testDisenosFuente() {
  head('Los diseños: una sola fuente para la app y el arte (#7)');
  const D = path.join(ROOT, 'www/games/companero/disenos.js');
  const A = fs.existsSync(ARTE) ? require(ARTE) : null;
  ok(fs.existsSync(D), 'www/games/companero/disenos.js existe');
  if (!fs.existsSync(D) || !A || !A.disenos) return ok(false, 'arte.js trae los datos de los diseños');
  const json = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/companero/disenos.json'), 'utf8')).disenos;
  const anc = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/companero/anclajes.json'), 'utf8')).animales;
  ok(JSON.stringify(A.disenos.disenos) === JSON.stringify(json), 'arte.js trae los mismos diseños que design/companero/disenos.json');
  ok(Object.keys(anc).every((id) => JSON.stringify(A.disenos.colores[id]) === JSON.stringify(anc[id].colores)), 'y los mismos colores de cada animal');
  // the app's own code gives, byte for byte, the 48 pairs the design checks approved (#17)
  const { aplicar } = require(D);
  const dir = path.join(ROOT, 'design/companero/disenos');
  let iguales = 0, total = 0;
  for (const id of Object.keys(A.cuerpos)) for (const d of json) {
    total++;
    if (aplicar(A.cuerpos[id], id, d.id, A.disenos) === fs.readFileSync(path.join(dir, id + '-' + d.id + '.svg'), 'utf8')) iguales++;
  }
  ok(total === 48 && iguales === 48, 'la app dibuja las 48 combinaciones idénticas a las aprobadas en design/companero/disenos/ (' + iguales + ' de ' + total + ')');
  ok(aplicar(A.cuerpos.fox, 'fox', 'inexistente', A.disenos) === A.cuerpos.fox, 'un diseño desconocido deja al animal en Natural');
}

async function testDisenosPagina() {
  head('Diseños en la página: comprar, ver, cambiar de animal (#7)');
  if (!fs.existsSync(PAGINA)) return ok(false, 'la página no existe todavía');
  await navegador(async ({ abrir, evaluar }) => {
    await abrir('/games/companero/index.html');
    await evaluar(preparar({ monedas: 300, settings: { palette: 'sea' } }));
    await abrir('/games/companero/index.html');
    ok(await evaluar(`[...document.querySelectorAll('[data-diseno]')].map((b) => b.dataset.diseno).join()`) === 'natural,medianoche,arcoiris,manchitas,rayas,dorado', 'la región de colores muestra los seis diseños');
    ok(await evaluar(`document.querySelector('[data-diseno="natural"]').dataset.tiene === '1' && document.querySelector('[data-diseno="natural"]').getAttribute('aria-pressed') === 'true'`), 'Natural es de todos y está en uso');
    ok(/120/.test(await evaluar(`(document.querySelector('[data-diseno="medianoche"] [data-precio]') || {}).textContent || ''`)), 'Medianoche muestra su precio (120)');
    await evaluar(`document.querySelector('[data-diseno="medianoche"]').click()`);
    await evaluar(pausa(300));
    ok(await evaluar(aceptar), 'comprar Medianoche pide confirmación y se acepta');
    await evaluar(pausa(300));
    ok(await evaluar(`+localStorage.getItem('chogan.app.coins') === 180 && /#7880DD/i.test(document.querySelector('.cp-compa').innerHTML)`), 'cuesta 120 una vez (300 → 180) y el compañero se ve en Medianoche');
    await evaluar(`document.querySelector('[data-animal="capybara"]').click()`);
    ok(await evaluar(`/#7880DD/i.test(document.querySelector('.cp-compa').innerHTML) && document.querySelector('[data-diseno="medianoche"]').getAttribute('aria-pressed') === 'true'`), 'al cambiar al capibara, el diseño se conserva');
    await abrir('/games/companero/index.html');
    ok(await evaluar(`/#7880DD/i.test(document.querySelector('.cp-compa').innerHTML) && +localStorage.getItem('chogan.app.coins') === 180`), 'el diseño y la compra persisten al recargar');
    await evaluar(`document.querySelector('[data-diseno="medianoche"]').click()`);
    await evaluar(pausa(200));
    ok(await evaluar(`!document.querySelector('.ch-scrim') && +localStorage.getItem('chogan.app.coins') === 180`), 'tocar un diseño que ya se tiene no cobra ni pregunta');
    ok(await evaluar(`JSON.parse(localStorage.getItem('chogan.app.settings')).palette === 'sea'`), 'la paleta del menú no cambia');
    await evaluar(`document.querySelector('[data-diseno="dorado"]').click()`);
    await evaluar(pausa(300));
    ok(await evaluar(`!document.querySelector('.ch-scrim') && +localStorage.getItem('chogan.app.coins') === 180`), 'sin saldo para Dorado (300), no hay compra ni cobro');
  });
}

async function testPrendasFuente() {
  head('La ropa: una sola fuente para la app y el arte (#8)');
  const P = path.join(ROOT, 'www/games/companero/prendas.js');
  const A = fs.existsSync(ARTE) ? require(ARTE) : null;
  ok(fs.existsSync(P), 'www/games/companero/prendas.js existe');
  if (!fs.existsSync(P) || !A || !A.prendas) return ok(false, 'arte.js trae los datos de la ropa');
  const diseno = await import(path.join(ROOT, 'design/companero/prendas.mjs'));
  ok(JSON.stringify(A.prendas) === JSON.stringify(diseno.datosPrendas), 'arte.js trae las mismas prendas, catálogo y anclajes que design/companero/');
  const { componer } = require(P);
  let iguales = 0, total = 0;
  for (const id of Object.keys(A.cuerpos)) for (const p of A.prendas.catalogo) {
    total++;
    if (componer(A.cuerpos[id], id, [p.id], A.prendas) === diseno.componer(id, [p.id])) iguales++;
  }
  ok(total === 56 && iguales === 56, 'la app viste las 56 combinaciones igual que el arte que mide Chrome (' + iguales + ' de ' + total + ')');
  const solo = componer(A.cuerpos.fox, 'fox', [], A.prendas);
  ok(componer(A.cuerpos.fox, 'fox', ['dragon', 'gorra'], A.prendas) === componer(A.cuerpos.fox, 'fox', ['gorra'], A.prendas) && componer(A.cuerpos.fox, 'fox', ['dragon'], A.prendas) === solo, 'una prenda desconocida se omite sin romper al animal');
}

async function testRopaPagina() {
  head('La ropa en la página: comprar, reemplazar, quitar, cambiar de animal (#8)');
  if (!fs.existsSync(PAGINA)) return ok(false, 'la página no existe todavía');
  await navegador(async ({ abrir, evaluar }) => {
    await abrir('/games/companero/index.html');
    await evaluar(preparar({ monedas: 500 }));
    await abrir('/games/companero/index.html');
    ok(await evaluar(`[...document.querySelectorAll('[data-espacio]')].map((g) => g.dataset.espacio).join()`) === 'cabeza,cuello,cuerpo', 'la ropa tiene los tres espacios: cabeza, cuello y cuerpo');
    ok(await evaluar(`[...document.querySelectorAll('[data-prenda-item]')].map((b) => b.dataset.prendaItem).join()`) === 'gorra,corona,lentes,lazo,panuelo,sueter,capa', 'aparecen las siete prendas');
    ok(await evaluar(`document.querySelectorAll('[data-ninguna]').length === 3`), 'cada espacio tiene su opción «Ninguna»');
    ok(/80/.test(await evaluar(`document.querySelector('[data-prenda-item="lazo"]').getAttribute('aria-label') || ''`)), 'el lector de pantalla anuncia el nombre y el precio de una prenda que no se tiene');

    const comprar = async (id) => { await evaluar(`document.querySelector('[data-prenda-item="${id}"]').click()`); await evaluar(pausa(250)); await evaluar(aceptar); await evaluar(pausa(250)); };
    await comprar('lazo');
    ok(await evaluar(`+localStorage.getItem('chogan.app.coins') === 420 && !!document.querySelector('.cp-compa [data-prenda="lazo"]')`), 'el lazo cuesta 80 una vez (500 → 420) y el compañero lo lleva puesto');
    await comprar('gorra');
    await comprar('corona');
    const cabeza = await evaluar(`({ monedas: +localStorage.getItem('chogan.app.coins'), corona: !!document.querySelector('.cp-compa [data-prenda="corona"]'), gorra: !!document.querySelector('.cp-compa [data-prenda="gorra"]'), lazo: !!document.querySelector('.cp-compa [data-prenda="lazo"]') })`);
    ok(cabeza.monedas === 110 && cabeza.corona && !cabeza.gorra && cabeza.lazo, 'una prenda por espacio: la corona reemplaza a la gorra y el lazo sigue (500 → 110)');
    await evaluar(`document.querySelector('[data-ninguna="cabeza"]').click()`);
    ok(await evaluar(`!document.querySelector('.cp-compa [data-prenda="corona"]') && !!document.querySelector('.cp-compa [data-prenda="lazo"]') && +localStorage.getItem('chogan.app.coins') === 110`), '«Ninguna» quita la de la cabeza, sin costo y sin tocar las demás');
    await evaluar(`document.querySelector('[data-prenda-item="gorra"]').click()`);
    await evaluar(pausa(200));
    ok(await evaluar(`!document.querySelector('.ch-scrim') && !!document.querySelector('.cp-compa [data-prenda="gorra"]') && +localStorage.getItem('chogan.app.coins') === 110`), 'volver a ponerse una prenda que ya se tiene no cobra ni pregunta');
    ok(/en uso/i.test(await evaluar(`document.querySelector('[data-prenda-item="gorra"]').getAttribute('aria-label') || ''`)), 'el lector de pantalla anuncia que la gorra está en uso');
    await evaluar(`document.querySelector('[data-animal="capybara"]').click()`);
    ok(await evaluar(`!!document.querySelector('.cp-compa [data-prenda="gorra"]') && !!document.querySelector('.cp-compa [data-prenda="lazo"]')`), 'al cambiar al capibara, el atuendo se conserva');
    await abrir('/games/companero/index.html');
    ok(await evaluar(`!!document.querySelector('.cp-compa [data-prenda="gorra"]') && !!document.querySelector('.cp-compa [data-prenda="lazo"]') && +localStorage.getItem('chogan.app.coins') === 110`), 'el atuendo y las compras persisten al recargar');
  });
}

/* ------------------------------------------------ care, kind wishes and expressions (#9) */

const CUIDADO = path.join(ROOT, 'www/games/companero/cuidado.js');
const K = fs.existsSync(CUIDADO) ? require(CUIDADO) : null;

// A companion with its economy and its care, over one store, with the clock and the dice in hand
function companero(o) {
  o = o || {};
  const x = nuevo({ saldo: o.saldo === undefined ? 500 : o.saldo, datos: o.datos });
  let t = o.t || 1e12;
  let dado = o.dado || (() => 0);
  const crearCuidado = () => K.crear({ store: x.s, economia: x.eco, ahora: () => t, azar: () => dado() });
  const c = crearCuidado();
  return Object.assign(x, { c, crearCuidado, pasar(ms) { t += ms; }, dado(f) { dado = f; } });
}

function testCuidadoLogica() {
  head('Cuidado: acciones, vínculo y deseos (#9)');
  ok(!!K && typeof K.crear === 'function', 'www/games/companero/cuidado.js exporta crear()');
  if (!K) return;
  ok(K.DESEOS.map((d) => d.id).join() === 'fruta,zanahoria,pastel,banio,ropa,jugar,caricias', 'los deseos son los de la tabla de #9');
  ok(K.NIVELES.join() === '0,10,25,50,100' && K.MAXIMO === 100, 'cinco niveles, a los 0, 10, 25, 50 y 100 puntos (el máximo)');

  const x = companero({ saldo: 100 });
  const r = x.c.hecho({ accion: 'acariciar' });
  ok(r.ok && x.c.vinculo().puntos === 1 && x.m.saldo() === 100, 'acariciar es gratis y suma 1 de vínculo');
  x.pasar(10 * 1000); x.c.hecho({ accion: 'acariciar' });
  ok(x.c.vinculo().puntos === 1, 'repetir la misma acción gratuita dentro de 30 s no vuelve a sumar');
  x.pasar(25 * 1000); x.c.hecho({ accion: 'acariciar' });
  ok(x.c.vinculo().puntos === 2, 'pasados 30 s, vuelve a sumar');
  x.c.hecho({ accion: 'cepillar' });
  ok(x.c.vinculo().puntos === 3, 'otra acción gratuita suma aparte');

  ok(!x.c.alimentar('zanahoria').ok, 'sin zanahorias no se alimenta');
  x.eco.comprar('zanahoria');
  ok(x.m.saldo() === 92 && x.eco.cantidad('zanahoria') === 1, 'comprar una zanahoria cuesta 8 y la suma al inventario');
  ok(x.c.alimentar('zanahoria').ok && x.eco.cantidad('zanahoria') === 0 && x.c.vinculo().puntos === 4, 'alimentar usa una unidad y suma 1 de vínculo');
}

function testDeseos() {
  head('Deseos amables: uno por visita, distinto, opcional');
  if (!K) return ok(false, 'sin módulo');
  const x = companero({ saldo: 100 });
  x.dado(() => 0.85); // the dice point at «jugar»
  const d1 = x.c.visitar();
  ok(d1 && d1.id === 'jugar' && !d1.cumplido, 'al abrir hay exactamente un deseo de la tabla (jugar)');
  const r = x.c.hecho({ accion: 'jugar' });
  ok(r.cumplioDeseo && x.c.vinculo().puntos === 4 && x.c.deseo().cumplido, 'cumplirlo suma 1 por el cuidado y 3 por el deseo');
  ok(!x.c.hecho({ accion: 'jugar' }).cumplioDeseo, 'un deseo se cumple una sola vez');
  const d2 = x.crearCuidado().visitar();
  ok(d2.id !== 'jugar', 'en la visita siguiente el deseo es otro, aunque el dado repita (' + d2.id + ')');

  const y = companero({ saldo: 100 });
  y.dado(() => 0.15); // «zanahoria»
  ok(y.c.visitar().id === 'zanahoria', 'un deseo de comida');
  y.eco.comprar('fruta'); y.pasar(500);
  ok(!y.c.alimentar('fruta').cumplioDeseo && !y.c.deseo().cumplido, 'otra comida no cumple el deseo de zanahoria');
  y.eco.comprar('zanahoria');
  ok(y.c.alimentar('zanahoria').cumplioDeseo, 'la zanahoria sí lo cumple');

  const z = companero(); z.dado(() => 0.6);
  ok(z.c.visitar().id === 'ropa' && z.c.hecho({ equipar: 'prenda' }).cumplioDeseo, 'equipar una prenda cumple el deseo de ropa');
  const w = companero(); w.dado(() => 0.45);
  ok(w.c.visitar().id === 'banio', 'el deseo del baño de burbujas');
  const sinCumplir = w.c.vinculo().puntos;
  w.crearCuidado().visitar();
  ok(w.c.vinculo().puntos === sinCumplir, 'no cumplir un deseo no cambia nada');
}

function testSinCastigo() {
  head('Sin castigo: el tiempo fuera no cambia nada');
  if (!K) return ok(false, 'sin módulo');
  const abrir = (ms) => {
    const x = companero({ saldo: 100 });
    x.c.visitar(); x.c.hecho({ accion: 'acariciar' }); x.c.hecho({ accion: 'jugar' });
    x.pasar(ms);
    x.dado(() => 0.3);
    const c = x.crearCuidado();
    const d = c.visitar();
    return JSON.stringify({ vinculo: c.vinculo(), deseo: d.id, expresion: c.expresionAlAbrir(), saldo: x.m.saldo() });
  };
  const sinAusencia = abrir(60 * 1000);
  for (const [nombre, ms] of [['1 hora', 36e5], ['30 días', 30 * 864e5], ['1 año', 365 * 864e5]]) {
    ok(abrir(ms) === sinAusencia, 'tras ' + nombre + ' fuera, vínculo, deseo, expresión y saldo son los mismos que sin ausencia');
  }
  const x = companero({ saldo: 1000 });
  for (let i = 0; i < 200; i++) { x.pasar(31 * 1000); x.c.hecho({ accion: ['acariciar', 'cepillar', 'jugar'][i % 3] }); }
  ok(x.c.vinculo().puntos === 100 && x.c.vinculo().nivel === 5, 'el vínculo llega a 100 (nivel 5 de 5) y no pasa de ahí');
  ok(x.c.expresionAlAbrir() === 'antojado' || x.c.expresionAlAbrir() === 'contento', 'al abrir, la expresión es antojado o contento: nunca dormido ni triste');
  ok(x.s.escritas.every((k) => k === 'inventario' || k === 'cuidado'), 'el cuidado guarda solo en su clave «cuidado» (bajo chogan.companero., que «Borrar todos los datos» elimina)');
}

function testExpresionesFuente() {
  head('Las expresiones: una sola fuente para la app y el arte (#9)');
  const X = path.join(ROOT, 'www/games/companero/expresiones.js');
  const A = fs.existsSync(ARTE) ? require(ARTE) : null;
  ok(fs.existsSync(X) && !!A && !!A.expresiones, 'expresiones.js existe y arte.js trae sus datos');
  if (!fs.existsSync(X) || !A || !A.expresiones) return;
  const { expresar, EXPRESIONES } = require(X);
  const dir = path.join(ROOT, 'design/companero/expresiones');
  let iguales = 0, total = 0;
  for (const id of Object.keys(A.cuerpos)) for (const e of EXPRESIONES) {
    total++;
    if (expresar(A.cuerpos[id], id, e, A.expresiones) === fs.readFileSync(path.join(dir, id + '-' + e + '.svg'), 'utf8')) iguales++;
  }
  ok(total === 40 && iguales === 40, 'la app dibuja las 40 expresiones idénticas a las aprobadas en design/companero/expresiones/ (' + iguales + ' de ' + total + ')');
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
    return await fn({ abrir, evaluar, cdp, origen: 'http://127.0.0.1:' + puerto });
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
    ok(r.visibles === 'animales,colores,ropa,cuidado', 'las cuatro regiones están visibles');
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

function testDeseosSinCarencia() {
  head('Ningún texto de deseo expresa carencia, en los cinco idiomas (#9)');
  if (!fs.existsSync(PAGINA)) return ok(false, 'la página no existe todavía');
  const html = fs.readFileSync(PAGINA, 'utf8');
  const bloque = (html.match(/\/\* ==== TEXTOS START ==== \*\/([\s\S]*?)\/\* ==== TEXTOS END ==== \*\//) || [])[1];
  const T = vm.runInNewContext('(' + bloque.slice(bloque.indexOf('{'), bloque.lastIndexOf('}') + 1) + ')');
  const PROHIBIDAS = {
    es: ['hambre', 'hambrient', 'triste', 'sucio', 'sucia', 'solo', 'sola', 'extraño', 'extrañ', 'abandon'],
    en: ['hungry', 'hunger', 'sad', 'dirty', 'lonely', 'alone', 'miss', 'starv', 'abandon'],
    de: ['hunger', 'hungrig', 'traurig', 'schmutzig', 'einsam', 'allein', 'vermiss'],
    zh: ['饿', '伤心', '难过', '脏', '孤单', '寂寞', '想你'],
    fa: ['گرسنه', 'غمگین', 'ناراحت', 'کثیف', 'تنها', 'دلتنگ'],
  };
  const claves = (K ? K.DESEOS.map((d) => 'deseo_' + d.id) : []).concat(['deseoCumplido']);
  for (const l of Object.keys(PROHIBIDAS)) {
    const textos = claves.map((k) => T[l] && T[l][k]);
    ok(textos.every((x) => typeof x === 'string' && x.length > 2), l + ': cada deseo tiene su texto');
    const malas = textos.filter((x) => typeof x === 'string' && PROHIBIDAS[l].some((p) => x.toLowerCase().includes(p)));
    ok(!malas.length, l + ': ningún deseo dice carencia' + (malas.length ? ' (' + malas.join(' | ') + ')' : ''));
  }
}

async function testCuidadoPagina() {
  head('Cuidado en la página: el globo, cuidar y cumplir el deseo (#9)');
  if (!fs.existsSync(PAGINA)) return ok(false, 'la página no existe todavía');
  await navegador(async ({ abrir, evaluar, cdp }) => {
    await abrir('/games/companero/index.html');
    await evaluar(preparar({ monedas: 300 }));
    await abrir('/games/companero/index.html');
    const inicio = await evaluar(`({ deseo: (document.querySelector('[data-deseo]') || {}).dataset?.deseo, texto: (document.querySelector('[data-deseo]') || {}).textContent, expr: document.querySelector('.cp-compa').dataset.expresion, vinculo: +document.querySelector('[data-vinculo]').dataset.vinculo })`);
    ok(!!inicio.deseo && inicio.texto.length > 5, 'al abrir hay un globo con un deseo (' + inicio.deseo + ')');
    ok(inicio.expr === 'antojado', 'mientras el deseo espera, el compañero está antojado');
    ok(await evaluar(`[...document.querySelectorAll('[data-accion]')].map((b) => b.dataset.accion).join()`) === 'acariciar,cepillar,jugar', 'tres acciones gratuitas: acariciar, cepillar y jugar');
    ok(await evaluar(`[...document.querySelectorAll('[data-consumible]')].map((b) => b.dataset.consumible).join()`) === 'fruta,zanahoria,pastel,jabon', 'cuatro consumibles: fruta, zanahoria, pastel y jabón');

    const libre = inicio.deseo === 'caricias' ? 'jugar' : 'acariciar';
    await evaluar(`document.querySelector('[data-accion="${libre}"]').click()`);
    const tras = await evaluar(`({ monedas: +localStorage.getItem('chogan.app.coins'), vinculo: +document.querySelector('[data-vinculo]').dataset.vinculo, expr: document.querySelector('.cp-compa').dataset.expresion })`);
    ok(tras.monedas === 300 && tras.vinculo === inicio.vinculo + 1 && tras.expr === 'feliz', 'una acción gratuita no cobra, suma 1 de vínculo y pone feliz al compañero');

    // fulfil whatever the visit wished for
    const cumplir = {
      fruta: ['consumible', 'fruta'], zanahoria: ['consumible', 'zanahoria'], pastel: ['consumible', 'pastel'], banio: ['consumible', 'jabon'],
      ropa: ['prenda-item', 'lazo'], jugar: ['accion', 'jugar'], caricias: ['accion', 'cepillar'],
    }[inicio.deseo];
    await evaluar(pausa(200));
    await evaluar(`document.querySelector('[data-${cumplir[0]}="${cumplir[1]}"]').click()`);
    await evaluar(pausa(250));
    if (await evaluar(`!!document.querySelector('.ch-scrim')`)) { await evaluar(aceptar); await evaluar(pausa(250)); }
    const fin = await evaluar(`({ cumplido: (document.querySelector('[data-deseo]') || {}).dataset?.cumplido, vinculo: +document.querySelector('[data-vinculo]').dataset.vinculo, expr: document.querySelector('.cp-compa').dataset.expresion })`);
    ok(fin.cumplido === '1' && fin.expr === 'feliz', 'cumplir el deseo (' + inicio.deseo + ') lo marca cumplido y pone feliz al compañero');
    ok(fin.vinculo >= tras.vinculo + 3, 'cumplir el deseo suma al menos 3 de vínculo (' + tras.vinculo + ' → ' + fin.vinculo + ')');

    await abrir('/games/companero/index.html');
    ok(await evaluar(`+document.querySelector('[data-vinculo]').dataset.vinculo`) === fin.vinculo, 'el vínculo persiste al recargar');
    const otra = await evaluar(`(document.querySelector('[data-deseo]') || {}).dataset?.deseo`);
    ok(otra && otra !== inicio.deseo, 'la visita siguiente trae otro deseo (' + otra + ')');

    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await abrir('/games/companero/index.html');
    await evaluar(`document.querySelector('[data-accion="cepillar"]').click()`);
    ok(await evaluar(`document.querySelector('.cp-compa').dataset.expresion === 'feliz' && !document.querySelector('.cp-compa .cp-salto, .cp-compa.cp-salto')`), 'con movimiento reducido, la reacción es la misma cara feliz, sin salto');
  });
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
