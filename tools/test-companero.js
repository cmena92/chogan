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

/* ------------------------------------------------ run */

const GROUPS = [...fs.readFileSync(__filename, 'utf8').matchAll(/^function (test[A-Za-z0-9]+)\(\) \{/gm)].map((m) => m[1]);
for (const name of GROUPS) eval(name)();
console.log(`\n${fails ? '✗ ' + fails + ' de ' + checks + ' comprobaciones fallaron' : 'Compañero: las ' + checks + ' comprobaciones en verde'}`);
process.exit(fails ? 1 : 0);
