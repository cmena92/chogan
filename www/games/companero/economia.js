/* Capybara's companion: the economy and the inventory (epic #2, #3).
   Pure logic, like a game engine (NEW_GAME.md): the storage, the coin API and the core's state
   come in as parameters, so it runs the same in the app and in Node (tools/test-companero.js).
   It only spends coins through the core's API and never writes the core's own state. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CompaneroEconomia = factory();
})(this, function () {
  'use strict';

  var VERSION = 1;
  // Prices from #6, #7 (the art of #17), #8 (the art of #16) and #9
  var CATALOGO = [
    { id: 'capybara', tipo: 'animal', precio: 0 },
    { id: 'conejo', tipo: 'animal', precio: 180 },
    { id: 'panda', tipo: 'animal', precio: 260 },
    { id: 'nutria', tipo: 'animal', precio: 340 },
    { id: 'natural', tipo: 'diseno', precio: 0 },
    { id: 'medianoche', tipo: 'diseno', precio: 120 },
    { id: 'arcoiris', tipo: 'diseno', precio: 150 },
    { id: 'manchitas', tipo: 'diseno', precio: 180 },
    { id: 'rayas', tipo: 'diseno', precio: 180 },
    { id: 'dorado', tipo: 'diseno', precio: 300 },
    { id: 'gorra', tipo: 'prenda', espacio: 'cabeza', precio: 90 },
    { id: 'corona', tipo: 'prenda', espacio: 'cabeza', precio: 220 },
    { id: 'lentes', tipo: 'prenda', espacio: 'cabeza', precio: 140 },
    { id: 'lazo', tipo: 'prenda', espacio: 'cuello', precio: 80 },
    { id: 'panuelo', tipo: 'prenda', espacio: 'cuello', precio: 110 },
    { id: 'sueter', tipo: 'prenda', espacio: 'cuerpo', precio: 180 },
    { id: 'capa', tipo: 'prenda', espacio: 'cuerpo', precio: 240 },
    { id: 'fruta', tipo: 'consumible', precio: 5 },
    { id: 'zanahoria', tipo: 'consumible', precio: 8 },
    { id: 'pastel', tipo: 'consumible', precio: 15 },
    { id: 'sandia', tipo: 'consumible', precio: 6 },
    { id: 'galleta', tipo: 'consumible', precio: 7 },
    { id: 'helado', tipo: 'consumible', precio: 12 },
    { id: 'te', tipo: 'consumible', precio: 9 },
    { id: 'jabon', tipo: 'consumible', precio: 10 }
  ].map(function (a) { a.estado = 'activo'; return a; });

  // The core's own characters: owned through its shop, read here and never written
  var NUCLEO = ['fox', 'owl', 'cat', 'bear'];
  var DOBLE_MS = 400;
  var MAX_MOVIMIENTOS = 200;

  function articulo(id) {
    for (var i = 0; i < CATALOGO.length; i++) if (CATALOGO[i].id === id) return CATALOGO[i];
    return null;
  }

  function vacio(nucleo) {
    var m = nucleo && nucleo.mascot;
    return {
      version: VERSION,
      permanentes: [],
      consumibles: {},
      equipado: { animal: NUCLEO.indexOf(m) >= 0 ? m : 'fox', diseno: 'natural', prendas: {} },
      movimientos: []
    };
  }

  // Saved data of an unknown version or a broken shape starts over; the coins are not touched
  function sano(d) {
    return !!d && typeof d === 'object' && d.version === VERSION && Array.isArray(d.permanentes) &&
      !!d.consumibles && typeof d.consumibles === 'object' && !Array.isArray(d.consumibles) &&
      !!d.equipado && typeof d.equipado === 'object' && Array.isArray(d.movimientos);
  }

  // opts: store {get, set}, coins {can, spend}, nucleo() -> {unlocks, mascot}, ahora() -> ms
  function crear(opts) {
    var store = opts.store, coins = opts.coins;
    var nucleo = opts.nucleo || function () { return { unlocks: [], mascot: 'fox' }; };
    var ahora = opts.ahora || function () { return Date.now(); };
    var datos = store.get('inventario', null);
    if (!sano(datos)) datos = vacio(nucleo());
    if (!datos.equipado.prendas || typeof datos.equipado.prendas !== 'object') datos.equipado.prendas = {};
    var ultima = null;

    function guardar() { store.set('inventario', datos); }
    function anotar(tipo, item, cantidad) {
      datos.movimientos.push({ tipo: tipo, item: item, cantidad: cantidad, fecha: new Date(ahora()).toISOString() });
      if (datos.movimientos.length > MAX_MOVIMIENTOS) datos.movimientos = datos.movimientos.slice(-MAX_MOVIMIENTOS);
    }

    function poseido(id) {
      if (NUCLEO.indexOf(id) >= 0) {
        var u = (nucleo() || {}).unlocks || [];
        return id === 'fox' || u.indexOf('mascot.' + id) >= 0;
      }
      var a = articulo(id);
      if (!a || a.tipo === 'consumible') return false;
      return a.precio === 0 || datos.permanentes.indexOf(id) >= 0;
    }

    function cantidad(id) {
      var n = datos.consumibles[id];
      return typeof n === 'number' && n > 0 ? Math.floor(n) : 0;
    }

    function comprar(id) {
      if (NUCLEO.indexOf(id) >= 0) return { ok: false, motivo: 'nucleo' };
      var a = articulo(id);
      if (!a || a.estado !== 'activo') return { ok: false, motivo: 'desconocido' };
      // something already owned is never charged again, so that answer comes before the double tap
      if (a.tipo !== 'consumible' && poseido(id)) return { ok: true, yaTenia: true };
      var t = ahora();
      if (ultima && ultima.id === id && t - ultima.t < DOBLE_MS) return { ok: false, motivo: 'doble' };
      if (a.precio > 0 && !coins.spend(a.precio)) return { ok: false, motivo: 'saldo' };
      if (a.tipo === 'consumible') datos.consumibles[id] = cantidad(id) + 1;
      else datos.permanentes.push(id);
      anotar('compra', id, a.precio);
      guardar();
      ultima = { id: id, t: t };
      return { ok: true };
    }

    function usar(id) {
      var a = articulo(id);
      if (!a || a.tipo !== 'consumible' || cantidad(id) < 1) return { ok: false, motivo: 'sin unidades' };
      datos.consumibles[id] = cantidad(id) - 1;
      anotar('uso', id, 1);
      guardar();
      return { ok: true };
    }

    function equipar(id) {
      if (!poseido(id)) return { ok: false, motivo: 'no lo tiene' };
      var a = articulo(id);
      if (NUCLEO.indexOf(id) >= 0 || (a && a.tipo === 'animal')) datos.equipado.animal = id;
      else if (a.tipo === 'diseno') datos.equipado.diseno = id;
      else if (a.tipo === 'prenda') datos.equipado.prendas[a.espacio] = id;
      else return { ok: false, motivo: 'no se equipa' };
      guardar();
      return { ok: true };
    }

    function quitar(espacio) {
      delete datos.equipado.prendas[espacio];
      guardar();
      return { ok: true };
    }

    function equipado() { return JSON.parse(JSON.stringify(datos.equipado)); }

    return { poseido: poseido, cantidad: cantidad, comprar: comprar, usar: usar, equipar: equipar, quitar: quitar, equipado: equipado };
  }

  return { VERSION: VERSION, CATALOGO: CATALOGO, crear: crear };
});
