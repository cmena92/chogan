/* Capybara's companion: dressing it (epic #2, #8 and #16).
   One source for the app and for design/companero/prendas.mjs, which measures the 56 animal and
   garment pairs in Chrome. Pure string work on an SVG, no DOM: the garments, the catalogue and
   the anchors come in as `datos`. Capes go behind the body, sweaters over the belly and under
   the arms, everything else over the face, and the glasses last. An unknown garment is skipped. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CompaneroPrendas = factory();
})(this, function () {
  'use strict';

  function buscar(lista, id) {
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
    return null;
  }

  // The glasses follow each animal's eyes: one ring per eye, 3.5 units wider than the eye
  function lentes(o) {
    var R = o.r + 3.5;
    var puente = o.der - o.izq - 2 * R > 0 ? '<path d="M' + (o.izq + R) + ' ' + o.y + 'H' + (o.der - R) + '" fill="none"/>' : '';
    return '<g data-prenda="lentes" fill="rgba(255,255,255,0.18)" stroke="#2C2620" stroke-width="2.5"><circle cx="' + o.izq + '" cy="' + o.y + '" r="' + R + '"/><circle cx="' + o.der + '" cy="' + o.y + '" r="' + R + '"/>' + puente + '</g>';
  }

  function colocar(animal, prenda, capa, datos) {
    var a = datos.anclajes[animal];
    var p = buscar(datos.catalogo, prenda);
    if (p.anclaje === 'ojos') return capa === 'frente' ? lentes(a.ojos) : '';
    var punto = a[p.espacio];
    var aj = (a.ajustes && a.ajustes[p.espacio]) || {};
    var dibujo = datos.piezas[prenda][capa];
    if (!dibujo) return '';
    return '<g data-prenda="' + prenda + '" transform="translate(' + punto.x + ' ' + (punto.y + (aj.dy || 0)) + ') scale(' + (aj.escala || 1) + ')">' + dibujo + '</g>';
  }

  // datos: { catalogo: [{ id, espacio, anclaje? }], piezas: { id: { frente, atras } }, anclajes: { animal: {...} } }
  function componer(svg, animal, prendas, datos) {
    if (!datos.anclajes[animal]) return svg;
    prendas = (prendas || []).filter(function (id) { return !!buscar(datos.catalogo, id) && !!datos.piezas[id]; });
    var espacio = function (id) { return buscar(datos.catalogo, id).espacio; };
    var esSueter = function (id) { return espacio(id) === 'cuerpo' && !datos.piezas[id].atras; };
    var atras = prendas.map(function (id) { return colocar(animal, id, 'atras', datos); }).join('');
    var sueter = prendas.filter(esSueter).map(function (id) { return colocar(animal, id, 'frente', datos); }).join('');
    var frente = prendas
      .filter(function (id) { return !esSueter(id); })
      .sort(function (x, y) { return (x === 'lentes') - (y === 'lentes'); })
      .map(function (id) { return colocar(animal, id, 'frente', datos); })
      .join('');
    svg = svg.replace('<g id="cuerpo">', atras + '<g id="cuerpo">');
    svg = svg.replace('<g id="brazos">', sueter + '<g id="brazos">');
    return svg.replace(/<\/svg>\s*$/, frente + '</svg>\n');
  }

  return { componer: componer };
});
