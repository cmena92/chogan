/* Capybara's companion: care, the bond and kind wishes (epic #2, #9).
   «Wishes, never needs»: the companion can want things, but nothing gets worse with time, nothing
   is lost by not opening the app, and fulfilling a wish is always optional. Pure logic, like the
   economy: the storage, the economy, the clock and the dice come in as parameters. It keeps its
   own key, «cuidado», next to the economy's «inventario». */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CompaneroCuidado = factory();
})(this, function () {
  'use strict';

  var VERSION = 1;
  // The wishes of #9 and the foods of #32, in order; each says what fulfils it
  var DESEOS = [
    { id: 'fruta', usar: 'fruta' },
    { id: 'zanahoria', usar: 'zanahoria' },
    { id: 'pastel', usar: 'pastel' },
    { id: 'sandia', usar: 'sandia' },
    { id: 'galleta', usar: 'galleta' },
    { id: 'helado', usar: 'helado' },
    { id: 'te', usar: 'te' },
    { id: 'banio', usar: 'jabon' },
    { id: 'ropa', equipar: 'prenda' },
    { id: 'jugar', acciones: ['jugar'] },
    { id: 'caricias', acciones: ['acariciar', 'cepillar'] }
  ];
  var ACCIONES = ['acariciar', 'cepillar', 'jugar'];
  // A wish is first a kind, all as likely, then which food: seven foods do not crowd out the rest
  var COMIDAS = DESEOS.filter(function (d) { return d.usar && d.usar !== 'jabon'; }).map(function (d) { return d.id; });
  var TIPOS = [COMIDAS, ['banio'], ['ropa'], ['jugar'], ['caricias']];
  var NIVELES = [0, 10, 25, 50, 100];
  var MAXIMO = 100;
  var POR_CUIDADO = 1, POR_DESEO = 3;
  // the same free action adds to the bond at most once in this long; it is never blocked
  var ESPERA_MS = 30000;

  function vacio() { return { version: VERSION, puntos: 0, ultimas: {}, deseo: null, ultimoDeseo: null }; }
  function sano(d) {
    return !!d && typeof d === 'object' && d.version === VERSION && typeof d.puntos === 'number' && d.puntos >= 0 &&
      !!d.ultimas && typeof d.ultimas === 'object';
  }
  function buscar(id) {
    for (var i = 0; i < DESEOS.length; i++) if (DESEOS[i].id === id) return DESEOS[i];
    return null;
  }
  function cumple(deseo, ev) {
    var d = buscar(deseo.id);
    if (!d) return false;
    if (d.usar) return ev.usar === d.usar;
    if (d.equipar) return ev.equipar === d.equipar;
    return !!ev.accion && d.acciones.indexOf(ev.accion) >= 0;
  }

  // opts: store {get, set}, economia (economia.js), ahora() -> ms, azar() -> [0, 1)
  function crear(opts) {
    var store = opts.store, eco = opts.economia;
    var ahora = opts.ahora || function () { return Date.now(); };
    var azar = opts.azar || Math.random;
    var d = store.get('cuidado', null);
    if (!sano(d)) d = vacio();
    function guardar() { store.set('cuidado', d); }

    // A visit is each time the space opens: one wish, never the same as the last visit's
    function visitar() {
      var x = Math.min(0.999999, Math.max(0, azar())) * TIPOS.length;
      var tipo = TIPOS[Math.floor(x)];
      var id = tipo[Math.min(tipo.length - 1, Math.floor((x - Math.floor(x)) * tipo.length))];
      var i = DESEOS.indexOf(buscar(id));
      if (DESEOS[i].id === d.ultimoDeseo) i = (i + 1) % DESEOS.length;
      d.deseo = { id: DESEOS[i].id, cumplido: false };
      d.ultimoDeseo = DESEOS[i].id;
      guardar();
      return deseo();
    }
    function deseo() { return d.deseo ? { id: d.deseo.id, cumplido: !!d.deseo.cumplido } : null; }

    // Something the player did for the companion: { accion }, { usar } or { equipar }
    function hecho(ev) {
      var suma = 0, t = ahora();
      if (ev.accion) {
        if (ACCIONES.indexOf(ev.accion) < 0) return { ok: false };
        var antes = d.ultimas[ev.accion];
        if (typeof antes !== 'number' || t - antes >= ESPERA_MS || t < antes) { suma += POR_CUIDADO; d.ultimas[ev.accion] = t; }
      } else if (ev.usar) suma += POR_CUIDADO;
      var cumplio = !!(d.deseo && !d.deseo.cumplido && cumple(d.deseo, ev));
      if (cumplio) { d.deseo.cumplido = true; suma += POR_DESEO; }
      d.puntos = Math.min(MAXIMO, d.puntos + suma);
      guardar();
      return { ok: true, suma: suma, cumplioDeseo: cumplio };
    }

    // Feeding or a bubble bath: uses one unit from the economy, then counts as care
    function alimentar(id) {
      var r = eco.usar(id);
      if (!r.ok) return { ok: false, motivo: r.motivo };
      return hecho({ usar: id });
    }

    function vinculo() {
      var nivel = 0;
      for (var i = 0; i < NIVELES.length; i++) if (d.puntos >= NIVELES[i]) nivel = i + 1;
      return { puntos: d.puntos, nivel: nivel, niveles: NIVELES.length, maximo: MAXIMO };
    }

    // The face on opening depends only on the visit's wish, never on time away
    function expresionAlAbrir() { return d.deseo && !d.deseo.cumplido ? 'antojado' : 'contento'; }

    return { visitar: visitar, deseo: deseo, hecho: hecho, alimentar: alimentar, vinculo: vinculo, expresionAlAbrir: expresionAlAbrir };
  }

  return { VERSION: VERSION, DESEOS: DESEOS, ACCIONES: ACCIONES, NIVELES: NIVELES, MAXIMO: MAXIMO, crear: crear };
});
